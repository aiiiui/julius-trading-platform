"""
Pairs Trading — Statistical Arbitrage.

NOT a BaseStrategy subclass. Has its own run() method but returns the same
result dict format as run_backtest() so it integrates with all existing viz.

Logic:
  1. Find the most correlated pair from the provided universe (log-return correlation)
  2. Compute spread = log(close_A) - log(close_B)
  3. Compute rolling z-score of the spread (lookback window)
  4. Trade when spread deviates beyond ±z_entry std devs:
       z < -z_entry → long A / short B   (spread undervalued, expect reversion up)
       z > +z_entry → short A / long B   (spread overvalued, expect reversion down)
       |z| < z_exit → close position      (spread has mean-reverted)

Virtual dollar-neutral portfolio:
  - P&L each day = notional × (ret_A - ret_B) when long A/short B
  - P&L each day = notional × (ret_B - ret_A) when long B/short A
  - Transaction cost applied on both legs at entry and exit
"""

import numpy as np
import pandas as pd
from itertools import combinations
from backtest.metrics import compute_all


class PairsBacktester:
    name = "Pairs Trading"

    def __init__(
        self,
        z_entry: float = 2.0,
        z_exit: float = 0.0,
        lookback: int = 60,
        notional_per_leg: float = 5_000.0,
    ):
        self.z_entry = z_entry
        self.z_exit  = z_exit
        self.lookback = lookback
        self.notional = notional_per_leg
        self.ticker_a: str = ""
        self.ticker_b: str = ""

    def find_best_pair(self, universe_prices: dict) -> tuple:
        """
        Compute pairwise log-return correlation within universe_prices.
        Returns (ticker_a, ticker_b) with highest absolute correlation.
        """
        tickers = list(universe_prices.keys())
        if len(tickers) < 2:
            raise ValueError("Need at least 2 tickers for pairs trading.")

        # Build log-return matrix
        log_rets = pd.DataFrame({
            t: np.log(universe_prices[t]["Close"]).diff()
            for t in tickers
        }).dropna()

        best_corr = -1.0
        best_pair = (tickers[0], tickers[1])

        for a, b in combinations(tickers, 2):
            if a not in log_rets.columns or b not in log_rets.columns:
                continue
            corr = log_rets[a].corr(log_rets[b])
            if abs(corr) > best_corr:
                best_corr = abs(corr)
                best_pair = (a, b)

        return best_pair

    def _compute_zscore(self, series: pd.Series) -> pd.Series:
        """Rolling z-score of a spread series."""
        roll_mean = series.rolling(self.lookback).mean()
        roll_std  = series.rolling(self.lookback).std().replace(0, np.nan)
        return (series - roll_mean) / roll_std

    def run(
        self,
        universe_prices: dict,
        initial_cash: float = 10_000.0,
        transaction_cost_pct: float = 0.001,
    ) -> dict:
        """
        Run the pairs strategy on the provided universe.
        Returns same dict structure as run_backtest(): {metrics, value_series, trades, signals}
        """
        self.ticker_a, self.ticker_b = self.find_best_pair(universe_prices)
        print(f"  Pairs: selected {self.ticker_a} / {self.ticker_b}")

        prices_a = universe_prices[self.ticker_a]["Close"]
        prices_b = universe_prices[self.ticker_b]["Close"]

        # Align on common dates
        common_idx = prices_a.index.intersection(prices_b.index)
        prices_a = prices_a.reindex(common_idx)
        prices_b = prices_b.reindex(common_idx)

        spread  = np.log(prices_a) - np.log(prices_b)
        zscore  = self._compute_zscore(spread)

        # Daily returns for each leg
        ret_a = prices_a.pct_change().fillna(0)
        ret_b = prices_b.pct_change().fillna(0)

        portfolio_value = initial_cash
        daily_values = []
        trades = []

        # Position state: 1 = long A/short B, -1 = short A/long B, 0 = flat
        position = 0

        for i, date in enumerate(common_idx):
            z = zscore.iloc[i]

            if pd.isna(z):
                daily_values.append({"date": date, "value": portfolio_value})
                continue

            # Entry signals
            if position == 0:
                if z < -self.z_entry:
                    # Long A / Short B
                    tc = self.notional * 2 * transaction_cost_pct
                    portfolio_value -= tc
                    position = 1
                    trades.append({"date": date, "action": "ENTER L/A S/B",
                                   "z_score": z, "pair": f"{self.ticker_a}/{self.ticker_b}", "cost": tc})
                elif z > self.z_entry:
                    # Short A / Long B
                    tc = self.notional * 2 * transaction_cost_pct
                    portfolio_value -= tc
                    position = -1
                    trades.append({"date": date, "action": "ENTER S/A L/B",
                                   "z_score": z, "pair": f"{self.ticker_a}/{self.ticker_b}", "cost": tc})

            # Exit signals
            elif position != 0 and abs(z) < self.z_exit + 0.05:
                tc = self.notional * 2 * transaction_cost_pct
                portfolio_value -= tc
                trades.append({"date": date, "action": "EXIT",
                               "z_score": z, "pair": f"{self.ticker_a}/{self.ticker_b}", "cost": tc})
                position = 0

            # Mark-to-market P&L
            if position == 1 and i > 0:
                portfolio_value += self.notional * (ret_a.iloc[i] - ret_b.iloc[i])
            elif position == -1 and i > 0:
                portfolio_value += self.notional * (ret_b.iloc[i] - ret_a.iloc[i])

            daily_values.append({"date": date, "value": portfolio_value})

        # Force-exit at end
        if position != 0:
            tc = self.notional * 2 * transaction_cost_pct
            portfolio_value -= tc
            trades.append({"date": common_idx[-1], "action": "EXIT (forced)",
                           "z_score": zscore.iloc[-1], "pair": f"{self.ticker_a}/{self.ticker_b}", "cost": tc})

        value_series = pd.DataFrame(daily_values).set_index("date")["value"]

        trades_df = pd.DataFrame(trades).set_index("date") if trades else pd.DataFrame(
            columns=["action", "z_score", "pair", "cost"]
        )
        # Add dummy 'price' column so win_rate() doesn't error (pairs has no single entry price)
        if not trades_df.empty and "price" not in trades_df.columns:
            trades_df["price"] = np.nan

        metrics = compute_all(value_series, trades_df, self.name)

        return {
            "metrics":      metrics,
            "value_series": value_series,
            "trades":       trades_df,
            "signals":      zscore.reindex(common_idx),   # z-score as informational signal
        }
