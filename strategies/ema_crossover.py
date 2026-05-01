"""
EMA Crossover + Volume Confirmation strategy.

Signal logic:
  BUY  when EMA50 crosses above EMA100
       AND EMA100 > EMA200 (trend aligned — all three EMAs stacked bullishly)
       AND volume > 20-day average volume (confirms conviction)

  SELL when EMA50 crosses below EMA100
       OR  EMA100 crosses below EMA200 (stronger trend breakdown)

Uses a state machine to emit exactly one signal per position transition —
prevents duplicate -1 signals when both SELL conditions fire simultaneously.
"""

import pandas as pd
from strategies.base import BaseStrategy
from strategies.indicators import compute_ema


class EMACrossover(BaseStrategy):
    name = "EMA Crossover + Volume"

    def __init__(
        self,
        fast: int = 50,
        mid: int = 100,
        slow: int = 200,
        vol_window: int = 20,
    ):
        self.fast = fast
        self.mid = mid
        self.slow = slow
        self.vol_window = vol_window

    def generate_signals(self, prices: pd.DataFrame) -> pd.Series:
        close  = prices["Close"]
        volume = prices["Volume"]

        ema_fast = compute_ema(close, self.fast)
        ema_mid  = compute_ema(close, self.mid)
        ema_slow = compute_ema(close, self.slow)
        vol_avg  = volume.rolling(self.vol_window).mean()

        signals = pd.Series(0, index=prices.index, dtype=int)
        in_position = False

        for i in range(1, len(prices)):
            # Skip until all EMAs and volume avg are available
            if pd.isna(ema_fast.iloc[i]) or pd.isna(ema_slow.iloc[i]) or pd.isna(vol_avg.iloc[i]):
                continue

            prev_fast_above_mid = ema_fast.iloc[i - 1] > ema_mid.iloc[i - 1]
            curr_fast_above_mid = ema_fast.iloc[i]     > ema_mid.iloc[i]

            prev_mid_above_slow = ema_mid.iloc[i - 1] > ema_slow.iloc[i - 1]
            curr_mid_above_slow = ema_mid.iloc[i]     > ema_slow.iloc[i]

            vol_confirmed = volume.iloc[i] > vol_avg.iloc[i]

            # BUY: fast just crossed above mid, trend aligned, volume confirmed
            if (not prev_fast_above_mid and curr_fast_above_mid
                    and curr_mid_above_slow
                    and vol_confirmed
                    and not in_position):
                signals.iloc[i] = 1
                in_position = True

            # SELL: fast crossed below mid OR mid crossed below slow
            elif in_position and (
                (prev_fast_above_mid and not curr_fast_above_mid) or
                (prev_mid_above_slow and not curr_mid_above_slow)
            ):
                signals.iloc[i] = -1
                in_position = False

        return signals
