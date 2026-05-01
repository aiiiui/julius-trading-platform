"""
LSTM Multi-Signal Predictor strategy.

Features (15 total):
  EMA 10/20/50/100/200, RSI 14, MACD, MACD signal, Bollinger Band position,
  ADX, close % change, volume % change,
  ROC(5), ROC(10), Stochastic RSI(14)

Architecture: LSTM(64) → Dropout(0.2) → LSTM(32) → Dense(1, sigmoid)
Training: 20-day sliding window, 70/15/15 split, early stopping patience=10
Signal: prob > 0.55 → BUY, prob < 0.45 → SELL, else HOLD

ROC and Stochastic RSI add short-term momentum context that the standard
indicators miss, helping the model detect early reversals.
"""

import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler

from strategies.base import BaseStrategy
from strategies.indicators import (
    compute_ema, compute_rsi, compute_macd, compute_adx, compute_bollinger
)

try:
    import tensorflow as tf
    from tensorflow import keras
    _TF_AVAILABLE = True
except ImportError:
    _TF_AVAILABLE = False


def _check_tf():
    if not _TF_AVAILABLE:
        raise ImportError(
            "TensorFlow is required for LSTMStrategy.\n"
            "  Intel Mac / Linux / Windows: pip install tensorflow\n"
            "  Apple Silicon (M1/M2/M3):    pip install tensorflow-macos tensorflow-metal"
        )


