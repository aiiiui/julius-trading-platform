"""
Moving Average Crossover strategy.
Default: 50-day MA crosses above/below 200-day MA (Golden Cross / Death Cross).

Signal logic:
  - BUY  (1):  short MA crosses ABOVE long MA (golden cross)
  - SELL (-1): short MA crosses BELOW long MA (death cross)
  - HOLD (0):  no crossover today
"""

import pandas as pd
from strategies.base import BaseStrategy


class MACrossover(BaseStrategy):

    def __init__(self, short_window: int = 50, long_window: int = 200):
        self.short_window = short_window
        self.long_window = long_window
        self.name = f"MA Crossover ({short_window}/{long_window})"

    def generate_signals(self, prices: pd.DataFrame) -> pd.Series:
        close = prices["Close"]

        short_ma = close.rolling(self.short_window).mean()
        long_ma  = close.rolling(self.long_window).mean()

        # Position: 1 when short > long, 0 otherwise
        position = (short_ma > long_ma).astype(int)

        # Signal is the CHANGE in position (crossover moments only)
        signals = position.diff().fillna(0).astype(int)
        # diff gives +1 at golden cross, -1 at death cross, 0 otherwise

        return signals
