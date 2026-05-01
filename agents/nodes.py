"""
LangGraph node functions — each receives the full AgentState and returns
a dict of the keys it wants to update.
"""
from __future__ import annotations

import os
from typing import Any, Dict, List

import numpy as np

from .state import AgentState


# ── Node 1: Summarise raw metrics ─────────────────────────────────────────────

def summarize_metrics(state: AgentState) -> Dict[str, Any]:
    batch   = state["batch_results"]
    tickers = [k for k in batch if k != "PAIRS"]

    strat_returns: Dict[str, List[float]] = {}
    strat_sharpes: Dict[str, List[float]] = {}
    strat_dds:     Dict[str, List[float]] = {}
    strat_wins:    Dict[str, List[float]] = {}

    for ticker in tickers:
        for strat, result in batch[ticker].items():
            m = result.get("metrics", {})
            if m.get("total_return") is not None:
                strat_returns.setdefault(strat, []).append(m["total_return"])
            if m.get("sharpe_ratio") is not None:
                strat_sharpes.setdefault(strat, []).append(m["sharpe_ratio"])
            if m.get("max_drawdown") is not None:
                strat_dds.setdefault(strat, []).append(m["max_drawdown"])
            if m.get("win_rate") is not None:
                strat_wins.setdefault(strat, []).append(m["win_rate"])

    strategies = list(strat_returns.keys())
    avg_ret    = {s: float(np.mean(strat_returns[s])) for s in strategies if strat_returns.get(s)}
    avg_sharpe = {s: float(np.mean(strat_sharpes[s])) for s in strategies if strat_sharpes.get(s)}
    avg_dd     = {s: float(np.mean(strat_dds[s]))     for s in strategies if strat_dds.get(s)}
    avg_wr     = {s: float(np.mean(strat_wins[s]))    for s in strategies if strat_wins.get(s)}

    sorted_strats = sorted(strategies, key=lambda s: avg_ret.get(s, -999), reverse=True)

    best_per_ticker = {}
    for ticker in tickers:
        strats = batch[ticker]
        best = max(
            strats.items(),
            key=lambda x: (x[1].get("metrics") or {}).get("total_return") or -999,
            default=None,
        )
        if best:
            ret = (best[1].get("metrics") or {}).get("total_return") or 0
            best_per_ticker[ticker] = (best[0], ret)

    lines = [
        f"BACKTEST SUMMARY — {len(tickers)} tickers × {len(strategies)} strategies",
        "",
        "Strategy performance averaged across all tickers:",
    ]
    for s in sorted_strats:
        lines.append(
            f"  {s}: return={avg_ret.get(s,0)*100:.1f}%"
            f"  sharpe={avg_sharpe.get(s,0):.2f}"
            f"  max_dd={avg_dd.get(s,0)*100:.1f}%"
            f"  win_rate={avg_wr.get(s,0)*100:.0f}%"
        )

    lines += ["", "Best strategy per ticker:"]
    for ticker, (strat, ret) in best_per_ticker.items():
        lines.append(f"  {ticker}: {strat}  ({ret*100:+.1f}%)")

    return {"metrics_summary": "\n".join(lines)}


# ── Node 2: Regime context ─────────────────────────────────────────────────────

def analyze_regime(state: AgentState) -> Dict[str, Any]:
    labels = state["regime_labels"]
    total  = len(labels) or 1
    calm   = labels.count("calm")
    vol    = total - calm

    lines = [
        f"REGIME ANALYSIS — {total} trading days",
        f"  Calm  (VIX < 20): {calm} days ({calm/total*100:.0f}%)",
        f"  Volatile (VIX ≥ 20): {vol} days ({vol/total*100:.0f}%)",
        "",
    ]

    if calm / total >= 0.7:
        lines.append(
            "LOW-VOLATILITY REGIME: Trend-following and momentum strategies "
            "historically outperform mean-reversion in this environment."
        )
    elif vol / total >= 0.5:
        lines.append(
            "HIGH-VOLATILITY REGIME: Crisis-alpha and defensive strategies "
            "are favoured. Drawdown management is critical."
        )
    else:
        lines.append(
            "MIXED REGIME: No single regime dominated. All-weather strategies "
            "with robust Sharpe ratios are preferred."
        )

    return {"regime_analysis": "\n".join(lines)}


# ── Node 3: Composite strategy rankings ───────────────────────────────────────

def rank_strategies(state: AgentState) -> Dict[str, Any]:
    batch   = state["batch_results"]
    tickers = [k for k in batch if k != "PAIRS"]

    strat_scores: Dict[str, List[float]] = {}

    for ticker in tickers:
        for strat, result in batch[ticker].items():
            m   = result.get("metrics") or {}
            ret    = m.get("total_return") or 0.0
            sharpe = m.get("sharpe_ratio") or 0.0
            dd     = abs(m.get("max_drawdown") or 0.0)
            wr     = m.get("win_rate") or 0.0
            # 40% return + 30% normalised Sharpe + 20% DD resilience + 10% win-rate
            score = 0.40 * ret + 0.30 * (sharpe / 3.0) + 0.20 * (1.0 - dd) + 0.10 * wr
            strat_scores.setdefault(strat, []).append(score)

    rankings = sorted(
        [
            {"name": s, "score": round(float(np.mean(v)), 4), "rank": 0}
            for s, v in strat_scores.items()
        ],
        key=lambda x: x["score"],
        reverse=True,
    )
    for i, r in enumerate(rankings):
        r["rank"] = i + 1

    return {"strategy_rankings": rankings}


# ── Node 4: Risk assessment ────────────────────────────────────────────────────

