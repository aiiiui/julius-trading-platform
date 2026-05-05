# Julius Trading Platform

## Project Overview
Full-stack algorithmic trading research tool called **Julius**. Personal use — not production. React/TypeScript frontend + FastAPI backend.

## Stack
- **Backend:** Python 3.9, FastAPI, uvicorn — `api.py` at root
- **Frontend:** React + TypeScript (Vite) — `web/` directory
- **AI pipeline:** LangGraph + langchain-anthropic (Claude Haiku), VADER sentiment (local)
- **Data:** yfinance, feedparser (Yahoo Finance RSS), parquet cache

## Starting the Servers

```bash
# Backend (from /Users/ttouch/trading-platform/)
/Users/ttouch/trading-platform/venv/bin/uvicorn api:app --port 8000 --reload

# Frontend (from /Users/ttouch/trading-platform/web/)
PATH="/Users/ttouch/.nvm/versions/node/v24.15.0/bin:$PATH" npm run dev
```

**Important:** `npm` and `uvicorn` are NOT on the default PATH. Always use full paths above.
After changes, verify backend with `curl -s http://localhost:8000/api/...`

## Directory Layout

```
trading-platform/
├── api.py                  # All /api/* endpoints
├── requirements.txt
├── venv/                   # Python venv
├── data/
│   ├── fetcher.py          # yfinance OHLCV + parquet cache (TTL, range validation)
│   ├── fundamentals.py     # P/E, P/B, valuation scoring — 6h in-memory cache
│   ├── news.py             # Yahoo Finance RSS + yfinance.news + VADER sentiment
│   ├── vix.py              # VIX regime labels (calm/volatile)
│   └── cache/              # Parquet files: TICKER_START_END.parquet
├── backtest/
│   ├── batch.py            # run_all_stocks() — main backtest runner
│   └── metrics.py          # compute_all() — returns plain Python floats
├── strategies/             # Strategy implementations + registry
├── agents/
│   ├── state.py            # AgentState TypedDict
│   ├── nodes.py            # 5 LangGraph nodes
│   └── graph.py            # build_graph(include_llm) — cached compiled graphs
├── paper_trade/            # Paper portfolio engine (live prices, no cache)
├── analytics/              # Regime table builder
└── web/
    └── src/
        ├── App.tsx              # Tab router: live / overview / comparison / ai / regime
        ├── api.ts               # All fetch functions + TypeScript interfaces
        ├── tabs/
        │   ├── TabLive.tsx      # Live Markets (chart, scanner, news, portfolio)
        │   ├── TabPortfolio.tsx
        │   ├── TabComparison.tsx
        │   ├── TabAI.tsx        # XAI 6-step stepper + LSTM diagnostics + LangGraph analysis
        │   └── TabRegime.tsx
        ├── components/
        │   ├── ui.tsx               # Icons, Sparkline, SignalPill, fmt, useInterval
        │   ├── TradingViewChart.tsx
        │   ├── ValuationBar.tsx      # Gradient bar + Buy Now/Fair/Expensive labels
        │   ├── TickerTagInput.tsx    # Tag-chip input with YF autocomplete
        │   ├── IntroScreen.tsx       # Cinematic zoom-in intro (session-once)
        │   └── BacktestProgress.tsx  # Live 0-100% progress screen during backtest
        └── lib/stockMeta.ts         # STOCK_DB, getSuggestions, searchStocks
```

## Key Rules

- **No over-engineering.** This is a personal research tool — build exactly what's asked, no extra abstractions.
- **Free APIs first.** Scope new features to free/no-key APIs. Leave paid integration as clean stubs.
- **Always verify servers are running** with `curl` before reporting work as done.
- **No git repo** — there is no version control; be careful with destructive file changes.

## API Endpoints (api.py)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/run_backtest` | Batch backtest, caches results |
| GET | `/api/live_prices` | yfinance live prices |
| GET | `/api/indices` | Major index prices |
| GET | `/api/ohlcv/{ticker}` | OHLCV for chart |
| GET | `/api/search_tickers?q=` | Yahoo Finance ticker search proxy |
| POST | `/api/live_signals` | Live strategy signals |
| POST | `/api/ai_analysis` | LangGraph 5-node AI pipeline |
| GET | `/api/fundamentals?tickers=` | Valuation metrics batch |
| GET | `/api/news?tickers=&limit=` | News + VADER sentiment |
| * | `/api/portfolio*` | Paper portfolio CRUD |

## AI Pipeline (LangGraph)

5-node `StateGraph` in `agents/`:
1. `summarize_metrics` — avg return/sharpe/drawdown/win-rate per strategy
2. `analyze_regime` — calm vs volatile day counts
3. `rank_strategies` — composite score: 0.4×return + 0.3×(sharpe/3) + 0.2×(1−DD) + 0.1×win-rate
4. `assess_risk` — flags DD < -20%, win rate < 35%, n_trades > 120
5. `generate_recommendations` — Claude Haiku (only if `ANTHROPIC_API_KEY` set)

Nodes 1–4 always run without an API key.

## Known Patterns & Gotchas

- **yfinance `.news` API**: all fields are nested under a `content` key — always read from `content`.
- **Parquet cache validation**: fetcher clips downloaded data to `[start, end]` and re-fetches if cached data is out-of-range or stale (>3 days for recent end dates).
- **LangGraph type safety**: use `_coerce()` to strip pandas Series/numpy types before passing state to nodes. `pd.Series` truthiness check with `or []` will raise — use `if x is not None else []`.
- **Fundamentals cache**: 6-hour in-memory cache in `fundamentals.py`; news has 5min (per-ticker) and 10min (market-wide) TTL.
- **Model**: Claude Haiku — `ChatAnthropic(model="claude-haiku-4-5-20251001")`
