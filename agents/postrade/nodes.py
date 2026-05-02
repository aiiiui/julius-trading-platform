"""
Post-Trade Coach agent nodes.
Audits paper portfolio trade history against strategy signals and market regime.
"""
from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
import numpy as np

ROOT = Path(__file__).parent.parent.parent


# ── Node 1: Load and enrich trades ───────────────────────────────────────────

def load_trades(state: Dict[str, Any]) -> Dict[str, Any]:
    """
    Reads from state['trades'] (already loaded by API layer).
    Enriches each trade with regime label at trade time.
    """
    trades   = state.get("trades", [])
    regimes  = state.get("regime_labels", [])    # list of "calm"|"volatile" strings

    # Build a simple date→regime lookup from backtest cache if available
    regime_map: dict[str, str] = {}
    from data.vix import get_regime_labels
    try:
        today = datetime.now().strftime("%Y-%m-%d")
        series = get_regime_labels("2025-01-01", today)
        for dt, label in series.items():
            regime_map[str(dt)[:10]] = label
    except Exception:
        pass

    enriched = []
    for t in trades:
        date = str(t.get("date", ""))[:10]
        enriched.append({**t, "regime": regime_map.get(date, "unknown")})

    return {"trades": enriched}


# ── Node 2: Audit each decision ──────────────────────────────────────────────

def audit_decisions(state: Dict[str, Any]) -> Dict[str, Any]:
    trades  = state.get("trades", [])
    audits: list = []

    for i, t in enumerate(trades):
        action     = t.get("action", "")
        sym        = t.get("sym", "")
        pnl        = t.get("pnl")
        regime     = t.get("regime", "unknown")

        # Determine verdict based on available context
        # If there's a signal confidence stored, use it; otherwise infer
        confidence = t.get("signal_confidence", None)
        strategy   = t.get("strategy", "unknown")

        if confidence is None:
            # Infer from PnL pattern — no signal data stored for manual orders
            verdict = "no_signal"
            notes   = "Trade placed manually — no strategy signal data available."
        elif confidence >= 0.7:
            verdict = "sound"
            notes   = f"High-confidence signal ({confidence:.0%}). Execution aligned with strategy."
        elif confidence >= 0.5:
            verdict = "sound"
            notes   = f"Moderate-confidence signal ({confidence:.0%}). Acceptable entry."
        elif confidence >= 0.35:
            verdict = "deviation"
            notes   = f"Low-confidence signal ({confidence:.0%}). Entry likely premature."
        else:
            verdict = "deviation"
            notes   = f"Very low confidence ({confidence:.0%}). Execution did not meet strategy threshold."

        # Regime adjustment note
        if regime == "volatile" and action == "BUY":
            notes += " Note: market was in volatile regime — higher risk environment for long entries."

        audits.append({
            "trade_id":          i,
            "date":              t.get("date", ""),
            "sym":               sym,
            "action":            action,
            "price":             t.get("price", 0),
            "qty":               t.get("qty", 0),
            "pnl":               pnl,
            "strategy_signal":   strategy,
            "signal_confidence": confidence or 0.0,
            "regime":            regime,
            "verdict":           verdict,
            "notes":             notes,
        })

    return {"trade_audits": audits}


# ── Node 3: Loss autopsy ──────────────────────────────────────────────────────

def loss_autopsy(state: Dict[str, Any]) -> Dict[str, Any]:
    trades  = state.get("trades", [])
    audits  = state.get("trade_audits", [])
    losses: list = []

    # Build buy→sell pairs (round trips)
    by_sym: dict[str, list] = {}
    for t in trades:
        by_sym.setdefault(t.get("sym", ""), []).append(t)

    for sym, sym_trades in by_sym.items():
        buys  = [t for t in sym_trades if t.get("action") == "BUY"]
        sells = [t for t in sym_trades if t.get("action") == "SELL" and t.get("pnl") is not None]
        for sell in sells:
            pnl = sell.get("pnl", 0) or 0
            if pnl >= 0:
                continue    # only losing trades

            entry_price = sell.get("price", 0) - (pnl / (sell.get("qty", 1) or 1))
            exit_price  = sell.get("price", 0)
            pnl_pct     = (exit_price / entry_price - 1) * 100 if entry_price else 0

            # Determine root cause
            regime = sell.get("regime", "unknown")
            audit  = next((a for a in audits if a["sym"] == sym and a["action"] == "SELL"
                           and a["date"] == sell.get("date", "")), {})
            confidence = audit.get("signal_confidence", 0.5)

            if regime == "volatile":
                root_cause  = "regime_change"
                explanation = (f"{sym} was sold at a loss during a volatile VIX regime. "
                               "Mean-reversion and trend strategies underperform in high-VIX environments. "
                               "Consider pausing entries or using tighter stops when VIX > 20.")
            elif confidence < 0.4:
                root_cause  = "poor_entry"
                explanation = (f"Entry into {sym} was taken on a weak signal ({confidence:.0%} confidence). "
                               "The strategy threshold may need raising to filter out noise.")
            elif abs(pnl_pct) > 10:
                root_cause  = "stop_ignored"
                explanation = (f"{sym} declined {abs(pnl_pct):.1f}% before exit. "
                               "A hard stop-loss at 5–8% would have limited this drawdown significantly.")
            else:
                root_cause  = "indicator_lag"
                explanation = (f"Loss on {sym} appears to stem from indicator lag — "
                               "the exit signal arrived after the peak drawdown had occurred.")

            losses.append({
                "sym":        sym,
                "entry_date": buys[-1].get("date", "") if buys else "",
                "exit_date":  sell.get("date", ""),
                "pnl":        round(pnl, 2),
                "pnl_pct":   round(pnl_pct, 2),
                "root_cause": root_cause,
                "explanation": explanation,
            })

    return {"losing_trades": losses}


