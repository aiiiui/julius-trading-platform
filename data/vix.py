"""
VIX regime classifier.
Labels each trading day as 'calm' (VIX < 20) or 'volatile' (VIX >= 20).
"""

import pandas as pd
from data.fetcher import fetch_vix
from data.sp500_tickers import VIX_CALM_THRESHOLD


def get_regime_labels(start: str, end: str) -> pd.Series:
    """
    Returns a Series indexed by date with values 'calm' or 'volatile'.
    Aligns with any price DataFrame via .reindex().
    """
    vix = fetch_vix(start, end)
    regime = vix.apply(lambda v: "calm" if v < VIX_CALM_THRESHOLD else "volatile")
    regime.name = "regime"
    return regime


def label_dataframe(df: pd.DataFrame, start: str, end: str) -> pd.DataFrame:
    """Attach a 'regime' column to an existing price DataFrame."""
    regime = get_regime_labels(start, end)
    df = df.copy()
    df["regime"] = regime.reindex(df.index)
    return df
