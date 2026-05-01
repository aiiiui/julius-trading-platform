"""
RSI + Bollinger Bands Mean Reversion strategy.

Signal logic:
  BUY  when RSI(14) < 30  AND  close <= lower Bollinger Band (20-period, 2 std dev)
       — oversold price touching the lower band signals potential reversal upward

  SELL when RSI(14) > 70  AND  close >= upper Bollinger Band
       — overbought price at the upper band signals potential reversal downward

This strategy works well in ranging/sideways markets but gets destroyed in
strong sustained trends (the hallmark weakness of mean reversion).
"""

import pandas as pd
from strategies.base import BaseStrategy
from strategies.indicators import compute_rsi, compute_bollinger


class RSIBollinger(BaseStrategy):
    name = "RSI + Bollinger Bands"

    def __init__(
        self,
        rsi_window: int = 14,
        rsi_oversold: float = 30.0,
        rsi_overbought: float = 70.0,
        bb_window: int = 20,
        bb_std: float = 2.0,
    ):
        self.rsi_window    = rsi_window
        self.rsi_oversold  = rsi_oversold
        self.rsi_overbought = rsi_overbought
        self.bb_window     = bb_window
        self.bb_std        = bb_std

    def generate_signals(self, prices: pd.DataFrame) -> pd.Series:
        close = prices["Close"]

        rsi = compute_rsi(close, self.rsi_window)
        upper, _, lower = compute_bollinger(close, self.bb_window, self.bb_std)

        # Warmup: first max(rsi_window, bb_window) rows will have NaN
        warmup = max(self.rsi_window, self.bb_window)

        buy_cond  = (rsi < self.rsi_oversold)  & (close <= lower)
        sell_cond = (rsi > self.rsi_overbought) & (close >= upper)

        signals = pd.Series(0, index=prices.index, dtype=int)

        # SELL takes priority if both conditions are true simultaneously
        signals[buy_cond]  = 1
        signals[sell_cond] = -1

        # Zero out warmup rows where indicators are unreliable
        signals.iloc[:warmup] = 0

        return signals
