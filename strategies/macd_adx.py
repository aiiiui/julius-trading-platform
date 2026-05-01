"""
MACD + ADX Momentum strategy.

Signal logic:
  BUY  when MACD line crosses above signal line
       AND ADX > 25 (confirming a strong trend — not just noise)

  SELL when MACD line crosses below signal line
       AND ADX > 25

The ADX filter eliminates weak, choppy signals in low-momentum markets.
The tradeoff: misses early trend entries when ADX is still building up.
"""

import pandas as pd
from strategies.base import BaseStrategy
from strategies.indicators import compute_macd, compute_adx


class MACDWithADX(BaseStrategy):
    name = "MACD + ADX"

    def __init__(
        self,
        macd_fast: int = 12,
        macd_slow: int = 26,
        macd_signal: int = 9,
        adx_window: int = 14,
        adx_threshold: float = 25.0,
    ):
        self.macd_fast     = macd_fast
        self.macd_slow     = macd_slow
        self.macd_signal   = macd_signal
        self.adx_window    = adx_window
        self.adx_threshold = adx_threshold

    def generate_signals(self, prices: pd.DataFrame) -> pd.Series:
        close = prices["Close"]

        macd_line, signal_line = compute_macd(
            close, self.macd_fast, self.macd_slow, self.macd_signal
        )
        adx = compute_adx(prices, self.adx_window)

        # Crossover detection: was macd below signal yesterday, above today?
        macd_above      = macd_line > signal_line
        prev_above      = macd_above.shift(1).astype("boolean").fillna(False).astype(bool)
        crossed_above   = macd_above & ~prev_above
        crossed_below   = ~macd_above & prev_above

        strong_trend = adx > self.adx_threshold

        signals = pd.Series(0, index=prices.index, dtype=int)
        signals[crossed_above & strong_trend]  =  1
        signals[crossed_below & strong_trend]  = -1

        return signals
