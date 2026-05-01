"""
Strategy registry — single source of truth for all available strategies.

Adding a new strategy = one line in STRATEGY_REGISTRY. No changes to app.py.

PairsBacktester is intentionally excluded: it has a different execution path
(takes a universe of prices, not a single ticker) and is handled separately
in backtest/batch.py via the use_pairs flag.
"""

from strategies.buy_and_hold    import BuyAndHold
from strategies.ma_crossover    import MACrossover
from strategies.random_mc       import RandomMonteCarlo
from strategies.ml_signal       import MLSignal
from strategies.ema_crossover   import EMACrossover
from strategies.rsi_bollinger   import RSIBollinger
from strategies.macd_adx        import MACDWithADX
from strategies.lstm_strategy   import LSTMStrategy

STRATEGY_REGISTRY: dict = {
    "Buy & Hold":                  BuyAndHold,
    "EMA Crossover + Volume":      EMACrossover,
    "RSI + Bollinger Bands":       RSIBollinger,
    "MACD + ADX":                  MACDWithADX,
    "Random Monte Carlo":          RandomMonteCarlo,
    "AI/ML (Logistic Regression)": MLSignal,
    "LSTM Multi-Signal":           LSTMStrategy,
}

# Strategies that require fit(train_prices) before generate_signals()
REQUIRES_FIT: set = {
    "AI/ML (Logistic Regression)",
    "LSTM Multi-Signal",
}

# Default strategies shown checked in the sidebar
DEFAULT_STRATEGIES: set = {
    "Buy & Hold",
    "EMA Crossover + Volume",
    "RSI + Bollinger Bands",
    "MACD + ADX",
}


def build_strategies(selected_names: list) -> list:
    """
    Instantiate and return strategy objects for the given display names.
    ML strategies are returned un-fit; batch.py calls fit() per ticker.
    """
    strategies = []
    for name in selected_names:
        if name not in STRATEGY_REGISTRY:
            raise KeyError(f"Unknown strategy: {name!r}")
        cls = STRATEGY_REGISTRY[name]

        if cls is MACrossover:
            strategies.append(cls(50, 200))
        elif cls is RandomMonteCarlo:
            strategies.append(cls(n_runs=1000))
        elif cls is MLSignal:
            strategies.append(cls(train_end="2024-12-31"))
        elif cls is LSTMStrategy:
            strategies.append(cls(train_end="2024-12-31"))
        else:
            strategies.append(cls())

    return strategies
