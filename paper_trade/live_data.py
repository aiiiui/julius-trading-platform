"""
Live data fetcher for paper trading.

Intentionally bypasses the historical cache in data/cache/.
Always pulls fresh OHLCV from Yahoo Finance so the paper trading tab
reflects today's market — not a stale snapshot from the 2025 backtest window.

Fetches 400 calendar days of history (≈252 trading days) so long-lag
indicators (200-day MA, LSTM lookback) have enough data to compute signals.
"""

import yfinance as yf
import pandas as pd
from datetime import date, timedelta

LOOKBACK_DAYS = 400


def fetch_live_ohlcv(ticker: str) -> pd.DataFrame:
    """Pull fresh OHLCV for a single ticker. No cache; always live."""
    end   = (date.today() + timedelta(days=1)).strftime("%Y-%m-%d")  # exclusive → include today
    start = (date.today() - timedelta(days=LOOKBACK_DAYS)).strftime("%Y-%m-%d")

    df = yf.download(ticker, start=start, end=end, auto_adjust=True, progress=False)
    if df.empty:
        raise ValueError(f"No live data returned for {ticker}")

    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)

    df.index = pd.to_datetime(df.index)
    return df


def fetch_live_multiple(tickers: list) -> dict:
    """Fetch live OHLCV for a list of tickers. Returns {ticker: DataFrame}."""
    results = {}
    for ticker in tickers:
        try:
            results[ticker] = fetch_live_ohlcv(ticker)
        except Exception as exc:
            print(f"[live_data] {ticker}: {exc}")
    return results


def latest_close(prices: pd.DataFrame) -> float:
    """Most recent closing price from a live OHLCV DataFrame."""
    return float(prices["Close"].iloc[-1])
