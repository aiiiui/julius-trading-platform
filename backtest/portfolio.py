"""
Portfolio state tracker for a single strategy run on a single stock.
Tracks cash, shares held, trade log, and daily portfolio value.
"""

import pandas as pd


class Portfolio:
    """
    Simulates a simple long-only portfolio:
    - Starts with initial_cash
    - Can be fully invested (all cash → shares) or fully in cash
    - No leverage, no short selling
    - Transaction cost applied on every buy/sell
    """

    def __init__(self, initial_cash: float = 10_000.0, transaction_cost_pct: float = 0.001):
        """
        Args:
            initial_cash: starting capital in EUR/USD
            transaction_cost_pct: cost per trade as fraction (0.001 = 0.1%)
        """
        self.initial_cash = initial_cash
        self.tc = transaction_cost_pct

        self.cash = initial_cash
        self.shares = 0.0
        self.in_position = False

        self.trades = []          # list of trade dicts
        self.daily_values = []    # list of (date, portfolio_value)

    def buy(self, date, price: float):
        if self.in_position:
            return  # already long, ignore duplicate buy signals
        cost = self.cash * self.tc
        investable = self.cash - cost
        self.shares = investable / price
        self.cash = 0.0
        self.in_position = True
        self.trades.append({"date": date, "action": "BUY", "price": price, "cost": cost})

    def sell(self, date, price: float):
        if not self.in_position:
            return  # already in cash, ignore duplicate sell signals
        proceeds = self.shares * price
        cost = proceeds * self.tc
        self.cash = proceeds - cost
        self.shares = 0.0
        self.in_position = False
        self.trades.append({"date": date, "action": "SELL", "price": price, "cost": cost})

    def record_value(self, date, price: float):
        value = self.cash + self.shares * price
        self.daily_values.append({"date": date, "value": value})

    def get_value_series(self) -> pd.Series:
        df = pd.DataFrame(self.daily_values).set_index("date")
        return df["value"]

    def get_trades_df(self) -> pd.DataFrame:
        if not self.trades:
            return pd.DataFrame(columns=["date", "action", "price", "cost"])
        return pd.DataFrame(self.trades).set_index("date")

    @property
    def total_return(self) -> float:
        final = self.daily_values[-1]["value"] if self.daily_values else self.initial_cash
        return (final - self.initial_cash) / self.initial_cash
