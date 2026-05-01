"""
Data fetcher: pulls OHLCV price data + VIX from yfinance and caches locally as parquet.
Avoids repeated API calls during development.
"""

import yfinance as yf
import pandas as pd
from datetime import date, timedelta
from pathlib import Path

CACHE_DIR = Path(__file__).parent / "cache"
CACHE_DIR.mkdir(exist_ok=True)

# Cache is considered stale if the requested end date is within this many days of today.
# Ensures partial-period caches (e.g. end="2025-12-31" fetched in April) get refreshed.
_STALE_DAYS = 3


def _is_stale(cache_file: Path, end: str) -> bool:
    """Return True if the cache should be re-downloaded."""
    if not cache_file.exists():
        return True
    end_date = date.fromisoformat(end)
    # If end is in the future or very recent, data may be incomplete
    if end_date >= date.today() - timedelta(days=_STALE_DAYS):
        cache_mtime = date.fromtimestamp(cache_file.stat().st_mtime)
        return cache_mtime < date.today() - timedelta(days=_STALE_DAYS)
    return False


def fetch_ohlcv(ticker: str, start: str, end: str, force_refresh: bool = False) -> pd.DataFrame:
    """
    Download daily OHLCV for a single ticker. Returns cached version if available.

    Args:
        ticker: e.g. 'AAPL', '^VIX', 'SPY'
        start:  'YYYY-MM-DD'
        end:    'YYYY-MM-DD'
        force_refresh: re-download even if cache exists
    """
    safe_name = ticker.replace("^", "VIX_").replace("/", "_")
    cache_file = CACHE_DIR / f"{safe_name}_{start}_{end}.parquet"

    if not force_refresh and not _is_stale(cache_file, end):
        df = pd.read_parquet(cache_file)
        # Validate cached data actually falls in the requested range.
        # yfinance sometimes returns out-of-range dates for new/relisted stocks;
        # if cached data is entirely outside [start, end] we must re-fetch.
        if not df.empty:
            ts_start = pd.Timestamp(start)
            ts_end   = pd.Timestamp(end)
            in_range = df[(df.index >= ts_start) & (df.index <= ts_end)]
            if not in_range.empty:
                return in_range
        # Fall through to re-download if cache is unusable

    df = yf.download(ticker, start=start, end=end, auto_adjust=True, progress=False)

    # Flatten multi-level columns if present (yfinance sometimes returns them)
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)

    df.index = pd.to_datetime(df.index).tz_localize(None)

    # Clip to the requested range — yfinance can return rows outside [start, end]
    # for newly listed or recently relisted tickers.
    ts_start = pd.Timestamp(start)
    ts_end   = pd.Timestamp(end)
    df = df[(df.index >= ts_start) & (df.index <= ts_end)].copy()

    if df.empty:
        raise ValueError(f"No data for {ticker} in range {start} → {end}")

    df.to_parquet(cache_file)
    return df


def fetch_multiple(tickers: list[str], start: str, end: str, force_refresh: bool = False) -> dict[str, pd.DataFrame]:
    """Fetch OHLCV for a list of tickers. Returns {ticker: DataFrame}."""
    result = {}
    for ticker in tickers:
        try:
            result[ticker] = fetch_ohlcv(ticker, start, end, force_refresh)
            print(f"  ✓ {ticker}: {len(result[ticker])} trading days")
        except Exception as e:
            print(f"  ✗ {ticker}: {e}")
    return result


def fetch_vix(start: str, end: str, force_refresh: bool = False) -> pd.Series:
    """Return daily VIX closing values as a Series indexed by date."""
    df = fetch_ohlcv("^VIX", start, end, force_refresh)
    return df["Close"].rename("VIX")