class LSTMStrategy(BaseStrategy):
    name = "LSTM Multi-Signal"

    def __init__(
        self,
        train_end: str = "2024-12-31",
        sequence_length: int = 20,
        lstm_units_1: int = 64,
        lstm_units_2: int = 32,
        dropout_rate: float = 0.2,
        buy_threshold: float = 0.55,
        sell_threshold: float = 0.45,
        z_score_threshold: float = 0.5,
        adaptive_threshold: bool = True,
        epochs: int = 100,
        batch_size: int = 32,
        patience: int = 10,
    ):
        self.train_end        = train_end
        self.sequence_length  = sequence_length
        self.lstm_units_1     = lstm_units_1
        self.lstm_units_2     = lstm_units_2
        self.dropout_rate     = dropout_rate
        self.buy_threshold    = buy_threshold
        self.sell_threshold   = sell_threshold
        self.epochs           = epochs
        self.batch_size       = batch_size
        self.patience         = patience


        self._trained   = False
        self._scaler    = MinMaxScaler()
        self._model     = None
        self._feat_cols = None

        # Stored after fit() for Tab 3 (AI Analysis)
        self.test_actuals:      np.ndarray = np.array([])
        self.test_predictions:  np.ndarray = np.array([])
        self.confidence_scores: np.ndarray = np.array([])

    # ── Feature engineering ────────────────────────────────────────────────

    def _compute_features(self, prices: pd.DataFrame) -> pd.DataFrame:
        """Build the 10-feature DataFrame from OHLCV prices."""
        close  = prices["Close"]
        volume = prices["Volume"]

        upper_bb, _, lower_bb = compute_bollinger(close)
        bb_range = (upper_bb - lower_bb).replace(0, np.nan)
        bb_pos   = (close - lower_bb) / bb_range   # 0 = at lower, 1 = at upper

        macd_line, signal_line = compute_macd(close)

        rsi14 = compute_rsi(close, 14)

        # Stochastic RSI: where RSI sits within its own 14-day range
        rsi_min = rsi14.rolling(14).min()
        rsi_max = rsi14.rolling(14).max()
        stoch_rsi = (rsi14 - rsi_min) / (rsi_max - rsi_min).replace(0, np.nan)

        feat = pd.DataFrame({
            "ema10":          compute_ema(close, 10),
            "ema20":          compute_ema(close, 20),
            "ema50":          compute_ema(close, 50),
            "ema100":         compute_ema(close, 100),
            "ema200":         compute_ema(close, 200),
            "rsi14":          rsi14,
            "stoch_rsi":      stoch_rsi,
            "macd":           macd_line,
            "macd_signal":    signal_line,
            "bb_position":    bb_pos,
            "adx":            compute_adx(prices, 14),
            "close_pct":      close.pct_change(),
            "volume_pct":     volume.pct_change(),
            "roc_5":          close.pct_change(5),
            "roc_10":         close.pct_change(10),
        }, index=prices.index)

        return feat

    # ── Sequence builder ────────────────────────────────────────────────────

    def _build_sequences(
        self, X: np.ndarray, y: np.ndarray
    ):
        """Sliding window: shape (n_samples, seq_len, n_features)."""
        Xs, ys = [], []
        for i in range(self.sequence_length, len(X)):
            Xs.append(X[i - self.sequence_length: i])
            ys.append(y[i])
        return np.array(Xs), np.array(ys)

    # ── Model builder ───────────────────────────────────────────────────────

    def _build_model(self, n_features: int):
        _check_tf()
        # Use keras.Input as the explicit input layer (Keras 3.x compatible)
        inputs = keras.Input(shape=(self.sequence_length, n_features))
        x = keras.layers.LSTM(self.lstm_units_1, return_sequences=True)(inputs)
        x = keras.layers.Dropout(self.dropout_rate)(x)
        x = keras.layers.LSTM(self.lstm_units_2)(x)
        outputs = keras.layers.Dense(1, activation="sigmoid")(x)

        model = keras.Model(inputs=inputs, outputs=outputs)
        model.compile(
            optimizer="adam",
            loss="binary_crossentropy",
            metrics=["accuracy"],
        )
        return model

    # ── Training ────────────────────────────────────────────────────────────

    def fit(self, train_prices: pd.DataFrame) -> None:
        """
        Train the LSTM on historical prices.
        70% train / 15% val / 15% test split within the provided data.
        """
        _check_tf()

        features = self._compute_features(train_prices)
        close    = train_prices["Close"]

        # Label: 1 if next-day return > 0, else 0
        labels = (close.pct_change().shift(-1) > 0).astype(int)

        df = features.join(labels.rename("label")).dropna()
        if len(df) < self.sequence_length + 50:
            raise ValueError(
                f"Not enough training data. Need > {self.sequence_length + 50} clean rows, "
                f"got {len(df)}."
            )

        X_raw = df.drop(columns=["label"]).values
        y_raw = df["label"].values
        self._feat_cols = df.drop(columns=["label"]).columns.tolist()

        n = len(X_raw)
        t1 = int(n * 0.70)
        t2 = int(n * 0.85)

        X_train_raw, X_val_raw, X_test_raw = X_raw[:t1], X_raw[t1:t2], X_raw[t2:]
        y_train,     y_val,     y_test     = y_raw[:t1], y_raw[t1:t2], y_raw[t2:]

        # Scale — fit on train only
        self._scaler.fit(X_train_raw)
        X_train = self._scaler.transform(X_train_raw)
        X_val   = self._scaler.transform(X_val_raw)
        X_test  = self._scaler.transform(X_test_raw)

        X_train_seq, y_train_seq = self._build_sequences(X_train, y_train)
        X_val_seq,   y_val_seq   = self._build_sequences(X_val,   y_val)
        X_test_seq,  y_test_seq  = self._build_sequences(X_test,  y_test)

        self._model = self._build_model(X_train.shape[1])

        early_stop = keras.callbacks.EarlyStopping(
            monitor="val_loss", patience=self.patience, restore_best_weights=True
        )

        print(f"  LSTM training on {len(X_train_seq)} sequences ({self.sequence_length}-day window)...")
        self._model.fit(
            X_train_seq, y_train_seq,
            validation_data=(X_val_seq, y_val_seq),
            epochs=self.epochs,
            batch_size=self.batch_size,
            callbacks=[early_stop],
            verbose=0,
        )

        # Evaluate on test split — stored for confusion matrix / confidence chart
        test_probs = self._model.predict(X_test_seq, verbose=0).flatten()
        self.confidence_scores = test_probs
        self.test_actuals      = y_test_seq
        self.test_predictions  = (test_probs > 0.5).astype(int)

        acc = (self.test_predictions == y_test_seq).mean()
        print(f"  LSTM test accuracy: {acc:.1%} on {len(y_test_seq)} test samples")

        self._trained = True

    # ── Signal generation ───────────────────────────────────────────────────

    def generate_signals(self, prices: pd.DataFrame) -> pd.Series:
        if not self._trained:
            raise RuntimeError("Call fit() with training data before generate_signals().")

        features = self._compute_features(prices)
        features = features[self._feat_cols].dropna()

        X_raw = features.values
        X     = self._scaler.transform(X_raw)

        signals = pd.Series(0, index=prices.index, dtype=int)

        # Need at least sequence_length rows to make a prediction
        if len(X) <= self.sequence_length:
            return signals

        # Build all sequences at once and batch-predict (single model call)
        seq_indices = list(range(self.sequence_length, len(X)))
        X_seqs = np.stack([X[i - self.sequence_length: i] for i in seq_indices])
        probs = self._model.predict(X_seqs, verbose=0).flatten()

        for i, prob in zip(seq_indices, probs):
            date = features.index[i]
            if prob > self.buy_threshold:
                signals[date] = 1
            elif prob < self.sell_threshold:
                signals[date] = -1

        return signals
