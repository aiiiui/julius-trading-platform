"""
Abstract base class for all trading strategies.
Every strategy must implement generate_signals() and nothing else is required.

Signal conventions:
    1  = BUY  (go long / enter position)
    0  = HOLD (keep current position, do nothing)
   -1  = SELL (exit position / go to cash)
"""

from abc import ABC, abstractmethod
import pandas as pd


class BaseStrategy(ABC):
    """
    All strategies inherit from this. The backtest engine calls generate_signals()
    and handles execution, position tracking, and P&L calculation.
    """

    name: str = "BaseStrategy"

    @abstractmethod
    def generate_signals(self, prices: pd.DataFrame) -> pd.Series:
        """
        Given a DataFrame of OHLCV price data for one stock,
        return a Series of signals (1, 0, -1) indexed by date.

        CRITICAL: Only use data available at signal time.
        Never reference prices.iloc[i+1] or future rows — that is look-ahead bias.

        Args:
            prices: DataFrame with columns [Open, High, Low, Close, Volume]
                    indexed by datetime

        Returns:
            pd.Series of int {1, 0, -1} indexed by date, same index as prices
        """
        ...

    def __repr__(self):
        return f"<Strategy: {self.name}>"
