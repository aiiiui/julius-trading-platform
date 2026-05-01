"""
Paper trading engine.

Generates signals from existing strategies on live (fresh) market data,
then applies BUY/SELL signals to the virtual PaperPortfolio.

Data separation:
  - Live data   → paper_trade/live_data.py  (always fresh, no cache)
  - Backtest    → data/fetcher.py            (cached parquet, fixed 2025 window)

ML strategy training still uses the cached 2020–2024 historical data
(that data is fixed and appropriate for feature engineering).
"""

import pandas as pd
from datetime import date

from paper_trade.live_data import fetch_live_ohlcv, fetch_live_multiple, latest_close
from paper_trade.state import PaperPortfolio
from strategies.registry import STRATEGY_REGISTRY, REQUIRES_FIT, build_strategies

_TRAIN_START = "2020-01-01"
_TRAIN_END   = "2024-12-31"
_SIGNAL_MAP  = {1: "BUY", 0: "HOLD", -1: "SELL"}


def get_current_signals(
    tickers: list,
    strategy_names: list,
) -> pd.DataFrame:
    """
    For each ticker × strategy pair, return the most recent signal.

    Returns a DataFrame:  rows = tickers, cols = strategy names
                          values ∈ {"BUY", "HOLD", "SELL", "N/A"}
    """
    all_prices = fetch_live_multiple(tickers)
    rows = {}

    for ticker, prices in all_prices.items():
        rows[ticker] = {}
        strategies = build_strategies(strategy_names)

        for strat in strategies:
            try:
                if strat.name in REQUIRES_FIT:
                    from data.fetcher import fetch_ohlcv
                    train_df = fetch_ohlcv(ticker, _TRAIN_START, _TRAIN_END)
                    strat.fit(train_df)

                signals = strat.generate_signals(prices)
                last    = int(signals.iloc[-1])
                rows[ticker][strat.name] = _SIGNAL_MAP.get(last, "HOLD")
            except Exception as exc:
                rows[ticker][strat.name] = "N/A"
                print(f"[engine] {ticker}/{strat.name}: {exc}")

    if not rows:
        return pd.DataFrame()
    return pd.DataFrame(rows).T


def update_portfolio(
    portfolio: PaperPortfolio,
    tickers: list,
    strategy_name: str,
) -> tuple:
    """
    Refresh live data, generate signals from `strategy_name`, apply trades,
    record today's portfolio value, and persist state.

    Returns:
        signals_df  — DataFrame with current signal per ticker
        prices      — {ticker: latest_close_price}
    """
    all_prices = fetch_live_multiple(tickers)
    today = str(date.today())

    strategies = build_strategies([strategy_name])
    strat = strategies[0]

    current_prices = {}
    signal_row     = {}

    for ticker, prices in all_prices.items():
        price = latest_close(prices)
        current_prices[ticker] = price

        try:
            if strat.name in REQUIRES_FIT:
                from data.fetcher import fetch_ohlcv
                train_df = fetch_ohlcv(ticker, _TRAIN_START, _TRAIN_END)
                strat_instance = build_strategies([strategy_name])[0]
                strat_instance.fit(train_df)
                signals = strat_instance.generate_signals(prices)
            else:
                signals = strat.generate_signals(prices)

            last   = int(signals.iloc[-1])
            signal = _SIGNAL_MAP.get(last, "HOLD")
        except Exception as exc:
            print(f"[engine] update {ticker}: {exc}")
            signal = "N/A"

        signal_row[ticker] = signal

        # Execute virtual trade
        if signal == "BUY":
            portfolio.buy(ticker, price, today)
        elif signal == "SELL":
            portfolio.sell(ticker, price, today)

        portfolio.record_value(ticker, price, today)

    portfolio.strategy_name = strategy_name
    portfolio.save()

    signals_df = pd.DataFrame([signal_row]).T
    signals_df.columns = [strategy_name]
    return signals_df, current_prices
