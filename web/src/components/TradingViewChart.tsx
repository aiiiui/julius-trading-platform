import { useEffect, useRef } from 'react'

const EXCHANGE: Record<string, string> = {
  // NASDAQ
  AAPL:'NASDAQ', MSFT:'NASDAQ', NVDA:'NASDAQ', GOOGL:'NASDAQ',
  META:'NASDAQ', AMZN:'NASDAQ', TSLA:'NASDAQ', AMD:'NASDAQ',
  INTC:'NASDAQ', QCOM:'NASDAQ', CSCO:'NASDAQ', ADBE:'NASDAQ',
  NFLX:'NASDAQ', CRM:'NASDAQ', ORCL:'NASDAQ', UBER:'NASDAQ',
  ABNB:'NASDAQ', COIN:'NASDAQ', SNOW:'NASDAQ', COST:'NASDAQ',
  SBUX:'NASDAQ', HON:'NASDAQ', PEP:'NASDAQ', PYPL:'NASDAQ',
  // NYSE
  JPM:'NYSE', BAC:'NYSE', GS:'NYSE', MS:'NYSE', BLK:'NYSE',
  V:'NYSE', MA:'NYSE', AXP:'NYSE', WFC:'NYSE', C:'NYSE', SCHW:'NYSE',
  XOM:'NYSE', CVX:'NYSE', COP:'NYSE', SLB:'NYSE', PSX:'NYSE',
  EOG:'NYSE', OXY:'NYSE', MPC:'NYSE',
  JNJ:'NYSE', UNH:'NYSE', PFE:'NYSE', ABBV:'NYSE', MRK:'NYSE',
  LLY:'NYSE', ABT:'NYSE', TMO:'NYSE', BMY:'NYSE',
  PG:'NYSE', KO:'NYSE', WMT:'NYSE', HD:'NYSE', MCD:'NYSE', NKE:'NYSE',
  BA:'NYSE', CAT:'NYSE', GE:'NYSE', RTX:'NYSE', UPS:'NYSE',
  NEE:'NYSE', DUK:'NYSE', SO:'NYSE', PLTR:'NYSE',
  SPY:'AMEX', QQQ:'NASDAQ',
}

export function tvSymbol(ticker: string): string {
  return `${EXCHANGE[ticker] ?? 'NASDAQ'}:${ticker}`
}

export const TV_STUDIES: Record<string, string> = {
  RSI:  'RSI@tv-basicstudies',
  MACD: 'MACD@tv-basicstudies',
  BB:   'BB@tv-basicstudies',
  EMA:  'MAExp@tv-basicstudies',
  VOL:  'Volume@tv-basicstudies',
}

interface Props {
  symbol: string
  interval?: string
  theme?: string
  studies?: string[]
  height?: number
}

export default function TradingViewChart({
  symbol,
  interval = 'D',
  theme = 'light',
  studies = [TV_STUDIES.RSI, TV_STUDIES.MACD],
  height = 460,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const uid = `tv_${symbol}_${Date.now().toString(36)}`
    container.innerHTML = `<div id="${uid}" style="height:${height}px"></div>`

    const init = () => {
      if (!(window as any).TradingView) return
      new (window as any).TradingView.widget({
        container_id: uid,
        autosize: true,
        symbol: tvSymbol(symbol),
        interval,
        timezone: 'Etc/UTC',
        theme: theme === 'dark' ? 'dark' : 'light',
        style: '1',
        locale: 'en',
        toolbar_bg: theme === 'dark' ? '#151614' : '#ffffff',
        enable_publishing: false,
        allow_symbol_change: true,
        hide_side_toolbar: false,
        studies,
        withdateranges: true,
        save_image: false,
        hide_legend: false,
        height,
      })
    }

    if ((window as any).TradingView) {
      init()
    } else {
      let script = document.getElementById('tv-js') as HTMLScriptElement | null
      if (!script) {
        script = document.createElement('script')
        script.id = 'tv-js'
        script.src = 'https://s3.tradingview.com/tv.js'
        script.async = true
        document.head.appendChild(script)
      }
      script.addEventListener('load', init, { once: true })
    }

    return () => { container.innerHTML = '' }
  }, [symbol, interval, theme, studies.join('|'), height])

  return (
    <div ref={containerRef} style={{ width: '100%', height, background: 'var(--bg)' }}/>
  )
}
