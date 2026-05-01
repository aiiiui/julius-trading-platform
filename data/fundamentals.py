"""
Fundamental valuation data via yfinance.
Caches per-ticker for 6 hours (fundamentals don't change intraday).
"""
from __future__ import annotations

import time
from typing import Any, Dict, Optional

import yfinance as yf

# Sector-typical trailing P/E used for relative scoring
_SECTOR_PE: Dict[str, float] = {
    'Technology':            30.0,
    'Communication Services':22.0,
    'Consumer Cyclical':     22.0,
    'Consumer Defensive':    20.0,
    'Healthcare':            25.0,
    'Financials':            13.0,
    'Financial Services':    13.0,
    'Industrials':           20.0,
    'Energy':                12.0,
    'Utilities':             18.0,
    'Real Estate':           35.0,
    'Basic Materials':       15.0,
}
_DEFAULT_PE = 20.0

# (result, fetched_at) — in-memory cache, 6 h TTL
_cache: Dict[str, tuple[Dict[str, Any], float]] = {}
_TTL = 6 * 3600


def _valuation_label(pe: Optional[float], sector: str) -> tuple[str, float]:
    """
    Returns (label, score_0_to_100) where 0 = cheapest, 100 = most expensive.
    Score is relative to the sector's typical P/E.
    """
    if pe is None or pe <= 0:
        return 'Unknown', 50.0
    sector_pe = _SECTOR_PE.get(sector, _DEFAULT_PE)
    ratio = pe / sector_pe
    score = min(100.0, max(0.0, ratio * 50.0))   # 50 = at sector avg
    if ratio < 0.65:
        return 'Buy Now', score
    if ratio < 0.88:
        return 'Good Price', score
    if ratio < 1.15:
        return 'Fair', score
    if ratio < 1.50:
        return 'High', score
    return 'Expensive', score


def fetch_fundamentals(ticker: str) -> Dict[str, Any]:
    """Return fundamental metrics for a single ticker, with 6 h caching."""
    now = time.time()
    if ticker in _cache:
        data, ts = _cache[ticker]
        if now - ts < _TTL:
            return data

    try:
        info = yf.Ticker(ticker).info
    except Exception:
        info = {}

    pe          = info.get('trailingPE')
    forward_pe  = info.get('forwardPE')
    pb          = info.get('priceToBook')
    peg         = info.get('pegRatio')
    ev_ebitda   = info.get('enterpriseToEbitda')
    ps          = info.get('priceToSalesTrailingTwelveMonths')
    market_cap  = info.get('marketCap')
    sector      = info.get('sector') or ''
    industry    = info.get('industry') or ''
    eps         = info.get('trailingEps')
    div_yield   = info.get('dividendYield')
    beta        = info.get('beta')
    short_float = info.get('shortPercentOfFloat')
    analyst_target = info.get('targetMeanPrice')
    current_price  = info.get('currentPrice') or info.get('regularMarketPrice')

    label, score = _valuation_label(pe, sector)

    # Upside to analyst target
    upside = None
    if analyst_target and current_price and current_price > 0:
        upside = round((analyst_target / current_price - 1) * 100, 1)

    result: Dict[str, Any] = {
        'ticker':          ticker,
        'sector':          sector,
        'industry':        industry,
        'pe':              round(pe, 2)         if pe         is not None else None,
        'forward_pe':      round(forward_pe, 2) if forward_pe is not None else None,
        'pb':              round(pb, 2)         if pb         is not None else None,
        'peg':             round(peg, 2)        if peg        is not None else None,
        'ev_ebitda':       round(ev_ebitda, 2)  if ev_ebitda  is not None else None,
        'ps':              round(ps, 2)         if ps         is not None else None,
        'eps':             round(eps, 2)        if eps        is not None else None,
        'div_yield':       round(div_yield * 100, 2) if div_yield is not None else None,
        'beta':            round(beta, 2)       if beta       is not None else None,
        'short_float':     round(short_float * 100, 1) if short_float is not None else None,
        'market_cap':      market_cap,
        'analyst_target':  analyst_target,
        'upside_pct':      upside,
        'valuation_label': label,
        'valuation_score': round(score, 1),
    }

    _cache[ticker] = (result, now)
    return result


def fetch_fundamentals_batch(tickers: list[str]) -> list[Dict[str, Any]]:
    return [fetch_fundamentals(t) for t in tickers]
