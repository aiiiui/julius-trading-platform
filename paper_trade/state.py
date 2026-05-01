"""
PaperPortfolio — persistent virtual portfolio for paper trading.

Each ticker is tracked independently with its own cash allocation,
mirroring the per-ticker structure of the backtesting engine.
State is persisted to portfolio_state.json so it survives app restarts.
"""

import json
from datetime import date
from pathlib import Path

STATE_FILE = Path(__file__).parent / "portfolio_state.json"


class PaperPortfolio:
    def __init__(self, initial_cash: float = 10_000.0, tc_pct: float = 0.001):
        self.initial_cash   = initial_cash
        self.tc_pct         = tc_pct
        self.start_date     = str(date.today())
        self.strategy_name  = ""

        # Per-ticker sub-portfolios — keyed by ticker symbol
        # Each entry: {cash, shares, in_position, entry_price, entry_date, trades, value_history}
        self.tickers: dict = {}

    # ── Ticker management ──────────────────────────────────────────────────────

    def init_ticker(self, ticker: str):
        """Add a new ticker to the portfolio with a fresh allocation."""
        if ticker not in self.tickers:
            self.tickers[ticker] = {
                "cash":          self.initial_cash,
                "shares":        0.0,
                "in_position":   False,
                "entry_price":   0.0,
                "entry_date":    "",
                "trades":        [],
                "value_history": [],
            }

    # ── Trade execution ────────────────────────────────────────────────────────

    def buy(self, ticker: str, price: float, trade_date: str = None):
        self.init_ticker(ticker)
        t = self.tickers[ticker]
        if t["in_position"]:
            return
        trade_date = trade_date or str(date.today())
        cost       = t["cash"] * self.tc_pct
        investable = t["cash"] - cost
        t["shares"]      = investable / price
        t["cash"]        = 0.0
        t["in_position"] = True
        t["entry_price"] = price
        t["entry_date"]  = trade_date
        t["trades"].append({
            "date": trade_date, "action": "BUY",
            "price": price, "shares": t["shares"], "cost": cost,
        })

    def sell(self, ticker: str, price: float, trade_date: str = None):
        if ticker not in self.tickers or not self.tickers[ticker]["in_position"]:
            return
        trade_date = trade_date or str(date.today())
        t          = self.tickers[ticker]
        proceeds   = t["shares"] * price
        cost       = proceeds * self.tc_pct
        pnl        = (price - t["entry_price"]) * t["shares"] - cost
        t["cash"]        = proceeds - cost
        t["shares"]      = 0.0
        t["in_position"] = False
        t["entry_price"] = 0.0
        t["entry_date"]  = ""
        t["trades"].append({
            "date": trade_date, "action": "SELL",
            "price": price, "cost": cost, "pnl": round(pnl, 2),
        })

    # ── Value recording ────────────────────────────────────────────────────────

    def record_value(self, ticker: str, current_price: float, record_date: str = None):
        """Snapshot today's portfolio value for one ticker."""
        self.init_ticker(ticker)
        t           = self.tickers[ticker]
        record_date = record_date or str(date.today())
        value       = t["cash"] + t["shares"] * current_price
        t["value_history"].append({"date": record_date, "value": round(value, 2)})

    # ── Read-only helpers ──────────────────────────────────────────────────────

    def current_value(self, ticker: str, current_price: float) -> float:
        if ticker not in self.tickers:
            return self.initial_cash
        t = self.tickers[ticker]
        return t["cash"] + t["shares"] * current_price

    def pnl_pct(self, ticker: str, current_price: float) -> float:
        val = self.current_value(ticker, current_price)
        return (val - self.initial_cash) / self.initial_cash

    def total_value(self, current_prices: dict) -> float:
        """Sum of all ticker sub-portfolio values."""
        total = 0.0
        for ticker in self.tickers:
            price = current_prices.get(ticker, self.tickers[ticker]["entry_price"] or 0)
            total += self.current_value(ticker, price)
        if not self.tickers:
            return 0.0
        return total

    def total_pnl_pct(self, current_prices: dict) -> float:
        n = len(self.tickers)
        if n == 0:
            return 0.0
        baseline = self.initial_cash * n
        return (self.total_value(current_prices) - baseline) / baseline

    # ── Persistence ────────────────────────────────────────────────────────────

    def save(self):
        data = {
            "initial_cash":  self.initial_cash,
            "tc_pct":        self.tc_pct,
            "start_date":    self.start_date,
            "strategy_name": self.strategy_name,
            "tickers":       self.tickers,
        }
        STATE_FILE.write_text(json.dumps(data, indent=2, default=str))

    @classmethod
    def load(cls):
        if not STATE_FILE.exists():
            return None
        try:
            data = json.loads(STATE_FILE.read_text())
            p = cls(initial_cash=data["initial_cash"], tc_pct=data["tc_pct"])
            p.start_date    = data.get("start_date", str(date.today()))
            p.strategy_name = data.get("strategy_name", "")
            p.tickers       = data.get("tickers", {})
            return p
        except Exception:
            return None

    @classmethod
    def reset(cls):
        if STATE_FILE.exists():
            STATE_FILE.unlink()
