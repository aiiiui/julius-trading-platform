"""
Extended S&P 500 stock universe: 60+ stocks across 7 sectors.
Core 24-stock subset used for backtesting (data availability, liquidity).
Full universe available for live signal scanning.
"""

# ── Backtest universe (24 stocks — cached parquet data) ───────────────────────

UNIVERSE = {
    "Technology": ["AAPL", "MSFT", "NVDA", "GOOGL", "META", "AMZN", "TSLA", "AMD"],
    "Financials":  ["JPM", "BAC", "GS", "MS", "BLK", "V", "MA", "AXP"],
    "Energy":      ["XOM", "CVX", "COP", "SLB", "PSX", "EOG", "OXY", "MPC"],
}

ALL_TICKERS = [t for sector in UNIVERSE.values() for t in sector]

# ── Extended live universe (for signal scanner + TradingView) ─────────────────

UNIVERSE_EXTENDED = {
    "Technology": [
        "AAPL", "MSFT", "NVDA", "GOOGL", "META", "AMZN", "TSLA", "AMD",
        "INTC", "QCOM", "CSCO", "ADBE", "NFLX", "CRM", "ORCL",
        "UBER", "ABNB", "COIN", "SNOW", "PLTR", "PYPL",
    ],
    "Financials": [
        "JPM", "BAC", "GS", "MS", "BLK", "V", "MA", "AXP",
        "WFC", "C", "SCHW",
    ],
    "Energy": [
        "XOM", "CVX", "COP", "SLB", "PSX", "EOG", "OXY", "MPC",
    ],
    "Healthcare": [
        "JNJ", "UNH", "PFE", "ABBV", "MRK", "LLY", "ABT", "TMO", "BMY",
    ],
    "Consumer": [
        "PG", "KO", "PEP", "WMT", "COST", "HD", "MCD", "NKE", "SBUX",
    ],
    "Industrials": [
        "BA", "CAT", "GE", "HON", "RTX", "UPS",
    ],
    "Utilities": [
        "NEE", "DUK", "SO",
    ],
}

ALL_TICKERS_EXTENDED = [t for sector in UNIVERSE_EXTENDED.values() for t in sector]

# Benchmark
BENCHMARK = "SPY"
VIX_TICKER = "^VIX"

# Regime thresholds
VIX_CALM_THRESHOLD = 20
VIX_VOLATILE_THRESHOLD = 20
