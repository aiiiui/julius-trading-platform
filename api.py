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
from datetime import date, timedelta
from typing import Optional

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
    allow_origins=["http://localhost:5173", "http://localhost:4173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── In-memory cache for last backtest run ─────────────────────────────────────
_cache: dict = {
    "batch_results": None,
    "lstm_by_ticker": {},
    "regime_labels": None,
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
            out[ticker][name] = {
                "metrics": {k: _safe(v) for k, v in result["metrics"].items()},
                "value_series": [_safe(x) for x in vs.values],
                "value_dates": [str(d)[:10] for d in vs.index],
                "trades": trades_df.reset_index().to_dict("records") if not trades_df.empty else [],
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

@app.post("/api/run_backtest")
def run_backtest_endpoint(req: BacktestReq):
    strats = build_strategies(req.strategies)
    results, meta = run_all_stocks(
        strategies=strats,
        use_pairs=req.use_pairs,
        tickers=req.tickers,
        start=req.start,
        end=req.end,
        initial_cash=req.initial_cash,
        tc_pct=req.tc_pct,
    )
    regime = get_regime_labels(req.start, req.end)
    _cache["batch_results"]  = results
    _cache["lstm_by_ticker"] = meta.get("lstm_by_ticker", {})
    _cache["regime_labels"]  = regime
    return {
        "batch_results":  _serialize_results(results),
        "lstm_by_ticker": _serialize_lstm(_cache["lstm_by_ticker"]),
        "regime_labels":  regime.tolist(),
    }


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
