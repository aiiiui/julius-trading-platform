"""
Random Monte Carlo strategy.
Generates 1,000 runs of random buy/sell signals to establish a luck benchmark.
Any real strategy that cannot beat the median random run is not adding value.

Each run: on each day, randomly decide to BUY, SELL, or HOLD with equal probability.
"""

import numpy as np
import pandas as pd
from strategies.base import BaseStrategy


class RandomMonteCarlo(BaseStrategy):
    name = "Random (Monte Carlo)"

    def __init__(self, n_runs: int = 1000, seed: int = 42):
        self.n_runs = n_runs
        self.seed = seed

    def generate_signals(self, prices: pd.DataFrame) -> pd.Series:
        """Returns signals for a single random run (run index 0 by default)."""
        rng = np.random.default_rng(self.seed)
        signals = rng.choice([-1, 0, 1], size=len(prices))
        return pd.Series(signals, index=prices.index, dtype=int)

    def generate_all_runs(self, prices: pd.DataFrame) -> pd.DataFrame:
        """
        Returns a DataFrame of shape (n_days, n_runs) with signals for all runs.
        Used by the backtest engine to compute the MC distribution.
        """
        rng = np.random.default_rng(self.seed)
        matrix = rng.choice([-1, 0, 1], size=(len(prices), self.n_runs))
        return pd.DataFrame(matrix, index=prices.index,
                            columns=[f"run_{i}" for i in range(self.n_runs)])
