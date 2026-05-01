"""
Shared technical indicators used across all strategies.
Single source of truth — prevents divergent implementations in the comparison dashboard.
"""

import pandas as pd
import numpy as np


def compute_ema(close: pd.Series, span: int) -> pd.Series:
    """Exponential Moving Average."""
    return close.ewm(span=span, adjust=False).mean()


def compute_rsi(close: pd.Series, window: int = 14) -> pd.Series:
    """
    Relative Strength Index (Wilder's smoothing via ewm).
    Returns values in [0, 100]. NaN for first `window` rows.
    """
    delta = close.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / window, adjust=False).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / window, adjust=False).mean()
    rs = gain / loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def compute_macd(
    close: pd.Series,
    fast: int = 12,
    slow: int = 26,
    signal: int = 9,
) -> tuple:
    """
    MACD line and signal line.
    Returns: (macd_line, signal_line) as pd.Series pair.
    """
    ema_fast = close.ewm(span=fast, adjust=False).mean()
    ema_slow = close.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    return macd_line, signal_line


def compute_adx(prices: pd.DataFrame, window: int = 14) -> pd.Series:
    """
    Average Directional Index (ADX) using Wilder smoothing approximation.
    Values > 25 indicate a strong trend; < 20 indicates a weak/no trend.

    Uses ewm(alpha=1/window, adjust=False) as the standard approximation
    for Wilder's smoothing method.
    """
    high  = prices["High"]
    low   = prices["Low"]
    close = prices["Close"]

    # True Range
    tr = pd.concat([
        high - low,
        (high - close.shift(1)).abs(),
        (low  - close.shift(1)).abs(),
    ], axis=1).max(axis=1)

    # Directional Movement
    up_move   = high - high.shift(1)
    down_move = low.shift(1) - low

    dm_plus  = up_move.where((up_move > down_move) & (up_move > 0), 0.0)
    dm_minus = down_move.where((down_move > up_move) & (down_move > 0), 0.0)

    # Wilder smoothing
    alpha = 1 / window
    atr      = tr.ewm(alpha=alpha, adjust=False).mean()
    dmp_sm   = dm_plus.ewm(alpha=alpha, adjust=False).mean()
    dmm_sm   = dm_minus.ewm(alpha=alpha, adjust=False).mean()

    di_plus  = 100 * dmp_sm / atr.replace(0, np.nan)
    di_minus = 100 * dmm_sm / atr.replace(0, np.nan)

    dx_denom = (di_plus + di_minus).replace(0, np.nan)
    dx  = 100 * (di_plus - di_minus).abs() / dx_denom
    adx = dx.ewm(alpha=alpha, adjust=False).mean()
    return adx


def compute_bollinger(
    close: pd.Series,
    window: int = 20,
    std_dev: float = 2.0,
) -> tuple:
    """
    Bollinger Bands.
    Returns: (upper_band, middle_band, lower_band) as pd.Series triple.
    """
    mid   = close.rolling(window).mean()
    sigma = close.rolling(window).std()
    upper = mid + std_dev * sigma
    lower = mid - std_dev * sigma
    return upper, mid, lower
