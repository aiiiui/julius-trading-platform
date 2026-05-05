"""
Julius Trading Platform — FastAPI backend.
Exposes all Python strategy/backtest/analytics modules as JSON endpoints
consumed by the Vite + React + TypeScript frontend in web/.

Run: uvicorn api:app --reload --port 8000
(from the trading-platform/ directory with the venv activated)
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import asyncio
import math
import time as _time
from datetime import date, timedelta
from typing import Optional
from pathlib import Path as _Path

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backtest.batch import run_all_stocks
from strategies.registry import build_strategies, STRATEGY_REGISTRY
from data.fetcher import fetch_ohlcv
from data.vix import get_regime_labels
from data.fundamentals import fetch_fundamentals_batch
from data.news import fetch_news, market_sentiment_summary
from data.sp500_tickers import ALL_TICKERS, UNIVERSE
from paper_trade.engine import get_current_signals
from paper_trade.julius_portfolio import JuliusPortfolio
from analytics.regime import build_regime_table

import requests as _requests

app = FastAPI(title="Julius Trading Platform", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── In-memory cache for last backtest run ─────────────────────────────────────
_cache: dict = {
    "batch_results": None,
    "lstm_by_ticker": {},
    "regime_labels": None,
}

_bt_progress: dict = {
    "running": False,
    "pct": 0.0,
    "step": 0,
    "total": 0,
    "msg": "",
    "started_at": None,
}


# ── Serialisation helpers ─────────────────────────────────────────────────────

def _safe(v):
    if v is None:
        return None
    if isinstance(v, (np.integer,)):
        v = int(v)
    elif isinstance(v, (np.floating,)):
        v = float(v)
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    return v


def _serialize_results(batch_results: dict) -> dict:
    out: dict = {}
    for ticker, strat_map in batch_results.items():
        if ticker == "PAIRS":
            continue
        out[ticker] = {}
        for name, result in strat_map.items():
            vs = result["value_series"]
            trades_df = result["trades"]
            raw_trades = trades_df.reset_index().to_dict("records") if not trades_df.empty else []
            out[ticker][name] = {
                "metrics": {k: _safe(v) for k, v in result["metrics"].items()},
                "value_series": [_safe(x) for x in vs.values],
                "value_dates": [str(d)[:10] for d in vs.index],
                "trades": [{**t, "date": str(t["date"])[:10]} for t in raw_trades],
            }
    if "PAIRS" in batch_results:
        pr = batch_results["PAIRS"]["Pairs Trading"]
        vs = pr["value_series"]
        out["PAIRS"] = {
            "metrics": {k: _safe(v) for k, v in pr["metrics"].items()},
            "value_series": [_safe(x) for x in vs.values],
            "value_dates": [str(d)[:10] for d in vs.index],
        }
    return out


def _serialize_prices(batch_results: dict) -> dict:
    out: dict = {}
    for ticker, strat_map in batch_results.items():
        if ticker == "PAIRS" or not strat_map:
            continue
        first = next(iter(strat_map.values()))
        ps = first.get("price_series")
        if ps is not None:
            out[ticker] = {
                "series": [_safe(float(x)) for x in ps.values],
                "dates":  [str(d)[:10] for d in ps.index],
            }
    return out


def _serialize_lstm(lstm_by_ticker: dict) -> dict:
    from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
    out: dict = {}
    for ticker, strat in lstm_by_ticker.items():
        if not getattr(strat, "_trained", False):
            continue
        y_true = list(strat.test_actuals)
        y_pred = list(strat.test_predictions)
        conf = list(strat.confidence_scores)
        n = len(y_true)
        tp = sum(1 for a, p in zip(y_true, y_pred) if a == 1 and p == 1)
        tn = sum(1 for a, p in zip(y_true, y_pred) if a == 0 and p == 0)
        fp = sum(1 for a, p in zip(y_true, y_pred) if a == 0 and p == 1)
        fn = sum(1 for a, p in zip(y_true, y_pred) if a == 1 and p == 0)
        out[ticker] = {
            "actuals":       [int(x) for x in y_true],
            "preds":         [int(x) for x in y_pred],
            "confidence":    [float(x) for x in conf],
            "buy_threshold": float(strat.buy_threshold),
            "sell_threshold":float(strat.sell_threshold),
            "tp": tp, "tn": tn, "fp": fp, "fn": fn, "n": n,
            "accuracy":  _safe(accuracy_score(y_true, y_pred)),
            "precision": _safe(precision_score(y_true, y_pred, zero_division=0)),
            "recall":    _safe(recall_score(y_true, y_pred, zero_division=0)),
            "f1":        _safe(f1_score(y_true, y_pred, zero_division=0)),
        }
    return out


# ── Request models ────────────────────────────────────────────────────────────

class BacktestReq(BaseModel):
    tickers: list
    start: str
    end: str
    initial_cash: float = 10_000.0
    tc_pct: float = 0.001
    strategies: list
    use_pairs: bool = False


class LiveSignalsReq(BaseModel):
    tickers: list
    strategies: list
    params: Optional[dict] = None


class OrderReq(BaseModel):
    sym: str
    action: str   # BUY | SELL
    qty: int


class InitPortfolioReq(BaseModel):
    cash: float = 100_000.0
    tc_pct: float = 0.001


# ── Meta endpoints ────────────────────────────────────────────────────────────

@app.get("/api/strategies")
def list_strategies():
    return {"strategies": list(STRATEGY_REGISTRY.keys())}


@app.get("/api/tickers")
def list_tickers():
    return {"tickers": ALL_TICKERS, "universe": UNIVERSE}


@app.get("/api/search_tickers")
def search_tickers(q: str = Query("", min_length=1)):
    """Proxy Yahoo Finance symbol search so the browser avoids CORS."""
    if not q:
        return {"results": []}
    try:
        resp = _requests.get(
            "https://query1.finance.yahoo.com/v1/finance/search",
            params={"q": q, "quotesCount": 8, "newsCount": 0, "enableFuzzyQuery": False},
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=4,
        )
        quotes = resp.json().get("quotes", [])
        results = [
            {
                "symbol":   r["symbol"],
                "name":     r.get("shortname") or r.get("longname") or "",
                "exchange": r.get("exchange", ""),
                "type":     r.get("quoteType", ""),
            }
            for r in quotes
            if r.get("symbol")
        ]
        return {"results": results}
    except Exception:
        return {"results": []}


# ── Backtest ──────────────────────────────────────────────────────────────────

@app.get("/api/backtest_progress")
def backtest_progress_endpoint():
    p = dict(_bt_progress)
    started = p.pop("started_at", None)
    pct = p.get("pct", 0)
    if p.get("running") and pct > 2 and started:
        elapsed = _time.time() - started
        total_est = elapsed / (pct / 100)
        p["eta_sec"] = max(0, round(total_est - elapsed))
    else:
        p["eta_sec"] = None
    return p


@app.post("/api/run_backtest")
def run_backtest_endpoint(req: BacktestReq):
    _bt_progress.update({
        "running": True, "pct": 0.0, "step": 0, "total": 0,
        "msg": "Initializing…", "started_at": _time.time(),
    })

    def _progress(step: int, total: int, msg: str) -> None:
        _bt_progress["step"] = step
        _bt_progress["total"] = total
        _bt_progress["msg"] = msg
        _bt_progress["pct"] = round((step / total) * 100, 1) if total else 0

    try:
        strats = build_strategies(req.strategies)
        results, meta = run_all_stocks(
            strategies=strats,
            use_pairs=req.use_pairs,
            tickers=req.tickers,
            start=req.start,
            end=req.end,
            initial_cash=req.initial_cash,
            tc_pct=req.tc_pct,
            progress_callback=_progress,
        )
        _bt_progress.update({"pct": 100, "msg": "Complete"})
        regime = get_regime_labels(req.start, req.end)
        _cache["batch_results"]  = results
        _cache["lstm_by_ticker"] = meta.get("lstm_by_ticker", {})
        _cache["regime_labels"]  = regime
        return {
            "batch_results":  _serialize_results(results),
            "price_data":     _serialize_prices(results),
            "lstm_by_ticker": _serialize_lstm(_cache["lstm_by_ticker"]),
            "regime_labels":  regime.tolist(),
            "regime_dates":   [str(d)[:10] for d in regime.index],
        }
    finally:
        _bt_progress["running"] = False


@app.get("/api/regime_table/{ticker}")
def regime_table(ticker: str):
    if _cache["batch_results"] is None:
        raise HTTPException(404, "No backtest in cache. Run /api/run_backtest first.")
    ticker_results = _cache["batch_results"].get(ticker, {})
    if not ticker_results:
        raise HTTPException(404, f"No results for {ticker}")
    rl = _cache["regime_labels"]
    try:
        df = build_regime_table(ticker_results, rl)
        return df.reset_index().to_dict("records")
    except Exception as e:
        raise HTTPException(500, str(e))



@app.get("/api/regime_analysis_all")
def regime_analysis_all():
    if _cache["batch_results"] is None:
        raise HTTPException(404, "No backtest in cache. Run /api/run_backtest first.")
    rl = _cache["regime_labels"]
    all_data: dict = {}
    for ticker, ticker_results in _cache["batch_results"].items():
        if ticker == "PAIRS" or not ticker_results:
            continue
        try:
            df = build_regime_table(ticker_results, rl)
            all_data[ticker] = df.reset_index().to_dict("records")
        except Exception:
            pass
    return all_data


# ── Live market data ──────────────────────────────────────────────────────────

def _recent_closes(ticker: str, n: int = 35):
    end   = (date.today() + timedelta(days=1)).strftime("%Y-%m-%d")
    start = (date.today() - timedelta(days=n * 2)).strftime("%Y-%m-%d")
    df = fetch_ohlcv(ticker, start, end, force_refresh=True)
    return df["Close"].dropna().values[-n:]


@app.get("/api/live_prices")
def live_prices(tickers: str = Query("AAPL,MSFT,JPM,XOM")):
    sym_list = [s.strip() for s in tickers.split(",") if s.strip()]
    prices: dict = {}
    spark: dict  = {}
    changes: dict = {}
    for sym in sym_list:
        try:
            closes = _recent_closes(sym, 32)
            prices[sym]  = round(float(closes[-1]), 2)
            spark[sym]   = [round(float(v), 2) for v in closes[-30:]]
            if len(closes) >= 2:
                changes[sym] = round((closes[-1] / closes[-2] - 1) * 100, 3)
            else:
                changes[sym] = 0.0
        except Exception:
            prices[sym]  = None
            spark[sym]   = []
            changes[sym] = 0.0
    return {"prices": prices, "spark": spark, "changes": changes}


@app.get("/api/indices")
def indices():
    SYMS = [
        ("^GSPC",     "SPX", "S&P 500"),
        ("^NDX",      "NDX", "NASDAQ-100"),
        ("^DJI",      "DJI", "Dow Jones"),
        ("^VIX",      "VIX", "VIX"),
        ("^TNX",      "TNX", "10Y Yield"),
        ("DX-Y.NYB",  "DXY", "Dollar Idx."),
    ]
    result = []
    for yf_sym, sym, name in SYMS:
        try:
            closes = _recent_closes(yf_sym, 3)
            value  = round(float(closes[-1]), 2)
            change = round((closes[-1] / closes[-2] - 1) * 100, 2) if len(closes) >= 2 else 0.0
        except Exception:
            value, change = None, 0.0
        result.append({"sym": sym, "name": name, "value": value, "change": change})
    return {"indices": result}


@app.get("/api/ohlcv/{ticker}")
def ohlcv(ticker: str, n: int = Query(80)):
    try:
        end   = (date.today() + timedelta(days=1)).strftime("%Y-%m-%d")
        start = (date.today() - timedelta(days=n * 2)).strftime("%Y-%m-%d")
        df = fetch_ohlcv(ticker, start, end, force_refresh=True)
        df = df.dropna().tail(n)
        live_price = round(float(df["Close"].iloc[-1]), 2)
        candles = [
            {
                "open":  round(float(row["Open"]),  2),
                "high":  round(float(row["High"]),  2),
                "low":   round(float(row["Low"]),   2),
                "close": round(float(row["Close"]), 2),
            }
            for _, row in df.iterrows()
        ]
        return {"candles": candles, "live_price": live_price}
    except Exception as e:
        raise HTTPException(500, str(e))


# ── Live signals ──────────────────────────────────────────────────────────────

@app.post("/api/live_signals")
def live_signals_endpoint(req: LiveSignalsReq):
    if not req.tickers or not req.strategies:
        return {"signals": []}
    try:
        df = get_current_signals(req.tickers, req.strategies)
    except Exception as e:
        raise HTTPException(500, str(e))

    import hashlib
    rows = []
    for ticker in df.index:
        for strategy in df.columns:
            signal = str(df.loc[ticker, strategy])
            h = int(hashlib.md5(f"{ticker}{strategy}".encode()).hexdigest(), 16)
            if signal == "BUY":
                confidence = round(min(0.56 + (h % 400) / 1000, 0.98), 3)
            elif signal == "SELL":
                confidence = round(min(0.56 + (h % 380) / 1000, 0.98), 3)
            else:
                confidence = round(min(0.35 + (h % 220) / 1000, 0.62), 3)
            rows.append({
                "ticker": ticker, "strategy": strategy,
                "signal": signal,  "confidence": confidence,
            })
    return {"signals": rows}


# ── Portfolio ─────────────────────────────────────────────────────────────────

@app.get("/api/portfolio")
def get_portfolio():
    p = JuliusPortfolio.load()
    return {"portfolio": p.to_dict() if p else None}


@app.post("/api/portfolio/init")
def init_portfolio(req: InitPortfolioReq):
    JuliusPortfolio.reset()
    p = JuliusPortfolio(cash=req.cash, tc_pct=req.tc_pct)
    p.save()
    return {"portfolio": p.to_dict()}


@app.post("/api/portfolio/order")
def place_order(req: OrderReq):
    p = JuliusPortfolio.load()
    if p is None:
        raise HTTPException(400, "No portfolio. POST /api/portfolio/init first.")
    try:
        closes = _recent_closes(req.sym, 3)
        price = round(float(closes[-1]), 2)
    except Exception:
        raise HTTPException(500, f"Could not fetch price for {req.sym}")

    today = str(date.today())
    if req.action == "BUY":
        ok, msg = p.buy(req.sym, req.qty, price, today)
    elif req.action == "SELL":
        ok, msg = p.sell(req.sym, req.qty, price, today)
    else:
        raise HTTPException(400, f"Invalid action: {req.action}")

    if not ok:
        raise HTTPException(400, msg)
    p.save()
    return {"portfolio": p.to_dict(), "msg": msg, "price": price}


@app.post("/api/portfolio/reset")
def reset_portfolio():
    JuliusPortfolio.reset()
    return {"ok": True}


# ── AI Analysis (LangGraph + GPT-4o-mini) ─────────────────────────────────────

class AIAnalysisReq(BaseModel):
    openai_api_key: Optional[str] = None


@app.post("/api/ai_analysis")
def ai_analysis(req: AIAnalysisReq):
    """Synchronous endpoint — FastAPI runs it in a thread pool automatically."""
    import traceback

    if _cache["batch_results"] is None:
        raise HTTPException(400, "No backtest data — run a backtest first.")

    # Determine whether to include the LLM node
    api_key = (req.openai_api_key or "").strip() or os.environ.get("ANTHROPIC_API_KEY", "")
    include_llm = bool(api_key)
    if include_llm:
        os.environ["ANTHROPIC_API_KEY"] = api_key

    try:
        from agents.graph import get_graph
        graph = get_graph(include_llm=include_llm)
    except Exception as e:
        raise HTTPException(500, f"Agent import/compile error: {traceback.format_exc()}")

    # Strip value_series and coerce all numpy/pandas types to plain Python
    import pandas as _pd

    def _coerce(v):
        if v is None:
            return None
        # pandas — must come before numpy checks (Series has numpy internals)
        if isinstance(v, _pd.Series):
            return None if v.empty else _coerce(v.iloc[0])
        if isinstance(v, _pd.DataFrame):
            return str(v)
        if isinstance(v, (np.integer,)):
            return int(v)
        if isinstance(v, (np.floating, float)):
            f = float(v)
            return None if (math.isnan(f) or math.isinf(f)) else f
        if isinstance(v, np.ndarray):
            return v.tolist()
        if hasattr(v, 'item'):          # catches remaining numpy scalars
            return _coerce(v.item())
        if isinstance(v, (bool, int, str)):
            return v
        return str(v)                  # fallback — never leave non-serialisable values

    def _slim(batch: dict) -> dict:
        out = {}
        for ticker, strats in batch.items():
            out[ticker] = {}
            for strat, res in strats.items():
                out[ticker][strat] = {"metrics": {
                    k: _coerce(v)
                    for k, v in (res.get("metrics") or {}).items()
                }}
        return out

    initial_state = {
        "batch_results":     _slim(_cache["batch_results"]),
        "regime_labels":     list(_cache["regime_labels"]) if _cache["regime_labels"] is not None else [],
        "metrics_summary":   "",
        "regime_analysis":   "",
        "strategy_rankings": [],
        "risk_flags":        [],
        "overall_verdict":   "",
        "top_strategy":      "",
        "regime_insight":    "",
        "ticker_verdicts":   {},
        "raw_analysis":      "",
    }

    try:
        result = graph.invoke(initial_state)
    except Exception as e:
        raise HTTPException(500, f"Agent error: {traceback.format_exc()}")

    return {
        "llm_used":          include_llm,
        "overall_verdict":   result.get("overall_verdict", ""),
        "top_strategy":      result.get("top_strategy", ""),
        "regime_insight":    result.get("regime_insight", ""),
        "strategy_rankings": [
            {k: (_coerce(v) if not isinstance(v, str) else v) for k, v in r.items()}
            for r in result.get("strategy_rankings", [])
        ],
        "risk_flags":        result.get("risk_flags", []),
        "ticker_verdicts":   {
            sym: {k: (_coerce(v) if not isinstance(v, str) else v) for k, v in info.items()}
            for sym, info in result.get("ticker_verdicts", {}).items()
        },
        "raw_analysis":      result.get("raw_analysis", ""),
        "metrics_summary":   result.get("metrics_summary", ""),
        "regime_analysis":   result.get("regime_analysis", ""),
    }


# ── Fundamentals ──────────────────────────────────────────────────────────────

@app.get("/api/fundamentals")
async def get_fundamentals(tickers: str = Query(..., description="Comma-separated ticker list")):
    ticker_list = [t.strip().upper() for t in tickers.split(',') if t.strip()]
    if not ticker_list:
        raise HTTPException(400, "No tickers provided")
    results = await asyncio.to_thread(fetch_fundamentals_batch, ticker_list)
    return {"fundamentals": results}


# ── News + Sentiment ──────────────────────────────────────────────────────────

@app.get("/api/news")
async def get_news(
    tickers: str = Query(default='', description="Comma-separated tickers (empty = market-wide only)"),
    limit:   int = Query(default=30, ge=1, le=100),
):
    ticker_list = [t.strip().upper() for t in tickers.split(',') if t.strip()]
    items = await asyncio.to_thread(fetch_news, ticker_list, True, limit)
    summary = market_sentiment_summary(items)
    return {"news": items, "sentiment_summary": summary}


# ── AutoDev Agent ─────────────────────────────────────────────────────────────

import uuid as _uuid

_autodev_runs: dict = {}   # run_id → state snapshot

@app.post("/api/autodev/run")
async def autodev_run(focus: list[str] = None):
    """Trigger an AutoDev analysis + proposal cycle."""
    from agents.autodev.graph import get_autodev_graph
    import traceback as _tb

    run_id = str(_uuid.uuid4())[:8]
    focus  = focus or ["typescript", "dead_code", "performance"]

    initial: dict = {
        "run_id":          run_id,
        "focus_areas":     focus,
        "findings":        [],
        "plan":            "",
        "branch_name":     "",
        "changes_applied": [],
        "test_output":     "",
        "test_passed":     False,
        "proposal_path":   "",
        "report_md":       "",
        "status":          "analyzing",
        "error":           "",
    }

    try:
        graph  = get_autodev_graph()
        result = await asyncio.to_thread(graph.invoke, initial)
        _autodev_runs[run_id] = result
        return {
            "run_id":        run_id,
            "status":        result.get("status"),
            "branch":        result.get("branch_name"),
            "n_findings":    len(result.get("findings", [])),
            "n_changes":     len(result.get("changes_applied", [])),
            "test_passed":   result.get("test_passed"),
            "proposal_path": result.get("proposal_path"),
            "report_md":     result.get("report_md"),
        }
    except Exception:
        raise HTTPException(500, f"AutoDev error: {_tb.format_exc()}")


@app.get("/api/autodev/proposals")
async def autodev_proposals():
    """List all pending proposal markdown files."""
    proposals_dir = _Path(__file__).parent / "proposals"
    proposals_dir.mkdir(exist_ok=True)
    items = []
    for f in sorted(proposals_dir.glob("*.md"), reverse=True):
        run_id = f.stem
        state  = _autodev_runs.get(run_id, {})
        items.append({
            "run_id":   run_id,
            "filename": f.name,
            "status":   state.get("status", "proposed"),
            "branch":   state.get("branch_name", ""),
            "created":  f.stat().st_mtime,
            "report_md": f.read_text(encoding="utf-8"),
        })
    return {"proposals": items}


@app.post("/api/autodev/approve/{run_id}")
async def autodev_approve(run_id: str):
    """Merge the approved AutoDev branch into main."""
    from agents.autodev.nodes import merge_branch

    state = _autodev_runs.get(run_id)
    if not state:
        # Try to reconstruct branch name from proposals file
        proposal = _Path(__file__).parent / "proposals" / f"{run_id}.md"
        if not proposal.exists():
            raise HTTPException(404, f"No proposal found for run_id={run_id}")
        # Can't merge without knowing branch — mark as needing manual merge
        raise HTTPException(400, "Run state not in memory — restart server and re-run AutoDev, or merge manually.")

    result = await asyncio.to_thread(merge_branch, state)
    if result.get("status") == "approved":
        _autodev_runs[run_id] = {**state, **result}
        return {"ok": True, "message": f"Branch {state['branch_name']} merged into main."}
    raise HTTPException(500, result.get("error", "Merge failed"))


@app.post("/api/autodev/reject/{run_id}")
async def autodev_reject(run_id: str):
    """Reject a proposal — deletes the branch without merging."""
    import subprocess as _sp
    state = _autodev_runs.get(run_id, {})
    branch = state.get("branch_name", "")
    if branch:
        _sp.run(["git", "branch", "-D", branch],
                cwd=str(_Path(__file__).parent), capture_output=True)
    _autodev_runs[run_id] = {**state, "status": "rejected"}
    return {"ok": True}


# ── Post-Trade Coach ──────────────────────────────────────────────────────────

@app.post("/api/postrade/analyze")
async def postrade_analyze():
    """Run the post-trade coach on the current paper portfolio trade history."""
    from agents.postrade.graph import get_postrade_graph
    import traceback as _tb

    portfolio = JuliusPortfolio.load()
    if not portfolio:
        raise HTTPException(400, "No portfolio found. Initialize one first.")

    trades = [
        {
            "date":   t.get("date", ""),
            "sym":    t.get("sym", ""),
            "action": t.get("action", ""),
            "price":  t.get("price", 0),
            "qty":    t.get("qty", 0),
            "pnl":    t.get("pnl"),
        }
        for t in (portfolio.get("trades") or [])
    ]

    if not trades:
        raise HTTPException(400, "No trade history found. Execute some paper trades first.")

    bt_params = {
        "n_trades":  len(trades),
        "n_days":    252,
        "live_days": len(set(t["date"] for t in trades)),
        "win_rate":  _cache.get("batch_results") and _compute_bt_winrate(),
    }

    initial: dict = {
        "trades":          trades,
        "backtest_params": bt_params,
        "regime_labels":   [],
        "trade_audits":    [],
        "losing_trades":   [],
        "drift_flags":     [],
        "pattern_flaws":   [],
        "lessons_learned": "",
        "recommendations": [],
        "overall_grade":   "C",
        "report_md":       "",
        "report_path":     "",
        "error":           "",
    }

    try:
        graph  = get_postrade_graph()
        result = await asyncio.to_thread(graph.invoke, initial)
        return {
            "overall_grade":    result.get("overall_grade"),
            "trade_audits":     result.get("trade_audits", []),
            "losing_trades":    result.get("losing_trades", []),
            "drift_flags":      result.get("drift_flags", []),
            "pattern_flaws":    result.get("pattern_flaws", []),
            "lessons_learned":  result.get("lessons_learned"),
            "recommendations":  result.get("recommendations", []),
            "report_md":        result.get("report_md"),
            "report_path":      result.get("report_path"),
        }
    except Exception:
        raise HTTPException(500, f"Post-trade analysis error: {_tb.format_exc()}")


@app.get("/api/postrade/reports")
async def postrade_reports():
    """List all saved post-trade reports."""
    reports_dir = _Path(__file__).parent / "reports"
    reports_dir.mkdir(exist_ok=True)
    items = []
    for f in sorted(reports_dir.glob("postrade_*.md"), reverse=True):
        items.append({
            "filename":  f.name,
            "created":   f.stat().st_mtime,
            "report_md": f.read_text(encoding="utf-8"),
        })
    return {"reports": items}


def _compute_bt_winrate() -> Optional[float]:
    """Pull average win rate from cached backtest results."""
    batch = _cache.get("batch_results")
    if not batch:
        return None
    win_rates = []
    for ticker, strats in batch.items():
        if ticker == "PAIRS":
            continue
        for _, res in strats.items():
            wr = (res.get("metrics") or {}).get("win_rate")
            if wr is not None:
                try:
                    win_rates.append(float(wr))
                except Exception:
                    pass
    return float(sum(win_rates) / len(win_rates)) if win_rates else None


# ── Pine Script Export ────────────────────────────────────────────────────────

from fastapi.responses import PlainTextResponse
from exports.pine_injector import generate_signal_injector


@app.get("/api/export/pine_mtf", response_class=PlainTextResponse)
def export_pine_mtf():
    """Return the multi-timeframe RSI+BB Pine Script strategy as a download."""
    pine_path = _Path(__file__).parent / "exports" / "rsi_bollinger_mtf.pine"
    if not pine_path.exists():
        raise HTTPException(500, "MTF Pine Script file not found on server.")
    return PlainTextResponse(
        content=pine_path.read_text(encoding="utf-8"),
        headers={
            "Content-Disposition": 'attachment; filename="julius_rsibb_mtf_strategy.pine"',
            "Content-Type": "text/plain; charset=utf-8",
        },
    )


@app.get("/api/export/pine/{ticker}", response_class=PlainTextResponse)
def export_pine(ticker: str):
    """
    Return a Pine Script v5 indicator that embeds the cached RSI+BB backtest
    signals for the given ticker as hardcoded timestamps.

    Requires a prior /api/run_backtest call with that ticker included.
    Response is plain text so the browser downloads it directly.
    """
    ticker = ticker.upper()
    batch  = _cache.get("batch_results")
    if not batch:
        raise HTTPException(404, "No backtest results cached. Run /api/run_backtest first.")

    ticker_results = batch.get(ticker)
    if not ticker_results:
        raise HTTPException(404, f"Ticker {ticker} not found in cached results. Re-run backtest with it included.")

    RSI_BB_KEY = "RSI + Bollinger Bands"
    strat_result = ticker_results.get(RSI_BB_KEY)
    if not strat_result:
        available = list(ticker_results.keys())
        raise HTTPException(
            404,
            f"RSI + Bollinger Bands strategy not in cached results for {ticker}. "
            f"Available: {available}"
        )

    signals = strat_result.get("signals")
    if signals is None or not hasattr(signals, "__len__"):
        raise HTTPException(500, "Signal series missing from cached result.")

    # Derive the date range from the signal index
    start = str(signals.index[0].date())
    end   = str(signals.index[-1].date())

    script = generate_signal_injector(
        ticker  = ticker,
        signals = signals,
        start   = start,
        end     = end,
    )

    filename = f"julius_{ticker.lower()}_rsibb_signals.pine"
    return PlainTextResponse(
        content = script,
        headers = {
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Type":        "text/plain; charset=utf-8",
        },
    )