def assess_risk(state: AgentState) -> Dict[str, Any]:
    batch   = state["batch_results"]
    tickers = [k for k in batch if k != "PAIRS"]
    flags: List[str] = []

    for ticker in tickers:
        for strat, result in batch[ticker].items():
            m  = result.get("metrics") or {}
            dd = m.get("max_drawdown") or 0.0
            wr = m.get("win_rate") or 0.0
            n  = m.get("n_trades") or 0

            if dd < -0.20:
                flags.append(
                    f"HIGH DRAWDOWN: {ticker} / {strat}  →  {dd*100:.1f}% max drawdown. "
                    "Consider tighter stop-losses or reduced position sizing."
                )
            if wr < 0.35 and n > 5:
                flags.append(
                    f"LOW WIN RATE: {ticker} / {strat}  →  {wr*100:.0f}% wins. "
                    "Strategy may be curve-fitting or poorly parameterised."
                )
            if n > 120:
                flags.append(
                    f"OVERTRADING: {ticker} / {strat}  →  {n} trades. "
                    "Transaction costs will significantly erode returns."
                )

    if not flags:
        flags.append("No critical risk flags detected across all ticker-strategy pairs.")

    return {"risk_flags": flags[:12]}  # cap at 12 so prompt stays manageable


# ── Node 5: LLM analysis (GPT-4o-mini via LangChain) ─────────────────────────

def generate_recommendations(state: AgentState) -> Dict[str, Any]:
    from langchain_anthropic import ChatAnthropic
    from langchain_core.messages import SystemMessage, HumanMessage

    llm = ChatAnthropic(model="claude-haiku-4-5-20251001", temperature=0.3, max_tokens=2048)

    rankings_text = "\n".join(
        f"  #{r['rank']}  {r['name']}  (score {r['score']:.3f})"
        for r in state["strategy_rankings"]
    )
    flags_text = "\n".join(f"  ⚠ {f}" for f in state["risk_flags"])

    system_prompt = """You are a senior quantitative analyst reviewing algorithmic trading backtest results.
Produce a concise, actionable written analysis for a portfolio manager.
Be direct. Avoid excessive hedging. Use the exact section headers below.

OVERALL VERDICT:
<1–2 sentence summary of the portfolio's performance>

TOP STRATEGY PICK:
<name of best strategy and one-line reason why>

KEY INSIGHTS:
- <insight 1>
- <insight 2>
- <insight 3>

REGIME CONTEXT:
<1–2 sentences on how market conditions shaped the results>

RISK WARNINGS:
- <risk bullet 1>
- <risk bullet 2>

TICKER RECOMMENDATIONS:
<ticker>: <strategy to use>, risk level LOW/MEDIUM/HIGH, one-line rationale
(repeat for each ticker)"""

    human_content = (
        f"{state['metrics_summary']}\n\n"
        f"{state['regime_analysis']}\n\n"
        f"COMPOSITE STRATEGY RANKINGS:\n{rankings_text}\n\n"
        f"RISK FLAGS:\n{flags_text}\n\n"
        "Write your analysis now."
    )

    response = llm.invoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=human_content),
    ])
    raw = response.content

    # ── Parse structured fields from the LLM response ─────────────────────────
    overall_verdict = ""
    top_strategy    = state["strategy_rankings"][0]["name"] if state["strategy_rankings"] else ""
    regime_insight  = ""

    current_section: str = ""
    for line in raw.splitlines():
        stripped = line.strip()
        if stripped.startswith("OVERALL VERDICT:"):
            current_section = "overall"
            rest = stripped[len("OVERALL VERDICT:"):].strip()
            if rest:
                overall_verdict = rest
        elif stripped.startswith("TOP STRATEGY PICK:"):
            current_section = "top"
            rest = stripped[len("TOP STRATEGY PICK:"):].strip()
            if rest:
                top_strategy = rest
        elif stripped.startswith("REGIME CONTEXT:"):
            current_section = "regime"
            rest = stripped[len("REGIME CONTEXT:"):].strip()
            if rest:
                regime_insight = rest
        elif stripped.startswith(("KEY INSIGHTS:", "RISK WARNINGS:", "TICKER RECOMMENDATIONS:")):
            current_section = ""
        else:
            if current_section == "overall" and stripped:
                overall_verdict = (overall_verdict + " " + stripped).strip()
            elif current_section == "top" and stripped:
                top_strategy = (top_strategy + " " + stripped).strip()
            elif current_section == "regime" and stripped:
                regime_insight = (regime_insight + " " + stripped).strip()

    # ── Build per-ticker verdicts from backtest data ───────────────────────────
    batch   = state["batch_results"]
    tickers = [k for k in batch if k != "PAIRS"]
    ticker_verdicts: Dict[str, Dict[str, Any]] = {}

    for ticker in tickers:
        strats = batch[ticker]
        best = max(
            strats.items(),
            key=lambda x: (x[1].get("metrics") or {}).get("total_return") or -999,
            default=None,
        )
        if best:
            m   = (best[1].get("metrics") or {})
            ret = m.get("total_return") or 0.0
            dd  = m.get("max_drawdown") or 0.0
            risk = "HIGH" if dd < -0.15 else "MEDIUM" if dd < -0.08 else "LOW"
            ticker_verdicts[ticker] = {
                "best_strategy": best[0],
                "return":        round(ret, 4),
                "max_drawdown":  round(dd, 4),
                "risk_level":    risk,
            }

    return {
        "overall_verdict": overall_verdict or "Analysis complete.",
        "top_strategy":    top_strategy,
        "regime_insight":  regime_insight,
        "ticker_verdicts": ticker_verdicts,
        "raw_analysis":    raw,
    }
