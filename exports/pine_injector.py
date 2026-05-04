"""
Pine Script signal injector.

Reads the cached RSI + Bollinger Bands backtest signals for a ticker and
emits a Pine Script indicator that plots those exact BUY / SELL markers
on a TradingView chart, matching the Python backtest to the bar.

Usage (from api.py):
    from exports.pine_injector import generate_signal_injector
    script = generate_signal_injector(ticker, signals_series, start, end, params)
"""

from __future__ import annotations

import pandas as pd
from datetime import datetime


_HEADER = """\
// ════════════════════════════════════════════════════════════════════════════
// Julius Trading Platform — RSI + BB Historical Signals (Injector)
// Ticker : {ticker}
// Period : {start}  →  {end}
// Params : RSI({rsi_period})  OB={rsi_ob}  OS={rsi_os}  BB({bb_period}, {bb_std}σ)
//
// HOW TO USE:
//   1. Open TradingView → Pine Script Editor (bottom panel)
//   2. Paste this entire script and click "Add to chart"
//   3. Switch chart to the DAILY timeframe for {ticker}
//   4. The B / S markers will appear exactly where the Python backtest fired
//
// NOTE: Markers are locked to the dates below — they do NOT recalculate
//       on shorter timeframes.  Switch to "D" (1D) for correct alignment.
// ════════════════════════════════════════════════════════════════════════════

//@version=5
indicator(
     title     = "Julius | {ticker} RSI+BB Signals ({start}–{end})",
     shorttitle= "Julius Signals {ticker}",
     overlay   = true
)

"""

_ARRAYS = """\
// ── Embedded signal timestamps (Unix ms, UTC midnight) ───────────────────────
// Generated {generated_at}

int[] buyTs  = array.from({buy_ts})
int[] sellTs = array.from({sell_ts})

"""

_LOGIC = """\
// ── Match current bar to a signal timestamp ──────────────────────────────────
int   barMs    = time                                // bar open-time in ms
bool  isBuy    = false
bool  isSell   = false

for i = 0 to array.size(buyTs) - 1
    int t = array.get(buyTs, i)
    if barMs >= t and barMs < t + 86400000           // within same UTC day
        isBuy := true
        break

for i = 0 to array.size(sellTs) - 1
    int t = array.get(sellTs, i)
    if barMs >= t and barMs < t + 86400000
        isSell := true
        break

// ── Plot markers ─────────────────────────────────────────────────────────────
plotshape(
     isBuy,
     title     = "BUY Signal",
     style     = shape.labelup,
     location  = location.belowbar,
     color     = color.new(color.green, 0),
     textcolor = color.white,
     text      = "B",
     size      = size.small
)

plotshape(
     isSell,
     title     = "SELL Signal",
     style     = shape.labeldown,
     location  = location.abovebar,
     color     = color.new(color.red, 0),
     textcolor = color.white,
     text      = "S",
     size      = size.small
)

// ── Background tint when a BUY or SELL fires ─────────────────────────────────
bgcolor(isBuy  ? color.new(color.green, 88) : na, title="BUY bar")
bgcolor(isSell ? color.new(color.red,   88) : na, title="SELL bar")

// ── Info table ────────────────────────────────────────────────────────────────
var table tbl = table.new(position.top_right, 2, 6,
     bgcolor      = color.new(color.white, 85),
     border_color = color.new(color.gray,  60),
     border_width = 1,
     frame_color  = color.new(color.gray,  40),
     frame_width  = 1
)

if barstate.islast
    table.cell(tbl, 0, 0, "Julius Backtest",          text_color=color.new(color.blue, 20), text_size=size.small, text_halign=text.align_center)
    table.cell(tbl, 1, 0, "{ticker} · RSI+BB",        text_color=color.new(color.blue, 20), text_size=size.small, text_halign=text.align_center)
    table.cell(tbl, 0, 1, "Period",    text_size=size.small)
    table.cell(tbl, 1, 1, "{start} – {end}",          text_size=size.small)
    table.cell(tbl, 0, 2, "BUY signals",  text_size=size.small)
    table.cell(tbl, 1, 2, str.tostring({n_buy}),      text_size=size.small, text_color=color.green)
    table.cell(tbl, 0, 3, "SELL signals", text_size=size.small)
    table.cell(tbl, 1, 3, str.tostring({n_sell}),     text_size=size.small, text_color=color.red)
    table.cell(tbl, 0, 4, "RSI period",  text_size=size.small)
    table.cell(tbl, 1, 4, "{rsi_period}",             text_size=size.small)
    table.cell(tbl, 0, 5, "BB period",   text_size=size.small)
    table.cell(tbl, 1, 5, "{bb_period}",              text_size=size.small)
"""


def _to_unix_ms(dt) -> int:
    """Convert a date or datetime to Unix milliseconds (UTC midnight)."""
    if hasattr(dt, "date"):
        dt = dt.date()
    epoch = datetime(1970, 1, 1)
    d = datetime(dt.year, dt.month, dt.day)
    return int((d - epoch).total_seconds() * 1000)


def _format_array(values: list[int]) -> str:
    """Format a list of ints as a Pine array.from() call body."""
    if not values:
        return "na"
    # Pine Script has a line-length limit; split into chunks of 8
    chunks = [values[i : i + 8] for i in range(0, len(values), 8)]
    lines  = [", ".join(str(v) for v in chunk) for chunk in chunks]
    return ",\n     ".join(lines)


def generate_signal_injector(
    ticker: str,
    signals: "pd.Series",
    start: str,
    end: str,
    params: dict | None = None,
) -> str:
    """
    Build a Pine Script indicator that replays backtest signals as markers.

    Args:
        ticker:   Stock symbol, e.g. "AAPL"
        signals:  pd.Series with DatetimeIndex and values  1=BUY  -1=SELL  0=HOLD
        start:    ISO date string "YYYY-MM-DD"
        end:      ISO date string "YYYY-MM-DD"
        params:   Strategy param overrides (rsi_period, rsi_ob, rsi_os, bb_period, bb_std)

    Returns:
        Full Pine Script v5 source as a string.
    """
    p = params or {}
    rsi_period = p.get("rsi_period", 14)
    rsi_ob     = p.get("rsi_overbought", 70)
    rsi_os     = p.get("rsi_oversold",   30)
    bb_period  = p.get("bb_period", 20)
    bb_std     = p.get("bb_std",    2.0)

    buy_dates  = signals[signals ==  1].index.tolist()
    sell_dates = signals[signals == -1].index.tolist()

    buy_ts  = [_to_unix_ms(d) for d in buy_dates]
    sell_ts = [_to_unix_ms(d) for d in sell_dates]

    subs = dict(
        ticker      = ticker.upper(),
        start       = start,
        end         = end,
        rsi_period  = rsi_period,
        rsi_ob      = rsi_ob,
        rsi_os      = rsi_os,
        bb_period   = bb_period,
        bb_std      = bb_std,
        n_buy       = len(buy_ts),
        n_sell      = len(sell_ts),
        generated_at= datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
        buy_ts      = _format_array(buy_ts),
        sell_ts     = _format_array(sell_ts),
    )

    script = (
        _HEADER.format(**subs)
        + _ARRAYS.format(**subs)
        + _LOGIC.format(**subs)
    )
    return script
