"""
TradingView embeddable widget HTML generators.

All three use TradingView's official free embedding API — no API key required.
Embed in Streamlit via:  st.components.v1.html(html_string, height=N, scrolling=False)
"""

# Exchange prefix map for the Advanced Chart symbol field
_EXCHANGE = {
    "AAPL": "NASDAQ", "MSFT": "NASDAQ", "GOOGL": "NASDAQ", "AMZN": "NASDAQ",
    "NVDA": "NASDAQ", "META": "NASDAQ", "TSLA": "NASDAQ", "NFLX": "NASDAQ",
    "JPM": "NYSE",    "BAC": "NYSE",    "WFC": "NYSE",    "GS": "NYSE",
    "MS": "NYSE",     "C": "NYSE",      "BLK": "NYSE",    "AXP": "NYSE",
    "XOM": "NYSE",    "CVX": "NYSE",    "COP": "NYSE",    "SLB": "NYSE",
    "OXY": "NYSE",    "PSX": "NYSE",    "VLO": "NYSE",    "MPC": "NYSE",
    "SPY": "AMEX",
}


def tradingview_chart_widget(
    ticker: str,
    interval: str = "D",
    height: int = 520,
    theme: str = "dark",
) -> str:
    """
    Full interactive Advanced Chart for one ticker with RSI + MACD overlays.

    Args:
        ticker:   Stock symbol, e.g. 'AAPL'
        interval: 'D' daily | 'W' weekly | '60' hourly | '15' 15-min
        height:   Total HTML block height in pixels
        theme:    'dark' or 'light'
    """
    exchange = _EXCHANGE.get(ticker.upper(), "NASDAQ")
    symbol   = f"{exchange}:{ticker.upper()}"

    return f"""
<div style="height:{height}px; width:100%;">
  <div class="tradingview-widget-container" style="height:100%;width:100%;">
    <div class="tradingview-widget-container__widget"
         style="height:calc(100% - 28px);width:100%;"></div>
    <div class="tradingview-widget-copyright" style="font-size:11px; color:#888;">
      <a href="https://www.tradingview.com/" rel="noopener nofollow" target="_blank">
        Chart by TradingView
      </a>
    </div>
    <script type="text/javascript"
      src="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js"
      async>
    {{
      "autosize": true,
      "symbol": "{symbol}",
      "interval": "{interval}",
      "timezone": "Etc/UTC",
      "theme": "{theme}",
      "style": "1",
      "locale": "en",
      "allow_symbol_change": true,
      "studies": [
        "RSI@tv-basicstudies",
        "MACD@tv-basicstudies"
      ],
      "support_host": "https://www.tradingview.com"
    }}
    </script>
  </div>
</div>
"""


def tradingview_ticker_tape() -> str:
    """
    Horizontal scrolling ticker tape: S&P 500, key stocks, VIX.
    Height is fixed ~60 px by the widget itself.
    """
    return """
<div class="tradingview-widget-container">
  <div class="tradingview-widget-container__widget"></div>
  <script type="text/javascript"
    src="https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js"
    async>
  {
    "symbols": [
      {"proName": "FOREXCOM:SPXUSD",  "title": "S&P 500"},
      {"proName": "FOREXCOM:NSXUSD",  "title": "Nasdaq 100"},
      {"proName": "CBOE:VIX",         "title": "VIX"},
      {"proName": "NASDAQ:AAPL",      "title": "Apple"},
      {"proName": "NASDAQ:MSFT",      "title": "Microsoft"},
      {"proName": "NASDAQ:NVDA",      "title": "NVIDIA"},
      {"proName": "NASDAQ:GOOGL",     "title": "Alphabet"},
      {"proName": "NYSE:JPM",         "title": "JPMorgan"},
      {"proName": "NYSE:GS",          "title": "Goldman Sachs"},
      {"proName": "NYSE:XOM",         "title": "ExxonMobil"},
      {"proName": "NYSE:CVX",         "title": "Chevron"}
    ],
    "showSymbolLogo": true,
    "isTransparent": false,
    "displayMode": "adaptive",
    "colorTheme": "dark",
    "locale": "en"
  }
  </script>
</div>
"""


def tradingview_market_overview(height: int = 550) -> str:
    """
    Market overview with sector tabs: Indices, Tech, Finance, Energy.
    """
    return f"""
<div class="tradingview-widget-container" style="width:100%;">
  <div class="tradingview-widget-container__widget"></div>
  <div class="tradingview-widget-copyright" style="font-size:11px; color:#888;">
    <a href="https://www.tradingview.com/" rel="noopener nofollow" target="_blank">
      Market data by TradingView
    </a>
  </div>
  <script type="text/javascript"
    src="https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js"
    async>
  {{
    "colorTheme": "dark",
    "dateRange": "3M",
    "showChart": true,
    "locale": "en",
    "isTransparent": false,
    "showSymbolLogo": true,
    "showFloatingTooltip": false,
    "width": "100%",
    "height": "{height}",
    "plotLineColorGrowing": "rgba(41,98,255,1)",
    "plotLineColorFalling": "rgba(255,74,74,1)",
    "gridLineColor":        "rgba(42,46,57,0)",
    "scaleFontColor":       "rgba(200,200,200,1)",
    "belowLineFillColorGrowing":       "rgba(41,98,255,0.10)",
    "belowLineFillColorFalling":       "rgba(255,74,74,0.10)",
    "belowLineFillColorGrowingBottom": "rgba(41,98,255,0)",
    "belowLineFillColorFallingBottom": "rgba(255,74,74,0)",
    "symbolActiveColor": "rgba(41,98,255,0.12)",
    "tabs": [
      {{
        "title": "Indices",
        "symbols": [
          {{"s": "FOREXCOM:SPXUSD", "d": "S&P 500"}},
          {{"s": "FOREXCOM:NSXUSD", "d": "Nasdaq 100"}},
          {{"s": "FOREXCOM:DJI",    "d": "Dow Jones"}},
          {{"s": "CBOE:VIX",        "d": "VIX"}}
        ]
      }},
      {{
        "title": "Tech",
        "symbols": [
          {{"s": "NASDAQ:AAPL"}},
          {{"s": "NASDAQ:MSFT"}},
          {{"s": "NASDAQ:NVDA"}},
          {{"s": "NASDAQ:GOOGL"}},
          {{"s": "NASDAQ:META"}},
          {{"s": "NASDAQ:AMZN"}}
        ]
      }},
      {{
        "title": "Finance",
        "symbols": [
          {{"s": "NYSE:JPM"}},
          {{"s": "NYSE:BAC"}},
          {{"s": "NYSE:GS"}},
          {{"s": "NYSE:MS"}},
          {{"s": "NYSE:C"}},
          {{"s": "NYSE:WFC"}}
        ]
      }},
      {{
        "title": "Energy",
        "symbols": [
          {{"s": "NYSE:XOM"}},
          {{"s": "NYSE:CVX"}},
          {{"s": "NYSE:COP"}},
          {{"s": "NYSE:SLB"}},
          {{"s": "NYSE:OXY"}},
          {{"s": "NYSE:PSX"}}
        ]
      }}
    ]
  }}
  </script>
</div>
"""
