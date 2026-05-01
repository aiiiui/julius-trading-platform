"""
Performance metrics for evaluating trading strategies.
All calculations use daily returns. Annualisation assumes 252 trading days.
"""

import numpy as np
import pandas as pd


def daily_returns(value_series: pd.Series) -> pd.Series:
    return value_series.pct_change().dropna()


def total_return(value_series: pd.Series) -> float:
    return (value_series.iloc[-1] / value_series.iloc[0]) - 1


def cagr(value_series: pd.Series) -> float:
    """Compound Annual Growth Rate."""
    n_years = len(value_series) / 252
    if n_years == 0:
        return 0.0
    return (value_series.iloc[-1] / value_series.iloc[0]) ** (1 / n_years) - 1


def sharpe_ratio(value_series: pd.Series, risk_free_rate: float = 0.05) -> float:
    """
    Annualised Sharpe ratio.
    risk_free_rate: annual rate (default 5% — approx US Fed funds rate in 2025)
    """
    rets = daily_returns(value_series)
    if rets.std() == 0:
        return 0.0
    daily_rf = risk_free_rate / 252
    excess = rets - daily_rf
    return float((excess.mean() / excess.std()) * np.sqrt(252))


def max_drawdown(value_series: pd.Series) -> float:
    """
    Maximum peak-to-trough decline as a negative fraction.
    e.g. -0.25 means the portfolio dropped 25% from its peak at worst.
    """
    rolling_peak = value_series.cummax()
    drawdown = (value_series - rolling_peak) / rolling_peak
    return float(drawdown.min())


def win_rate(trades_df: pd.DataFrame, value_series: pd.Series) -> float:
    """
    Fraction of completed round-trips (buy→sell) that were profitable.
    Returns NaN if fewer than 2 trades.
    """
    if trades_df.empty or len(trades_df) < 2:
        return float("nan")

    buys  = trades_df[trades_df["action"] == "BUY"]["price"].values
    sells = trades_df[trades_df["action"] == "SELL"]["price"].values
    pairs = min(len(buys), len(sells))

    if pairs == 0:
        return float("nan")

    wins = sum(sells[i] > buys[i] for i in range(pairs))
    return wins / pairs


def calmar_ratio(value_series: pd.Series) -> float:
    """CAGR divided by absolute max drawdown. Higher is better."""
    mdd = abs(max_drawdown(value_series))
    if mdd == 0:
        return float("inf")
    return cagr(value_series) / mdd


def avg_trade_duration(trades_df: pd.DataFrame) -> float:
    """
    Mean calendar days between buy and sell in each completed round trip.
    Returns NaN if fewer than one complete round trip exists.
    """
    if trades_df.empty or len(trades_df) < 2:
        return float("nan")

    buys  = trades_df[trades_df["action"] == "BUY"]
    sells = trades_df[trades_df["action"] == "SELL"]
    pairs = min(len(buys), len(sells))

    if pairs == 0:
        return float("nan")

    durations = [
        (s - b).days
        for b, s in zip(buys.index[:pairs], sells.index[:pairs])
    ]
    return float(np.mean(durations))


def compute_all(value_series: pd.Series, trades_df: pd.DataFrame,
                strategy_name: str = "") -> dict:
    """Return a dict of all key metrics for a strategy run."""
    return {
        "strategy":           strategy_name,
        "total_return":       total_return(value_series),
        "cagr":               cagr(value_series),
        "sharpe_ratio":       sharpe_ratio(value_series),
        "max_drawdown":       max_drawdown(value_series),
        "calmar_ratio":       calmar_ratio(value_series),
        "win_rate":           win_rate(trades_df, value_series),
        "n_trades":           len(trades_df),
        "avg_trade_duration": avg_trade_duration(trades_df),
    }