# ── Node 4: Drift detection ───────────────────────────────────────────────────

def detect_drift(state: Dict[str, Any]) -> Dict[str, Any]:
    params  = state.get("backtest_params", {})
    trades  = state.get("trades", [])
    flags: list = []

    if not params or not trades:
        return {"drift_flags": []}

    # Check trade frequency drift (backtested vs live)
    bt_n_trades   = params.get("n_trades", 0)
    live_n_trades = len(trades)

    if bt_n_trades and live_n_trades:
        bt_rate   = bt_n_trades / max(params.get("n_days", 252), 1)
        live_rate = live_n_trades / max(params.get("live_days", 30), 1)
        deviation = abs(live_rate - bt_rate) / max(bt_rate, 0.001)
        if deviation > 0.5:
            flags.append({
                "parameter":     "trade_frequency",
                "backtest_value": round(bt_rate, 3),
                "live_value":     round(live_rate, 3),
                "deviation_pct":  round(deviation * 100, 1),
                "impact":         "high" if deviation > 1.0 else "medium",
            })

    # Check win rate drift
    bt_wr   = params.get("win_rate", None)
    live_pnls = [t.get("pnl") for t in trades if t.get("pnl") is not None]
    if bt_wr is not None and live_pnls:
        live_wr = sum(1 for p in live_pnls if p > 0) / len(live_pnls)
        deviation = abs(live_wr - bt_wr)
        if deviation > 0.10:
            flags.append({
                "parameter":     "win_rate",
                "backtest_value": round(bt_wr, 3),
                "live_value":     round(live_wr, 3),
                "deviation_pct":  round(deviation * 100, 1),
                "impact":         "high" if deviation > 0.20 else "medium",
            })

    return {"drift_flags": flags}


# ── Node 5: Pattern recognition ───────────────────────────────────────────────

def recognize_patterns(state: Dict[str, Any]) -> Dict[str, Any]:
    losses  = state.get("losing_trades", [])
    audits  = state.get("trade_audits", [])
    flaws: list = []

    if not losses:
        return {"pattern_flaws": []}

    # Pattern A: Repeated regime-change losses
    regime_losses = [l for l in losses if l["root_cause"] == "regime_change"]
    if len(regime_losses) >= 2:
        avg_loss = np.mean([l["pnl"] for l in regime_losses])
        flaws.append({
            "pattern":          "Volatile regime entries",
            "occurrences":      len(regime_losses),
            "tickers_affected": list({l["sym"] for l in regime_losses}),
            "avg_loss":         round(float(avg_loss), 2),
            "recommendation":   "Add a VIX filter: suspend BUY signals when VIX > 20. "
                                "Switch to defensive positions (cash or inverse ETFs) in volatile regimes.",
        })

    # Pattern B: Repeated poor-entry losses
    entry_losses = [l for l in losses if l["root_cause"] == "poor_entry"]
    if len(entry_losses) >= 2:
        avg_loss = np.mean([l["pnl"] for l in entry_losses])
        flaws.append({
            "pattern":          "Low-confidence entries",
            "occurrences":      len(entry_losses),
            "tickers_affected": list({l["sym"] for l in entry_losses}),
            "avg_loss":         round(float(avg_loss), 2),
            "recommendation":   "Raise the minimum confidence threshold from ~40% to 65%. "
                                "Only execute trades where the strategy outputs confidence ≥ 0.65.",
        })

    # Pattern C: Deviation trades (human overrides)
    deviations = [a for a in audits if a["verdict"] == "deviation"]
    if len(deviations) >= 2:
        dev_pnls = [a["pnl"] for a in deviations if a.get("pnl") is not None]
        avg_loss = np.mean(dev_pnls) if dev_pnls else 0
        flaws.append({
            "pattern":          "Manual overrides of strategy signals",
            "occurrences":      len(deviations),
            "tickers_affected": list({a["sym"] for a in deviations}),
            "avg_loss":         round(float(avg_loss), 2),
            "recommendation":   "Discretionary overrides are underperforming the systematic signal. "
                                "Enforce algorithmic discipline — only execute when signal confidence ≥ threshold.",
        })

    return {"pattern_flaws": flaws}


# ── Node 6: Generate Lessons Learned report ───────────────────────────────────

