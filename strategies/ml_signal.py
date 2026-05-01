"""
AI/ML Signal strategy.
Trains a logistic regression classifier on lagged features to predict next-day direction.
Signals are double-confirmed: the ML prediction must agree with MACD direction and
RSI must not be in an extreme zone (overbought/oversold) against the signal.

Features:
  - Lagged returns: 1d, 5d, 10d, 20d
  - Volume change: 1d, 5d
  - RSI (14-day), Stochastic RSI (14-day)
  - MACD signal line difference
  - Bollinger Band position
  - ROC 5d, ROC 10d

Training regime: train on data BEFORE the backtest start date (walk-forward ready).
"""

import pandas as pd
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from strategies.base import BaseStrategy
from strategies.indicators import compute_rsi, compute_macd, compute_bollinger


def _compute_features(prices: pd.DataFrame) -> pd.DataFrame:
    close = prices["Close"]
    volume = prices["Volume"]

    feat = pd.DataFrame(index=prices.index)

    # Lagged returns
    for lag in [1, 5, 10, 20]:
        feat[f"ret_{lag}d"] = close.pct_change(lag)

    # Volume momentum
    feat["vol_chg_1d"] = volume.pct_change(1)
    feat["vol_chg_5d"] = volume.pct_change(5)

    # RSI — Wilder's EWM smoothing
    rsi = compute_rsi(close, 14)
    feat["rsi_14"] = rsi

    # Stochastic RSI
    rsi_min = rsi.rolling(14).min()
    rsi_max = rsi.rolling(14).max()
    feat["stoch_rsi"] = (rsi - rsi_min) / (rsi_max - rsi_min).replace(0, np.nan)

    # MACD diff
    macd_line, signal_line = compute_macd(close)
    feat["macd_diff"] = macd_line - signal_line

    # Bollinger Band position
    bb_upper, _, bb_lower = compute_bollinger(close)
    feat["bb_position"] = (close - bb_lower) / (bb_upper - bb_lower).replace(0, np.nan)

    # Rate of change — short-term momentum
    feat["roc_5"]  = close.pct_change(5)
    feat["roc_10"] = close.pct_change(10)

    return feat


def _confirm_signal(signal: int, rsi: float, macd_diff: float) -> int:
    """
    Double-confirmation filter: ML prediction must agree with MACD direction
    and RSI must not be extreme in the opposite direction.
      BUY  (+1): MACD diff > 0  AND  RSI < 68  (not overbought)
      SELL (-1): MACD diff < 0  AND  RSI > 32  (not oversold)
    Returns confirmed signal or 0 (hold).
    """
    if signal == 1 and macd_diff > 0 and rsi < 68:
        return 1
    if signal == -1 and macd_diff < 0 and rsi > 32:
        return -1
    return 0


class MLSignal(BaseStrategy):
    name = "AI/ML (Logistic Regression)"

    def __init__(self, train_end: str = "2024-12-31"):
        """
        train_end: last date used for training. Backtest starts the day after.
        Model is never retrained on test-period data (no look-ahead).
        """
        self.train_end = train_end
        self.model = LogisticRegression(max_iter=1000, class_weight="balanced")
        self.scaler = StandardScaler()
        self._trained = False

    def _build_labels(self, close: pd.Series) -> pd.Series:
        """Label: 1 if next day return > 0, else -1."""
        fwd_return = close.shift(-1) / close - 1
        return fwd_return.apply(lambda r: 1 if r > 0 else -1)

    def fit(self, train_prices: pd.DataFrame):
        """Train the model on historical data before the backtest window."""
        features = _compute_features(train_prices)
        labels = self._build_labels(train_prices["Close"])

        # Align and drop NaNs
        df = features.join(labels.rename("label")).dropna()
        X = df.drop(columns=["label"])
        y = df["label"]

        if len(y) < 50:
            raise ValueError("Not enough training data. Need at least 50 clean rows.")

        X_scaled = self.scaler.fit_transform(X)
        self.model.fit(X_scaled, y)
        self._trained = True
        self._feature_cols = X.columns.tolist()
        print(f"  ML model trained on {len(y)} samples | classes: {self.model.classes_}")

    def generate_signals(self, prices: pd.DataFrame) -> pd.Series:
        if not self._trained:
            raise RuntimeError("Call fit() with training data before generate_signals().")

        features = _compute_features(prices)[self._feature_cols].dropna()
        X_scaled = self.scaler.transform(features)
        raw_predictions = self.model.predict(X_scaled)

        # Apply double-confirmation: MACD and RSI must agree with ML prediction
        confirmed = [
            _confirm_signal(
                int(raw_predictions[i]),
                float(features["rsi_14"].iloc[i]),
                float(features["macd_diff"].iloc[i]),
            )
            for i in range(len(raw_predictions))
        ]

        signals = pd.Series(confirmed, index=features.index, dtype=int)
        return signals.reindex(prices.index, fill_value=0)
