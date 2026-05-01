"""
Backtesting engine.
Runs a strategy against historical price data and returns performance metrics.

Design rules:
  - Signals are generated on close of day T
  - Trades execute at OPEN of day T+1 (realistic, avoids look-ahead bias)
  - No partial fills, no slippage beyond transaction cost
"""

import pandas as pd
from backtest.portfolio import Portfolio
from backtest.metrics import compute_all
from strategies.base import BaseStrategy


def run_backtest(
    strategy: BaseStrategy,
    prices: pd.DataFrame,
    initial_cash: float = 10_000.0,
    transaction_cost_pct: float = 0.001,
) -> dict:
    """
    Run a single strategy against a price DataFrame.

    Args:
        strategy:              Any class inheriting BaseStrategy
        prices:                DataFrame with OHLCV columns, datetime index
        initial_cash:          Starting capital
        transaction_cost_pct:  Per-trade cost fraction

    Returns:
        dict with keys: 'metrics', 'value_series', 'trades', 'signals'
    """
    signals = strategy.generate_signals(prices)
    portfolio = Portfolio(initial_cash, transaction_cost_pct)

    dates = prices.index
    closes = prices["Close"]
    opens  = prices["Open"]

    # Carry forward position state
    # Signal on day T → execute at open of day T+1
    for i in range(len(dates)):
        date = dates[i]
        close_price = closes.iloc[i]

        # Execute yesterday's signal at today's open
        if i > 0:
            prev_signal = signals.iloc[i - 1]
            exec_price = opens.iloc[i]
            if prev_signal == 1:
                portfolio.buy(date, exec_price)
            elif prev_signal == -1:
                portfolio.sell(date, exec_price)

        # Record today's portfolio value at close
        portfolio.record_value(date, close_price)

    # Force-close any open position at the last close
    if portfolio.in_position:
        portfolio.sell(dates[-1], closes.iloc[-1])

    value_series = portfolio.get_value_series()
    trades_df    = portfolio.get_trades_df()
    metrics      = compute_all(value_series, trades_df, strategy.name)

    return {
        "metrics":      metrics,
        "value_series": value_series,
        "trades":       trades_df,
        "signals":      signals,
    }


def run_multiple(
    strategies: list,
    prices: pd.DataFrame,
    initial_cash: float = 10_000.0,
    transaction_cost_pct: float = 0.001,
) -> dict[str, dict]:
    """
    Run multiple strategies on the same price data.
    Returns {strategy_name: backtest_result}.
    """
    results = {}
    for strategy in strategies:
        result = run_backtest(strategy, prices, initial_cash, transaction_cost_pct)
        results[strategy.name] = result
        m = result["metrics"]
        print(
            f"  {strategy.name:<35} "
            f"Return: {m['total_return']:+.1%}  "
            f"Sharpe: {m['sharpe_ratio']:+.2f}  "
            f"MaxDD: {m['max_drawdown']:.1%}"
        )
    return results