def generate_report(state: Dict[str, Any]) -> Dict[str, Any]:
    audits  = state.get("trade_audits", [])
    losses  = state.get("losing_trades", [])
    drift   = state.get("drift_flags", [])
    flaws   = state.get("pattern_flaws", [])
    now     = datetime.now().strftime("%Y-%m-%d %H:%M")

    # Grade
    n_trades    = len(audits)
    n_losses    = len(losses)
    n_deviations = sum(1 for a in audits if a["verdict"] == "deviation")
    loss_rate   = n_losses / max(n_trades, 1)
    dev_rate    = n_deviations / max(n_trades, 1)

    if loss_rate < 0.2 and dev_rate < 0.1 and not drift:
        grade = "A"
    elif loss_rate < 0.35 and dev_rate < 0.2:
        grade = "B"
    elif loss_rate < 0.50 and dev_rate < 0.35:
        grade = "C"
    elif loss_rate < 0.65:
        grade = "D"
    else:
        grade = "F"

    # LLM-enhanced narrative
    lessons_text = ""
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if api_key and (losses or flaws):
        try:
            from langchain_anthropic import ChatAnthropic
            from langchain_core.messages import SystemMessage, HumanMessage

            llm = ChatAnthropic(model="claude-haiku-4-5-20251001", temperature=0.3, max_tokens=1200)
            context = (
                f"Trade audit: {n_trades} trades, {n_losses} losing, {n_deviations} deviations.\n"
                f"Root causes: {[l['root_cause'] for l in losses]}\n"
                f"Pattern flaws: {[f['pattern'] for f in flaws]}\n"
                f"Drift flags: {[d['parameter'] for d in drift]}"
            )
            resp = llm.invoke([
                SystemMessage(content=(
                    "You are a quantitative trading coach reviewing a trader's paper portfolio history. "
                    "Write 3–5 sharp, specific Lessons Learned. Be direct. "
                    "Each lesson: state the mistake, the cost, and the exact fix. "
                    "Format as a numbered markdown list."
                )),
                HumanMessage(content=context),
            ])
            lessons_text = resp.content
        except Exception:
            pass

    if not lessons_text:
        lessons_lines = []
        for i, flaw in enumerate(flaws, 1):
            lessons_lines.append(
                f"{i}. **{flaw['pattern']}** ({flaw['occurrences']}x, avg P&L: €{flaw['avg_loss']:+.0f})\n"
                f"   Fix: {flaw['recommendation']}"
            )
        if not lessons_lines:
            lessons_lines = ["No recurring flaws detected. Maintain current discipline."]
        lessons_text = "\n\n".join(lessons_lines)

    recommendations = [f["recommendation"] for f in flaws]
    if drift:
        for d in drift:
            recommendations.append(
                f"Strategy drift on `{d['parameter']}`: backtest={d['backtest_value']} vs live={d['live_value']} "
                f"({d['deviation_pct']}% deviation). Re-calibrate parameters."
            )

    # Build full report
    lines = [
        f"# Post-Trade Analysis Report — {now}",
        f"**Overall Grade: {grade}**  |  {n_trades} trades · {n_losses} losses · {n_deviations} deviations",
        "",
        "## Decision Audit",
        f"| Verdict | Count |",
        f"|---------|-------|",
    ]
    from collections import Counter
    verdict_counts = Counter(a["verdict"] for a in audits)
    for v, c in verdict_counts.most_common():
        lines.append(f"| {v} | {c} |")

    lines += ["", "## Losing Trade Autopsy"]
    if losses:
        for l in losses:
            lines.append(
                f"- **{l['sym']}** ({l['exit_date']}): €{l['pnl']:+.0f} ({l['pnl_pct']:+.1f}%)"
                f" — _{l['root_cause'].replace('_',' ')}_ — {l['explanation']}"
            )
    else:
        lines.append("_No losing closed trades found._")

    if drift:
        lines += ["", "## Strategy Drift Flags"]
        for d in drift:
            lines.append(
                f"- **{d['parameter']}**: backtest `{d['backtest_value']}` → live `{d['live_value']}` "
                f"({d['deviation_pct']}% deviation) — Impact: {d['impact'].upper()}"
            )

    if flaws:
        lines += ["", "## Systematic Pattern Flaws"]
        for f in flaws:
            lines.append(
                f"- **{f['pattern']}** — {f['occurrences']}x across {f['tickers_affected']}, "
                f"avg loss €{f['avg_loss']:+.0f}"
            )
            lines.append(f"  → {f['recommendation']}")

    lines += [
        "",
        "## Lessons Learned",
        lessons_text,
        "",
        "## Action Items",
    ]
    for i, r in enumerate(recommendations, 1):
        lines.append(f"{i}. {r}")
    if not recommendations:
        lines.append("No immediate action required.")

    report_md = "\n".join(lines)
    report_path = str(ROOT / "reports" / f"postrade_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md")
    Path(report_path).write_text(report_md, encoding="utf-8")

    return {
        "lessons_learned":  lessons_text,
        "recommendations":  recommendations,
        "overall_grade":    grade,
        "report_md":        report_md,
        "report_path":      report_path,
    }
