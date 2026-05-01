"""
News fetcher with VADER sentiment scoring.
Sources:
  - Yahoo Finance ticker RSS  (primary — 20 articles per ticker, free)
  - yfinance .news API        (secondary — catches items Yahoo RSS misses)
  - Market-wide RSS feeds     (Reuters, MarketWatch, etc.)
"""
from __future__ import annotations

import html
import re
import time
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import feedparser
import yfinance as yf
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

_analyzer = SentimentIntensityAnalyzer()

# ── Source credibility ─────────────────────────────────────────────────────────

_DOMAIN_CREDIBILITY: Dict[str, int] = {
    'reuters.com':          90,
    'bloomberg.com':        92,
    'wsj.com':              90,
    'ft.com':               88,
    'cnbc.com':             80,
    'marketwatch.com':      82,
    'barrons.com':          85,
    'finance.yahoo.com':    78,
    'yahoofinance.com':     78,
    'investopedia.com':     72,
    'thestreet.com':        70,
    'fool.com':             62,
    'seekingalpha.com':     65,
    'benzinga.com':         60,
    'businessinsider.com':  68,
    '247wallst.com':        58,
    'qz.com':               65,
    'ap.org':               90,
    'apnews.com':           90,
}

# Market-wide RSS feeds (no API key needed)
_MARKET_RSS: List[tuple[str, str, int]] = [
    ('Reuters Business',    'https://feeds.reuters.com/reuters/businessNews',                    90),
    ('Reuters Markets',     'https://feeds.reuters.com/reuters/UKmarkets',                       90),
    ('MarketWatch',         'https://feeds.content.dowjones.io/public/rss/mw_topstories',        82),
    ('Yahoo Finance',       'https://finance.yahoo.com/news/rssindex',                           78),
    ('Seeking Alpha',       'https://seekingalpha.com/feed.xml',                                 65),
]

# High-impact keywords
_IMPACT_KEYWORDS_HIGH   = {'earnings','revenue','guidance','acquisition','merger','bankruptcy',
                            'fed','rate','inflation','gdp','beats','misses','upgrade','downgrade',
                            'buyback','dividend','ipo','lawsuit','recall','fda','sec','fraud',
                            'tariff','sanctions','profit','loss'}
_IMPACT_KEYWORDS_MEDIUM = {'partnership','contract','deal','forecast','outlook','layoff','hire',
                            'ceo','cfo','board','product','launch','expansion','quarter','annual'}

# In-memory cache: {key: (items, fetched_ts)}
_cache: Dict[str, tuple[List[Dict[str, Any]], float]] = {}
_TTL_TICKER = 300    # 5 min
_TTL_MARKET = 600    # 10 min


# ── Helpers ───────────────────────────────────────────────────────────────────

def _clean(text: Optional[str]) -> str:
    if not text:
        return ''
    text = html.unescape(text)
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def _sentiment(text: str) -> Dict[str, Any]:
    vs = _analyzer.polarity_scores(text)
    c = vs['compound']
    label = 'positive' if c >= 0.05 else 'negative' if c <= -0.05 else 'neutral'
    return {'compound': round(c, 3), 'label': label, 'pos': round(vs['pos'], 2), 'neg': round(vs['neg'], 2)}


def _credibility_for_domain(url: str) -> int:
    try:
        domain = urlparse(url).netloc.lower().replace('www.', '')
        for key, score in _DOMAIN_CREDIBILITY.items():
            if key in domain:
                return score
    except Exception:
        pass
    return 58


def _credibility_for_name(name: str) -> int:
    n = (name or '').lower()
    for key, score in _DOMAIN_CREDIBILITY.items():
        stripped = key.split('.')[0]
        if stripped in n:
            return score
    return 58


def _keyword_boost(title: str, summary: str) -> float:
    combined = (title + ' ' + summary).lower()
    if any(w in combined for w in _IMPACT_KEYWORDS_HIGH):
        return 1.4
    if any(w in combined for w in _IMPACT_KEYWORDS_MEDIUM):
        return 1.15
    return 1.0


def _impact(credibility: int, compound: float, boost: float) -> float:
    return round(min(10.0, (credibility / 100) * abs(compound) * 10 * boost), 2)


def _make_item(title: str, summary: str, source: str, url: str,
               published_ts: int, ticker: Optional[str]) -> Dict[str, Any]:
    title   = _clean(title)[:220]
    summary = _clean(summary)[:350]
    sent    = _sentiment(title + ' ' + summary)
    cred    = _credibility_for_domain(url) if url else _credibility_for_name(source)
    boost   = _keyword_boost(title, summary)
    return {
        'title':        title,
        'summary':      summary,
        'source':       source,
        'url':          url,
        'published':    published_ts,
        'ticker':       ticker,
        'sentiment':    sent,
        'credibility':  cred,
        'impact_score': _impact(cred, sent['compound'], boost),
    }


# ── Yahoo Finance ticker RSS (primary source) ─────────────────────────────────

