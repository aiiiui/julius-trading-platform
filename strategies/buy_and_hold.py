"""
Buy-and-Hold strategy: buy on day 1, hold until the end. Never sells.
This is the passive baseline — the hardest benchmark to beat over long periods.
"""

import pandas as pd
from strategies.base import BaseStrategy


class BuyAndHold(BaseStrategy):
    name = "Buy & Hold"

    def generate_signals(self, prices: pd.DataFrame) -> pd.Series:
        signals = pd.Series(0, index=prices.index, dtype=int)
        signals.iloc[0] = 1   # buy on first available day
        return signals
