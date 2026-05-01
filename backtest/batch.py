"""
Batch backtester — runs all selected strategies across all selected tickers.

Returns:
    (batch_results, metadata)

    batch_results: {
        ticker: {strategy_name: result_dict},  # one entry per ticker
        "PAIRS": {"Pairs Trading": result_dict}  # if use_pairs=True
    }

    metadata: {
        "lstm_by_ticker": {ticker: LSTMStrategy instance}  # for AI Analysis tab
    }
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from data.fetcher import fetch_ohlcv, fetch_multiple
from backtest.engine import run_backtest
from strategies.registry import REQUIRES_FIT


def run_all_stocks(
    strategies: list,
    use_pairs: bool,
    tickers: list,
    start: str,
    end: str,
    initial_cash: float = 10_000.0,
    tc_pct: float = 0.001,
    train_start: str = "2020-01-01",
    progress_callback=None,
) -> tuple:
    """
    Run all strategies on all tickers.

    Args:
        strategies:        List of instantiated (but possibly un-fit) strategy objects
        use_pairs:         Whether to also run PairsBacktester
        tickers:           List of ticker symbols
        start / end:       Backtest date range (YYYY-MM-DD strings)
        initial_cash:      Starting capital per strategy per ticker
        tc_pct:            Per-trade transaction cost fraction
        train_start:       Start of training data for ML strategies
        progress_callback: Optional callable(current, total, message)

    Returns:
        (batch_results, metadata) tuple — see module docstring
    """
    from strategies.registry import REQUIRES_FIT

    needs_fit = any(s.name in REQUIRES_FIT for s in strategies)

    # Identify ML strategy classes for re-instantiation
    fit_strategy_specs = []
    for s in strategies:
        if s.name in REQUIRES_FIT:
            fit_strategy_specs.append((type(s), s.__dict__.copy()))

    batch_results: dict = {}
    metadata: dict = {"lstm_by_ticker": {}}

    total_steps = len(tickers) + (1 if use_pairs else 0)
    step = 0

    # ── Fetch test-period prices for all tickers ──────────────────────────
    if progress_callback:
        progress_callback(step, total_steps, "Fetching price data...")

    universe_prices = fetch_multiple(tickers, start, end)

    # ── Fetch training prices if needed ───────────────────────────────────
    train_prices_all = {}
    if needs_fit:
        if progress_callback:
            progress_callback(step, total_steps, "Fetching training data (2020–2024)...")
        train_prices_all = fetch_multiple(tickers, train_start, "2024-12-31")

    # ── Per-ticker loop ───────────────────────────────────────────────────
    for ticker in tickers:
        step += 1
        if progress_callback:
            progress_callback(step, total_steps, f"Running strategies on {ticker}...")

        if ticker not in universe_prices:
            print(f"  Skipping {ticker}: price data unavailable")
            continue

        prices = universe_prices[ticker]
        ticker_results: dict = {}

        for strategy in strategies:
            # Re-instantiate ML strategies per ticker so fit() state doesn't leak
            if strategy.name in REQUIRES_FIT:
                strat = _reinstantiate(strategy)
                if ticker in train_prices_all:
                    try:
                        strat.fit(train_prices_all[ticker])
                    except Exception as e:
                        print(f"  {strat.name} fit failed for {ticker}: {e}")
                        continue
                else:
                    print(f"  Skipping {strat.name} for {ticker}: no training data")
                    continue

                # Store LSTMStrategy object for AI Analysis tab
                if strat.name == "LSTM Multi-Signal":
                    metadata["lstm_by_ticker"][ticker] = strat
            else:
                strat = strategy

            try:
                result = run_backtest(strat, prices, initial_cash, tc_pct)
                ticker_results[strat.name] = result
            except Exception as e:
                print(f"  {strat.name} backtest failed for {ticker}: {e}")

        batch_results[ticker] = ticker_results

    # ── Pairs trading (one run across the full universe) ──────────────────
    if use_pairs:
        step += 1
        if progress_callback:
            progress_callback(step, total_steps, "Running pairs trading strategy...")

        try:
            from strategies.pairs_trading import PairsBacktester
            pairs = PairsBacktester()
            result = pairs.run(universe_prices, initial_cash, tc_pct)
            batch_results["PAIRS"] = {"Pairs Trading": result}
            print(f"  Pairs Trading: {pairs.ticker_a}/{pairs.ticker_b} "
                  f"return={result['metrics']['total_return']:+.1%}")
        except Exception as e:
            print(f"  Pairs trading failed: {e}")

    return batch_results, metadata


def _reinstantiate(strategy):
    """
    Create a fresh instance of the same strategy class, preserving all
    constructor-level hyperparameters. Avoids deepcopy of Keras model weights.
    """
    from strategies.ml_signal import MLSignal
    from strategies.lstm_strategy import LSTMStrategy

    cls = type(strategy)

    if cls is LSTMStrategy:
        return cls(
            train_end       = strategy.train_end,
            sequence_length = strategy.sequence_length,
            lstm_units_1    = strategy.lstm_units_1,
            lstm_units_2    = strategy.lstm_units_2,
            dropout_rate    = strategy.dropout_rate,
            buy_threshold   = strategy.buy_threshold,
            sell_threshold  = strategy.sell_threshold,
            epochs          = strategy.epochs,
            batch_size      = strategy.batch_size,
            patience        = strategy.patience,
        )

    if cls is MLSignal:
        return cls(train_end=strategy.train_end)

    if hasattr(strategy, "train_end"):
        return cls(train_end=strategy.train_end)

    return cls()
