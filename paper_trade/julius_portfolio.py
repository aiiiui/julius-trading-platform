"""
JuliusPortfolio — quantity-based paper trading portfolio for the Julius React UI.

Unlike PaperPortfolio (all-in/out strategy follower), this allows arbitrary
buy/sell quantities, matching the Julius UI's brokerage-style order flow.
State persists to julius_state.json alongside portfolio_state.json.
"""

import json
from datetime import date
from pathlib import Path

_STATE_FILE = Path(__file__).parent / "julius_state.json"


class JuliusPortfolio:
    def __init__(self, cash: float = 100_000.0, tc_pct: float = 0.001):
        self.cash = cash
        self.initial_cash = cash
        self.tc_pct = tc_pct
        # {sym: {qty: int, entry: float, entryDate: str}}
        self.positions: dict = {}
        # [{date, sym, action, qty, price, pnl}]
        self.trades: list = []

    # ── Orders ────────────────────────────────────────────────────────────────

    def buy(self, sym: str, qty: int, price: float, trade_date: str = None):
        trade_date = trade_date or str(date.today())
        cost = qty * price * (1 + self.tc_pct)
        if cost > self.cash:
            return False, f"Insufficient cash: need €{cost:.2f}, have €{self.cash:.2f}"
        self.cash -= cost
        if sym in self.positions:
            pos = self.positions[sym]
            new_qty = pos["qty"] + qty
            avg_entry = (pos["qty"] * pos["entry"] + qty * price) / new_qty
            self.positions[sym] = {"qty": new_qty, "entry": round(avg_entry, 4), "entryDate": trade_date}
        else:
            self.positions[sym] = {"qty": qty, "entry": price, "entryDate": trade_date}
        self.trades.insert(0, {
            "date": trade_date, "sym": sym, "action": "BUY",
            "qty": qty, "price": price, "pnl": None,
        })
        return True, f"Bought {qty} {sym} @ €{price:.2f}"

    def sell(self, sym: str, qty: int, price: float, trade_date: str = None):
        trade_date = trade_date or str(date.today())
        pos = self.positions.get(sym)
        if not pos or pos["qty"] < qty:
            held = pos["qty"] if pos else 0
            return False, f"Insufficient position: have {held} {sym}, need {qty}"
        proceeds = qty * price * (1 - self.tc_pct)
        pnl = (price - pos["entry"]) * qty - qty * price * self.tc_pct
        self.cash += proceeds
        if pos["qty"] == qty:
            del self.positions[sym]
        else:
            self.positions[sym] = {**pos, "qty": pos["qty"] - qty}
        self.trades.insert(0, {
            "date": trade_date, "sym": sym, "action": "SELL",
            "qty": qty, "price": price, "pnl": round(pnl, 2),
        })
        return True, f"Sold {qty} {sym} @ €{price:.2f} · P&L €{pnl:+.0f}"

    # ── Serialization ──────────────────────────────────────────────────────────

    def to_dict(self) -> dict:
        return {
            "cash": round(self.cash, 2),
            "initial_cash": self.initial_cash,
            "tc_pct": self.tc_pct,
            "positions": self.positions,
            "trades": self.trades,
        }

    def save(self):
        _STATE_FILE.write_text(json.dumps(self.to_dict(), indent=2, default=str))

    @classmethod
    def load(cls):
        if not _STATE_FILE.exists():
            return None
        try:
            d = json.loads(_STATE_FILE.read_text())
            p = cls(cash=d["cash"], tc_pct=d.get("tc_pct", 0.001))
            p.initial_cash = d.get("initial_cash", d["cash"])
            p.positions = d.get("positions", {})
            p.trades = d.get("trades", [])
            return p
        except Exception:
            return None

    @classmethod
    def reset(cls):
        if _STATE_FILE.exists():
            _STATE_FILE.unlink()