def _yahoo_rss_ticker(ticker: str) -> List[Dict[str, Any]]:
    """Pull up to 20 articles from Yahoo Finance's free ticker RSS."""
    cache_key = f'yhrss:{ticker}'
    now = time.time()
    if cache_key in _cache:
        items, ts = _cache[cache_key]
        if now - ts < _TTL_TICKER:
            return items

    url = f'https://finance.yahoo.com/rss/headline?s={ticker}'
    items: List[Dict[str, Any]] = []
    try:
        feed = feedparser.parse(url)
        for entry in feed.entries[:20]:
            title   = entry.get('title', '')
            summary = entry.get('summary', '') or entry.get('description', '')
            link    = entry.get('link', '')
            pub_ts  = int(time.mktime(entry.published_parsed)) if getattr(entry, 'published_parsed', None) else 0
            # Derive a readable source name from the link domain
            _DOMAIN_NAMES = {
                'finance.yahoo.com': 'Yahoo Finance',
                'yahoo.com':         'Yahoo Finance',
                'fool.com':          'Motley Fool',
                'thestreet.com':     'The Street',
                'investopedia.com':  'Investopedia',
                'seekingalpha.com':  'Seeking Alpha',
                'marketwatch.com':   'MarketWatch',
                'wsj.com':           'WSJ',
                'cnbc.com':          'CNBC',
                'reuters.com':       'Reuters',
                'bloomberg.com':     'Bloomberg',
                '247wallst.com':     '24/7 Wall St',
                'barrons.com':       "Barron's",
                'businessinsider.com': 'Business Insider',
            }
            try:
                netloc = urlparse(link).netloc.lower().replace('www.', '')
                source = _DOMAIN_NAMES.get(netloc) or netloc.split('.')[0].title()
            except Exception:
                source = 'Yahoo Finance'
            if not title:
                continue
            items.append(_make_item(title, summary, source, link, pub_ts, ticker))
    except Exception:
        pass

    items.sort(key=lambda x: x['impact_score'], reverse=True)
    _cache[cache_key] = (items, now)
    return items


# ── yfinance .news API (secondary — catches exclusive Yahoo items) ─────────────

def _yfinance_news(ticker: str) -> List[Dict[str, Any]]:
    cache_key = f'yfapi:{ticker}'
    now = time.time()
    if cache_key in _cache:
        items, ts = _cache[cache_key]
        if now - ts < _TTL_TICKER:
            return items

    items: List[Dict[str, Any]] = []
    try:
        raw = yf.Ticker(ticker).news or []
        for n in raw:
            # New yfinance structure: everything is under 'content'
            c = n.get('content') or {}
            if not c:
                continue
            title   = c.get('title', '')
            summary = c.get('summary', '') or c.get('description', '')
            provider = c.get('provider', {})
            source  = provider.get('displayName', 'Yahoo Finance') if isinstance(provider, dict) else str(provider)
            url     = (c.get('canonicalUrl') or {}).get('url', '') or (c.get('clickThroughUrl') or {}).get('url', '')
            # pubDate is ISO string e.g. "2026-05-01T20:44:36Z"
            pub_str = c.get('pubDate', '')
            pub_ts  = 0
            if pub_str:
                try:
                    from datetime import datetime, timezone
                    pub_ts = int(datetime.fromisoformat(pub_str.replace('Z','+00:00')).timestamp())
                except Exception:
                    pass
            if not title:
                continue
            items.append(_make_item(title, summary, source, url, pub_ts, ticker))
    except Exception:
        pass

    items.sort(key=lambda x: x['impact_score'], reverse=True)
    _cache[cache_key] = (items, now)
    return items


# ── Market-wide RSS ───────────────────────────────────────────────────────────

def _market_rss(max_per_feed: int = 10) -> List[Dict[str, Any]]:
    cache_key = 'rss:market'
    now = time.time()
    if cache_key in _cache:
        items, ts = _cache[cache_key]
        if now - ts < _TTL_MARKET:
            return items

    items: List[Dict[str, Any]] = []
    for source_name, url, _ in _MARKET_RSS:
        try:
            feed = feedparser.parse(url)
            for entry in feed.entries[:max_per_feed]:
                title   = entry.get('title', '')
                summary = entry.get('summary', '') or entry.get('description', '')
                link    = entry.get('link', '')
                pub_ts  = int(time.mktime(entry.published_parsed)) if getattr(entry, 'published_parsed', None) else 0
                if not title:
                    continue
                items.append(_make_item(title, summary, source_name, link, pub_ts, None))
        except Exception:
            continue

    items.sort(key=lambda x: x['impact_score'], reverse=True)
    _cache[cache_key] = (items, now)
    return items


# ── Public API ────────────────────────────────────────────────────────────────

def fetch_news(tickers: List[str], include_market: bool = True, limit: int = 30) -> List[Dict[str, Any]]:
    """
    Merge ticker news (Yahoo RSS + yfinance API) + market RSS.
    Returns items sorted by impact_score, deduped, capped at limit.
    """
    all_items: List[Dict[str, Any]] = []

    for ticker in tickers:
        # Yahoo Finance ticker RSS is the primary source (more articles, better formatting)
        all_items.extend(_yahoo_rss_ticker(ticker))
        # yfinance API catches a few exclusive items
        all_items.extend(_yfinance_news(ticker))

    if include_market:
        all_items.extend(_market_rss())

    # Deduplicate by first 70 chars of title (lowercased)
    seen: set[str] = set()
    deduped: List[Dict[str, Any]] = []
    for item in all_items:
        key = item['title'][:70].lower()
        if key not in seen:
            seen.add(key)
            deduped.append(item)

    deduped.sort(key=lambda x: x['impact_score'], reverse=True)
    return deduped[:limit]


def market_sentiment_summary(items: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not items:
        return {'label': 'Neutral', 'score': 0.0, 'positive': 0, 'negative': 0, 'neutral': 0}
    pos = sum(1 for i in items if i['sentiment']['label'] == 'positive')
    neg = sum(1 for i in items if i['sentiment']['label'] == 'negative')
    neu = sum(1 for i in items if i['sentiment']['label'] == 'neutral')
    avg = sum(i['sentiment']['compound'] for i in items) / len(items)
    label = 'Bullish' if avg > 0.05 else 'Bearish' if avg < -0.05 else 'Neutral'
    return {'label': label, 'score': round(avg, 3), 'positive': pos, 'negative': neg, 'neutral': neu}
