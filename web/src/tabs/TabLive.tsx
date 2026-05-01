import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Icons, Sparkline, SignalPill, fmt, useInterval } from '../components/ui'
import TradingViewChart, { TV_STUDIES } from '../components/TradingViewChart'
import ValuationBar from '../components/ValuationBar'
import { fetchLivePrices, fetchIndices, fetchLiveSignals, fetchPortfolio, initPortfolio, placeOrder, resetPortfolio, fetchFundamentals, fetchNews } from '../api'
import { STOCK_DB, getSuggestions, searchStocks } from '../lib/stockMeta'
import type { Portfolio, LiveSignal, IndexData, } from '../types'
import type { FundamentalData, NewsItem, SentimentSummary } from '../api'

// ── Constants ─────────────────────────────────────────────────────────────────

const UNIVERSE_EXTENDED: Record<string, string[]> = {
  Technology:  ['AAPL','MSFT','NVDA','GOOGL','META','AMZN','TSLA','AMD','INTC','QCOM','CSCO','ADBE','NFLX','CRM','ORCL','UBER','ABNB','COIN','SNOW','PLTR','PYPL'],
  Financials:  ['JPM','BAC','GS','MS','BLK','V','MA','AXP','WFC','C','SCHW'],
  Energy:      ['XOM','CVX','COP','SLB','PSX','EOG','OXY','MPC'],
  Healthcare:  ['JNJ','UNH','PFE','ABBV','MRK','LLY','ABT','TMO','BMY'],
  Consumer:    ['PG','KO','PEP','WMT','COST','HD','MCD','NKE','SBUX'],
  Industrials: ['BA','CAT','GE','HON','RTX','UPS'],
  Utilities:   ['NEE','DUK','SO'],
}

const ALL_TICKERS = Object.values(UNIVERSE_EXTENDED).flat()
const TAPE_TICKERS = ['AAPL','MSFT','NVDA','GOOGL','META','AMZN','TSLA','AMD','JPM','V','XOM','LLY','WMT','COST','BA','UNH']

const SCAN_STRATEGIES = ['EMA Crossover + Volume','RSI + Bollinger Bands','MACD + ADX','Buy & Hold']

const INDICATOR_TOGGLES = [
  { key:'RSI',  label:'RSI',    study:TV_STUDIES.RSI  },
  { key:'MACD', label:'MACD',   study:TV_STUDIES.MACD },
  { key:'BB',   label:'BB',     study:TV_STUDIES.BB   },
  { key:'EMA',  label:'EMA',    study:TV_STUDIES.EMA  },
  { key:'VOL',  label:'Volume', study:TV_STUDIES.VOL  },
]

const SUGGESTION_TABS = [
  { key:'sector',    label:'Sector Peers',    icon:'🏭', desc:'Same industry group'   },
  { key:'mcap',      label:'Market Cap',      icon:'📊', desc:'Similar size companies' },
  { key:'highVol',   label:'High Volatility', icon:'⚡', desc:'High beta, active moves'},
  { key:'lowVol',    label:'Low Volatility',  icon:'🛡', desc:'Stable, steady movers'  },
  { key:'defensive', label:'Defensive',       icon:'🏰', desc:'Crisis-resilient names'  },
] as const

type SuggestTab = typeof SUGGESTION_TABS[number]['key']

// ── Ticker search autocomplete ────────────────────────────────────────────────

function TickerSearch({
  value, onChange, prices, changes,
}: {
  value: string
  onChange: (sym: string) => void
  prices: Record<string, number>
  changes: Record<string, number>
}) {
  const [query, setQuery] = useState(value)
  const [open,  setOpen]  = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const results = useMemo(() => searchStocks(query, 8), [query])

  useEffect(() => { setQuery(value) }, [value])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const select = (sym: string) => {
    onChange(sym)
    setQuery(sym)
    setOpen(false)
  }

  return (
    <div ref={wrapRef} style={{ position:'relative', width:260 }}>
      <div style={{ position:'relative' }}>
        <Icons.Search size={13} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'var(--text-subtle)', pointerEvents:'none' }}/>
        <input
          className="input"
          style={{ width:'100%', paddingLeft:28, fontFamily:'var(--mono)', fontWeight:500, fontSize:13 }}
          value={query}
          placeholder="Search any ticker or name…"
          onChange={e => { setQuery(e.target.value.toUpperCase()); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => {
            if (e.key === 'Enter' && results.length > 0) select(results[0][0])
            if (e.key === 'Escape') setOpen(false)
          }}
        />
        {query && (
          <button onClick={() => { setQuery(''); setOpen(false) }} style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:2 }}>
            <Icons.X size={12}/>
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', boxShadow:'var(--shadow-lg)', zIndex:200, overflow:'hidden' }}>
          {results.map(([sym, info]) => (
            <div key={sym} onMouseDown={() => select(sym)}
              style={{ padding:'8px 12px', cursor:'pointer', display:'flex', gap:10, alignItems:'center', borderBottom:'1px solid var(--border)' }}
              className="search-row">
              <span style={{ fontWeight:700, fontFamily:'var(--mono)', fontSize:13, minWidth:48, color:'var(--text)' }}>{sym}</span>
              <span style={{ flex:1, fontSize:12, color:'var(--text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{info.name}</span>
              <span style={{ fontSize:10, color:'var(--text-subtle)', fontFamily:'var(--mono)', whiteSpace:'nowrap' }}>{info.sector}</span>
              {prices[sym] != null && (
                <span style={{ fontFamily:'var(--mono)', fontSize:12, color: (changes[sym] ?? 0) >= 0 ? 'var(--up)' : 'var(--down)', minWidth:54, textAlign:'right' }}>
                  ${prices[sym].toFixed(2)}
                </span>
              )}
            </div>
          ))}
          <div style={{ padding:'6px 12px', fontSize:11, color:'var(--text-subtle)', background:'var(--bg-subtle)' }}>
            Any TradingView symbol works — type LVMH, BTC, 7203.T …
          </div>
        </div>
      )}
      <style>{`.search-row:hover { background: var(--bg-hover) !important; }`}</style>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TabLive({
  pushToast,
  theme = 'light',
}: {
  pushToast: (t: { msg: string; kind?: 'success' | 'error' | '' }) => void
  theme?: string
}) {
  // ── Prices ──────────────────────────────────────────────────────────────────
  const [prices,  setPrices]  = useState<Record<string, number>>({})
  const [spark,   setSpark]   = useState<Record<string, number[]>>({})
  const [changes, setChanges] = useState<Record<string, number>>({})
  const [pulse,   setPulse]   = useState<Record<string, 'up' | 'down'>>({})
  const prevPricesRef = useRef<Record<string, number>>({})

  const refreshPrices = useCallback(async () => {
    try {
      const data = await fetchLivePrices(TAPE_TICKERS)
      const prev = prevPricesRef.current
      const newPulse: Record<string, 'up' | 'down'> = {}
      for (const sym of Object.keys(data.prices)) {
        const cur = data.prices[sym]; const old = prev[sym]
        if (cur && old && cur !== old) newPulse[sym] = cur > old ? 'up' : 'down'
        if (cur) prev[sym] = cur
      }
      setPrices(data.prices as Record<string, number>)
      setSpark(data.spark)
      setChanges(data.changes)
      setPulse(newPulse)
      setTimeout(() => setPulse({}), 600)
    } catch {}
  }, [])

  useEffect(() => { refreshPrices() }, [refreshPrices])
  useInterval(refreshPrices, 5000)

  // ── Indices ──────────────────────────────────────────────────────────────────
  const [indices, setIndices] = useState<IndexData[]>([])
  useEffect(() => { fetchIndices().then(setIndices).catch(() => {}) }, [])

  // ── Chart ────────────────────────────────────────────────────────────────────
  const [chartSym,      setChartSym]      = useState('AAPL')
  const [chartInterval, setChartInterval] = useState('D')
  const [activeStudies, setActiveStudies] = useState<Set<string>>(new Set(['RSI','MACD']))
  const [suggestTab,    setSuggestTab]    = useState<SuggestTab>('sector')

  const toggleStudy = (key: string) =>
    setActiveStudies(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })

  const studies = INDICATOR_TOGGLES.filter(t => activeStudies.has(t.key)).map(t => t.study)

  const suggestions = useMemo(() => getSuggestions(chartSym), [chartSym])
  const suggestionList = suggestions[suggestTab] ?? []

  const loadSymbol = (sym: string) => {
    setChartSym(sym)
  }

  // ── Portfolio ─────────────────────────────────────────────────────────────────
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [initCash,  setInitCash]  = useState(100_000)
  const [showInit,  setShowInit]  = useState(false)

  useEffect(() => {
    fetchPortfolio().then(p => { setPortfolio(p); setShowInit(p === null) }).catch(() => setShowInit(true))
  }, [])

  // ── Signal scanner ────────────────────────────────────────────────────────────
  const [signals,     setSignals]     = useState<LiveSignal[]>([])
  const [scanLoading, setScanLoading] = useState(false)
  const [scanFilter,  setScanFilter]  = useState<'all'|'buy'|'sell'|'hold'>('all')
  const [scanQuery,   setScanQuery]   = useState('')
  const [scanSector,  setScanSector]  = useState<string>('all')
  const [rsiPeriod,   setRsiPeriod]   = useState(14)
  const [emaFast,     setEmaFast]     = useState(12)
  const [emaSlow,     setEmaSlow]     = useState(26)
  const [showParams,  setShowParams]  = useState(false)

  // ── Fundamentals ──────────────────────────────────────────────────────────────
  const [fundMap,      setFundMap]      = useState<Record<string, FundamentalData>>({})
  const [fundLoading,  setFundLoading]  = useState(false)
  const [showFundPanel, setShowFundPanel] = useState(false)

  // ── News & sentiment ──────────────────────────────────────────────────────────
  const [news,          setNews]          = useState<NewsItem[]>([])
  const [sentiment,     setSentiment]     = useState<SentimentSummary | null>(null)
  const [newsLoading,   setNewsLoading]   = useState(false)
  const [newsFilter,    setNewsFilter]    = useState<'all'|'positive'|'negative'>('all')
  const [newsTicker,    setNewsTicker]    = useState<string>('all')
  const [newsExpanded,  setNewsExpanded]  = useState<number | null>(null)
  const [showNews,      setShowNews]      = useState(false)

  const scanTickers = scanSector === 'all' ? ALL_TICKERS.slice(0, 16) : (UNIVERSE_EXTENDED[scanSector] ?? [])

  const runScan = async () => {
    setScanLoading(true)
    try {
      const rows = await fetchLiveSignals(scanTickers, SCAN_STRATEGIES, { rsi_period: rsiPeriod, ema_fast: emaFast, ema_slow: emaSlow })
      setSignals(rows)
    } catch (e: unknown) {
      pushToast({ kind:'error', msg:'Signal scan failed: ' + String(e) })
    } finally { setScanLoading(false) }
  }

  const loadFundamentals = async (tickers: string[]) => {
    if (!tickers.length) return
    setFundLoading(true)
    try {
      const data = await fetchFundamentals(tickers)
      setFundMap(prev => {
        const next = { ...prev }
        data.forEach(f => { next[f.ticker] = f })
        return next
      })
    } catch { } finally { setFundLoading(false) }
  }

  const loadNews = async () => {
    setNewsLoading(true)
    try {
      const tickers = signals.length ? [...new Set(signals.map(s => s.ticker))].slice(0, 8) : []
      const res = await fetchNews(tickers, 40)
      setNews(res.news)
      setSentiment(res.sentiment_summary)
      setShowNews(true)
    } catch (e: unknown) {
      pushToast({ kind:'error', msg:'News fetch failed: ' + String(e) })
    } finally { setNewsLoading(false) }
  }

  // Auto-load fundamentals when scan results appear
  useEffect(() => {
    if (signals.length > 0) {
      const tickers = [...new Set(signals.map(s => s.ticker))]
      loadFundamentals(tickers)
    }
  }, [signals])

  const filteredSignals = signals.filter(s => {
    if (scanFilter !== 'all' && s.signal.toLowerCase() !== scanFilter) return false
    if (scanQuery && !s.ticker.toLowerCase().includes(scanQuery.toLowerCase()) &&
        !s.strategy.toLowerCase().includes(scanQuery.toLowerCase())) return false
    return true
  })

  // ── Order modal ───────────────────────────────────────────────────────────────
  const [orderModal,   setOrderModal]   = useState<{ sym: string; action: 'BUY' | 'SELL' } | null>(null)
  const [orderQty,     setOrderQty]     = useState(10)
  const [orderLoading, setOrderLoading] = useState(false)

  const executeOrder = async () => {
    if (!orderModal || !orderQty || orderQty <= 0) return
    setOrderLoading(true)
    try {
      const res = await placeOrder(orderModal.sym, orderModal.action, orderQty)
      setPortfolio(res.portfolio)
      pushToast({ kind:'success', msg: res.msg })
      setOrderModal(null); setOrderQty(10)
    } catch (e: unknown) {
      pushToast({ kind:'error', msg: String(e) })
    } finally { setOrderLoading(false) }
  }

  // ── Portfolio totals ──────────────────────────────────────────────────────────
  const posArr      = portfolio ? Object.entries(portfolio.positions) : []
  const posValue    = posArr.reduce((s, [sym, p]) => s + p.qty * (prices[sym] ?? p.entry), 0)
  const costBasis   = posArr.reduce((s, [, p]) => s + p.qty * p.entry, 0)
  const unrealized  = posValue - costBasis
  const realized    = (portfolio?.trades ?? []).filter(t => t.pnl != null).reduce((s, t) => s + (t.pnl ?? 0), 0)
  const totalValue  = (portfolio?.cash ?? 0) + posValue
  const initialCash = portfolio?.initial_cash ?? 100_000

  // ── Top movers ────────────────────────────────────────────────────────────────
  const movers  = TAPE_TICKERS.filter(sym => prices[sym]).map(sym => ({ sym, last:prices[sym], pct:changes[sym] ?? 0 }))
  const gainers = [...movers].sort((a,b) => b.pct - a.pct).slice(0, 4)
  const losers  = [...movers].sort((a,b) => a.pct - b.pct).slice(0, 4)

  // ── Current chart stock info ──────────────────────────────────────────────────
  const chartInfo = STOCK_DB[chartSym]

  return (
    <div className="page-fade">

      {/* ── Ticker tape ──────────────────────────────────────────────────────── */}
      <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:'var(--radius)', marginBottom:20, overflow:'hidden' }}>
        <div style={{ display:'flex', gap:28, padding:'10px 20px', whiteSpace:'nowrap', animation:'tape 50s linear infinite', width:'max-content' }}>
          {[...TAPE_TICKERS, ...TAPE_TICKERS].map((sym, i) => {
            const last = prices[sym]; const pct = changes[sym] ?? 0; const p = pulse[sym]
            return (
              <div key={i} onClick={() => loadSymbol(sym)}
                className="row" style={{ gap:8, fontSize:13, cursor:'pointer', transition:'color 0.3s',
                color: p === 'up' ? 'var(--up)' : p === 'down' ? 'var(--down)' : sym === chartSym ? 'var(--accent)' : 'var(--text)' }}>
                <span style={{ fontWeight:600 }}>{sym}</span>
                <span className="mono">{last?.toFixed(2) ?? '—'}</span>
                <span className="mono" style={{ color:pct >= 0 ? 'var(--up)' : 'var(--down)' }}>{pct >= 0 ? '+' : ''}{pct.toFixed(2)}%</span>
              </div>
            )
          })}
        </div>
        <style>{`@keyframes tape { from { transform:translateX(0); } to { transform:translateX(-50%); } }`}</style>
      </div>

      {/* ── Indices strip ────────────────────────────────────────────────────── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:1, background:'var(--border)', borderRadius:'var(--radius-lg)', overflow:'hidden', border:'1px solid var(--border)', marginBottom:20 }}>
        {(indices.length ? indices : Array.from({length:6}, (_, i) => ({ sym:'—', name:'—', value:null as number|null, change:0 }))).map((idx, i) => (
          <div key={i} style={{ background:'var(--bg-elevated)', padding:'12px 16px' }}>
            <div style={{ fontSize:10, color:'var(--text-subtle)', textTransform:'uppercase', letterSpacing:'0.06em', fontWeight:500 }}>{idx.name}</div>
            <div className="mono" style={{ fontSize:17, fontWeight:600, marginTop:3 }}>
              {idx.value != null ? idx.value.toLocaleString('en-US', { maximumFractionDigits:2 }) : '···'}
            </div>
            <div style={{ fontSize:11, fontFamily:'var(--mono)', marginTop:3, color:idx.change >= 0 ? 'var(--up)' : 'var(--down)' }}>
              {idx.value != null ? (idx.change >= 0 ? '↑ ' : '↓ ') + Math.abs(idx.change).toFixed(2) + '%' : ''}
            </div>
          </div>
        ))}
      </div>

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', gap:24, marginBottom:20, paddingBottom:20, borderBottom:'1px solid var(--border)' }}>
        <div>
          <h1 className="page-title" style={{ marginBottom:4 }}>Live markets</h1>
          <p className="page-subtitle">TradingView-powered chart · real-time signals · paper trading. Search any stock globally.</p>
        </div>
        <div className="row" style={{ gap:8 }}>
          <span className="live-pill"><span className="dot"/> LIVE</span>
          <button className="btn" onClick={refreshPrices}><Icons.Refresh size={14}/> Refresh</button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── PRIMARY: FULL-WIDTH CHART ─────────────────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <div className="card" style={{ marginBottom:20 }}>
        {/* Chart header */}
        <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:16, flexWrap:'wrap' }}>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            <div className="row" style={{ gap:12, alignItems:'baseline' }}>
              <span style={{ fontSize:28, fontWeight:700, letterSpacing:'-0.02em', fontFamily:'var(--mono)' }}>{chartSym}</span>
              <span style={{ fontSize:14, color:'var(--text-muted)' }}>{chartInfo?.name ?? ''}</span>
              {chartInfo && (
                <span className="tag" style={{ fontSize:10 }}>{chartInfo.industry}</span>
              )}
            </div>
            <div className="row" style={{ gap:12 }}>
              <span className="mono" style={{ fontSize:26, fontWeight:600, transition:'color 0.3s',
                color: pulse[chartSym] === 'up' ? 'var(--up)' : pulse[chartSym] === 'down' ? 'var(--down)' : 'var(--text)' }}>
                {prices[chartSym] ? `$${prices[chartSym].toFixed(2)}` : '—'}
              </span>
              {changes[chartSym] != null && (
                <span className="mono" style={{ fontSize:14, color:changes[chartSym] >= 0 ? 'var(--up)' : 'var(--down)' }}>
                  {changes[chartSym] >= 0 ? '+' : ''}{changes[chartSym].toFixed(2)}%
                </span>
              )}
              {chartInfo && (
                <span style={{ fontSize:12, color:'var(--text-subtle)' }}>
                  {chartInfo.sector} · {chartInfo.mcap.charAt(0).toUpperCase() + chartInfo.mcap.slice(1)} cap · {chartInfo.vol} vol
                </span>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="row" style={{ gap:10, flexWrap:'wrap', justifyContent:'flex-end' }}>
            <TickerSearch value={chartSym} onChange={loadSymbol} prices={prices} changes={changes}/>
            <div className="subtabs">
              {(['5','15','60','D','W'] as const).map(iv => (
                <button key={iv} className={`subtab ${chartInterval === iv ? 'active' : ''}`} onClick={() => setChartInterval(iv)}>
                  {iv === '5' ? '5m' : iv === '15' ? '15m' : iv === '60' ? '1H' : iv}
                </button>
              ))}
            </div>
            <button className="btn btn-buy btn-sm" onClick={() => setOrderModal({ sym:chartSym, action:'BUY' })}><Icons.ArrowUpRight size={13}/> Buy</button>
            <button className="btn btn-sell btn-sm" onClick={() => setOrderModal({ sym:chartSym, action:'SELL' })}><Icons.ArrowDownRight size={13}/> Sell</button>
          </div>
        </div>

        {/* Indicator toggles */}
        <div style={{ padding:'10px 20px', borderBottom:'1px solid var(--border)', display:'flex', gap:6, alignItems:'center', background:'var(--bg-subtle)' }}>
          <span style={{ fontSize:11, color:'var(--text-subtle)', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.06em', marginRight:6 }}>Overlays</span>
          {INDICATOR_TOGGLES.map(t => (
            <button key={t.key} onClick={() => toggleStudy(t.key)} style={{
              padding:'3px 11px', fontSize:12, borderRadius:4, cursor:'pointer',
              fontFamily:'var(--mono)', fontWeight:500, transition:'all 0.12s',
              border:`1px solid ${activeStudies.has(t.key) ? 'var(--accent)' : 'var(--border)'}`,
              background: activeStudies.has(t.key) ? 'var(--accent)' : 'var(--bg-elevated)',
              color:      activeStudies.has(t.key) ? 'white'          : 'var(--text-muted)',
            }}>
              {t.label}
            </button>
          ))}
          <span style={{ marginLeft:'auto', fontSize:11, color:'var(--text-subtle)', display:'flex', alignItems:'center', gap:5 }}>
            Powered by TradingView · add more indicators inside the chart
          </span>
        </div>

        {/* The chart itself — tall and full-width */}
        <TradingViewChart
          symbol={chartSym}
          interval={chartInterval}
          theme={theme}
          studies={studies}
          height={620}
        />
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── SMART SUGGESTIONS ────────────────────────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <div className="card" style={{ marginBottom:20 }}>
        <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:16 }}>
          <div>
            <div style={{ fontSize:14, fontWeight:600, letterSpacing:'-0.005em' }}>Smart suggestions for {chartSym}</div>
            <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>
              {SUGGESTION_TABS.find(t => t.key === suggestTab)?.desc} · click any card to load
            </div>
          </div>
          <div className="subtabs">
            {SUGGESTION_TABS.map(t => (
              <button key={t.key} className={`subtab ${suggestTab === t.key ? 'active' : ''}`} onClick={() => setSuggestTab(t.key)}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ padding:'16px 20px' }}>
          <div style={{ display:'flex', gap:12, overflowX:'auto', paddingBottom:4 }}>
            {suggestionList.length === 0 ? (
              <div style={{ color:'var(--text-muted)', fontSize:13, padding:'12px 0' }}>No suggestions for this category.</div>
            ) : suggestionList.map(sym => {
              const info  = STOCK_DB[sym]
              const price = prices[sym]
              const chg   = changes[sym]
              const p     = pulse[sym]
              const sp    = spark[sym]
              return (
                <div key={sym} onClick={() => loadSymbol(sym)}
                  style={{
                    minWidth:160, padding:'14px 16px', border:'1px solid var(--border)',
                    borderRadius:'var(--radius)', background:'var(--bg-elevated)',
                    cursor:'pointer', transition:'all 0.15s', flexShrink:0,
                    borderColor: sym === chartSym ? 'var(--accent)' : 'var(--border)',
                  }}
                  className="suggestion-card">
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                    <span style={{ fontWeight:700, fontFamily:'var(--mono)', fontSize:15 }}>{sym}</span>
                    {chg != null && (
                      <span style={{ fontSize:11, fontFamily:'var(--mono)', fontWeight:600, color:chg >= 0 ? 'var(--up)' : 'var(--down)' }}>
                        {chg >= 0 ? '+' : ''}{chg.toFixed(2)}%
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:8, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {info?.name}
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <div className="mono" style={{ fontSize:14, fontWeight:500, transition:'color 0.3s', color:p === 'up' ? 'var(--up)' : p === 'down' ? 'var(--down)' : 'var(--text)' }}>
                        {price ? `$${price.toFixed(2)}` : '—'}
                      </div>
                      <div style={{ display:'flex', gap:4, marginTop:3 }}>
                        {info?.vol && (
                          <span style={{ fontSize:9, padding:'1px 5px', borderRadius:3, fontFamily:'var(--mono)', fontWeight:500,
                            background: info.vol === 'high' ? 'var(--down-soft)' : info.vol === 'low' ? 'var(--up-soft)' : 'var(--bg-subtle)',
                            color:      info.vol === 'high' ? 'var(--down)'      : info.vol === 'low' ? 'var(--up)'      : 'var(--text-muted)',
                          }}>{info.vol} vol</span>
                        )}
                        {info?.defensive && (
                          <span style={{ fontSize:9, padding:'1px 5px', borderRadius:3, fontFamily:'var(--mono)', fontWeight:500, background:'var(--accent-soft)', color:'var(--accent-text)' }}>defensive</span>
                        )}
                      </div>
                    </div>
                    {sp && sp.length > 0 && <Sparkline data={sp.slice(-20)} width={52} height={28}/>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <style>{`
        .suggestion-card:hover { transform:translateY(-2px); box-shadow:var(--shadow-md); border-color:var(--border-strong) !important; }
      `}</style>

      {/* ── Portfolio + Movers ────────────────────────────────────────────────── */}
      <div className="grid-12" style={{ marginBottom:20 }}>
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Paper portfolio</h3>
            <div className="row" style={{ gap:6 }}>
              <span className="tag">€{(initialCash/1000).toFixed(0)}k start</span>
              {portfolio && (
                <button className="btn btn-ghost btn-sm" onClick={async () => {
                  await resetPortfolio(); setPortfolio(null); setShowInit(true); pushToast({ msg:'Portfolio reset.' })
                }}>Reset</button>
              )}
            </div>
          </div>
          <div className="card-body">
            {showInit || !portfolio ? (
              <div>
                <p className="muted" style={{ fontSize:13, marginBottom:16 }}>No active portfolio. Initialize one to start paper trading.</p>
                <label className="field" style={{ marginBottom:12 }}>
                  <span className="label">Starting cash (€)</span>
                  <input type="number" className="input input-lg" value={initCash} onChange={e => setInitCash(Number(e.target.value))} min={1000} step={1000}/>
                </label>
                <button className="btn btn-primary" style={{ width:'100%' }} onClick={async () => {
                  const p = await initPortfolio(initCash, 0.001)
                  setPortfolio(p); setShowInit(false)
                  pushToast({ kind:'success', msg:`Portfolio initialized with €${initCash.toLocaleString()}` })
                }}>Initialize Portfolio</button>
              </div>
            ) : (
              <>
                <div className="stat-label">Total value</div>
                <div style={{ fontFamily:'var(--serif)', fontStyle:'italic', fontSize:36, lineHeight:1, marginTop:6, letterSpacing:'-0.01em' }}>
                  €{totalValue.toLocaleString('en-US', { maximumFractionDigits:0 })}
                </div>
                <div className={`stat-delta ${totalValue >= initialCash ? 'up' : 'down'}`} style={{ marginTop:8 }}>
                  {totalValue >= initialCash ? '↑' : '↓'} €{Math.abs(totalValue - initialCash).toLocaleString('en-US', { maximumFractionDigits:0 })}
                  {' '}({((totalValue/initialCash - 1)*100).toFixed(2)}%)
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:20, paddingTop:16, borderTop:'1px solid var(--border)' }}>
                  {[
                    { label:'Cash',       val:fmt.money(portfolio.cash, 0),  col:'' },
                    { label:'Positions',  val:fmt.money(posValue, 0),         col:'' },
                    { label:'Unrealized', val:`${unrealized >= 0 ? '+' : ''}${fmt.money(Math.abs(unrealized), 0)}`, col:unrealized >= 0 ? 'var(--up)' : 'var(--down)' },
                    { label:'Realized',   val:`${realized >= 0 ? '+' : ''}${fmt.money(Math.abs(realized), 0)}`,     col:realized >= 0 ? 'var(--up)' : 'var(--down)' },
                  ].map(row => (
                    <div key={row.label}>
                      <div className="stat-label" style={{ fontSize:10 }}>{row.label}</div>
                      <div className="mono" style={{ fontSize:15, marginTop:2, color:row.col||undefined }}>{row.val}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3 className="card-title">Top movers</h3></div>
          <div className="card-body flush">
            {[{ label:'Gainers', items:gainers, col:'var(--up)' }, { label:'Losers', items:losers, col:'var(--down)' }].map(({ label, items, col }) => (
              <div key={label}>
                <div style={{ padding:'8px 16px 4px', fontSize:11, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', fontWeight:500, borderTop:label==='Losers' ? '1px solid var(--border)' : undefined }}>{label}</div>
                {items.map(g => (
                  <div key={g.sym} className="row" style={{ padding:'8px 16px', borderTop:'1px solid var(--border)', cursor:'pointer' }} onClick={() => loadSymbol(g.sym)}>
                    <span style={{ fontWeight:600, width:52 }}>{g.sym}</span>
                    <Sparkline data={spark[g.sym]?.slice(-30) ?? []} color={col}/>
                    <div style={{ marginLeft:'auto', textAlign:'right' }}>
                      <div className="mono tiny">€{g.last?.toFixed(2)}</div>
                      <div className="mono" style={{ color:col, fontSize:12 }}>{g.pct >= 0 ? '+' : ''}{g.pct.toFixed(2)}%</div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Signal scanner ───────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom:20 }}>
        <div className="card-header">
          <div>
            <h3 className="card-title">Live signal scanner</h3>
            <p className="card-subtitle">{scanTickers.length} tickers · last 400 days of live data{fundLoading ? ' · loading valuations…' : ''}</p>
          </div>
          <div className="row" style={{ gap:8, flexWrap:'wrap', justifyContent:'flex-end' }}>
            <select className="select" value={scanSector} onChange={e => setScanSector(e.target.value)}>
              <option value="all">All sectors (top 16)</option>
              {Object.keys(UNIVERSE_EXTENDED).map(s => <option key={s} value={s}>{s} ({UNIVERSE_EXTENDED[s].length})</option>)}
            </select>
            <button className="btn btn-sm" onClick={() => setShowParams(v => !v)}><Icons.Settings size={12}/> Params</button>
            <button className="btn btn-sm" onClick={() => setShowFundPanel(v => !v)} style={{ background: showFundPanel ? 'var(--accent-soft)' : undefined }}>
              ⚖ Valuation
            </button>
            <input className="input" placeholder="Filter…" value={scanQuery} onChange={e => setScanQuery(e.target.value)} style={{ width:120 }}/>
            <div className="subtabs">
              {(['all','buy','sell','hold'] as const).map(v => (
                <button key={v} className={`subtab ${scanFilter === v ? 'active' : ''}`} onClick={() => setScanFilter(v)}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
            <button className="btn btn-primary" onClick={runScan} disabled={scanLoading}>
              {scanLoading ? '…' : <><Icons.Filter size={13}/> Scan</>}
            </button>
          </div>
        </div>
        {showParams && (
          <div style={{ padding:'12px 20px', borderBottom:'1px solid var(--border)', background:'var(--bg-subtle)', display:'flex', gap:20, alignItems:'flex-end', flexWrap:'wrap' }}>
            {[
              { label:'RSI Period', val:rsiPeriod, set:setRsiPeriod, min:5,  max:30  },
              { label:'EMA Fast',   val:emaFast,   set:setEmaFast,   min:3,  max:50  },
              { label:'EMA Slow',   val:emaSlow,   set:setEmaSlow,   min:10, max:200 },
            ].map(f => (
              <label key={f.label} className="field" style={{ minWidth:100 }}>
                <span className="label">{f.label}</span>
                <input type="number" className="input" value={f.val} min={f.min} max={f.max} onChange={e => f.set(Number(e.target.value))}/>
              </label>
            ))}
            <div style={{ fontSize:11, color:'var(--text-muted)', maxWidth:260, lineHeight:1.4 }}>
              Applies to RSI + BB and EMA Crossover strategies on next scan.
            </div>
          </div>
        )}

        {/* Valuation legend strip */}
        {showFundPanel && (
          <div style={{ padding:'10px 20px', borderBottom:'1px solid var(--border)', background:'var(--bg-subtle)', display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
            <span style={{ fontSize:11, color:'var(--text-subtle)', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.06em' }}>Valuation vs. sector avg P/E</span>
            {(['Buy Now','Good Price','Fair','High','Expensive'] as const).map(l => (
              <ValuationBar key={l} label={l} score={0} compact/>
            ))}
            <span style={{ fontSize:11, color:'var(--text-muted)', marginLeft:'auto' }}>P/E data from yfinance · refreshes every 6 h</span>
          </div>
        )}

        <div className="card-body flush" style={{ maxHeight:460, overflowY:'auto' }}>
          {signals.length === 0 ? (
            <div style={{ padding:32, textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>
              Select a sector and click <strong>Scan</strong> to run live strategy signals.
            </div>
          ) : (
            <table className="tbl">
              <thead><tr>
                <th>Ticker</th><th>Industry</th><th>Strategy</th><th>Signal</th>
                <th className="right">Confidence</th>
                {showFundPanel && <><th className="right">P/E</th><th>Valuation</th></>}
                <th className="right">Price</th><th/>
              </tr></thead>
              <tbody>
                {filteredSignals.map((s, i) => {
                  const f = fundMap[s.ticker]
                  return (
                    <tr key={i}>
                      <td>
                        <div style={{ fontWeight:600, cursor:'pointer', color:'var(--accent)' }} onClick={() => loadSymbol(s.ticker)}>{s.ticker}</div>
                      </td>
                      <td className="tiny muted">{STOCK_DB[s.ticker]?.industry ?? '—'}</td>
                      <td className="tiny">{s.strategy}</td>
                      <td><SignalPill signal={s.signal}/></td>
                      <td className="num">
                        <div className="row" style={{ gap:6, justifyContent:'flex-end' }}>
                          <div style={{ width:60, height:4, background:'var(--bg-subtle)', borderRadius:2, overflow:'hidden' }}>
                            <div style={{ width:`${s.confidence*100}%`, height:'100%', background:s.signal==='BUY'?'var(--up)':s.signal==='SELL'?'var(--down)':'var(--text-subtle)' }}/>
                          </div>
                          <span style={{ minWidth:32 }}>{(s.confidence*100).toFixed(0)}%</span>
                        </div>
                      </td>
                      {showFundPanel && (
                        <>
                          <td className="num tiny">
                            {f ? (f.pe != null ? f.pe.toFixed(1) : '—') : <span style={{ color:'var(--text-subtle)' }}>…</span>}
                          </td>
                          <td style={{ minWidth:130 }}>
                            {f
                              ? <ValuationBar label={f.valuation_label} score={f.valuation_score}/>
                              : <span style={{ color:'var(--text-subtle)', fontSize:11 }}>loading…</span>
                            }
                          </td>
                        </>
                      )}
                      <td className="num">{prices[s.ticker] ? `$${prices[s.ticker].toFixed(2)}` : '—'}</td>
                      <td className="right" style={{ minWidth:80 }}>
                        {s.signal==='BUY' && <button className="btn btn-sm btn-buy" onClick={() => setOrderModal({ sym:s.ticker, action:'BUY' })}>Execute</button>}
                        {s.signal==='SELL' && portfolio?.positions[s.ticker] && <button className="btn btn-sm btn-sell" onClick={() => setOrderModal({ sym:s.ticker, action:'SELL' })}>Execute</button>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── News & sentiment ─────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom:20 }}>
        <div className="card-header">
          <div>
            <h3 className="card-title">News &amp; sentiment</h3>
            <p className="card-subtitle">
              {sentiment
                ? <>Market mood: <strong style={{ color: sentiment.label==='Bullish'?'var(--up)':sentiment.label==='Bearish'?'var(--down)':'var(--text-muted)' }}>{sentiment.label}</strong>
                    {' '}· {sentiment.positive}↑ {sentiment.negative}↓ {sentiment.neutral}— stories</>
                : 'Yahoo Finance + Reuters · VADER sentiment scoring'
              }
            </p>
          </div>
          <div className="row" style={{ gap:8 }}>
            {showNews && (
              <>
                <div className="subtabs">
                  {(['all','positive','negative'] as const).map(f => (
                    <button key={f} className={`subtab ${newsFilter===f?'active':''}`} onClick={() => setNewsFilter(f)}>
                      {f==='positive'?'Bullish':f==='negative'?'Bearish':'All'}
                    </button>
                  ))}
                </div>
                <select className="select" value={newsTicker} onChange={e => setNewsTicker(e.target.value)}>
                  <option value="all">All tickers</option>
                  {[...new Set(news.filter(n=>n.ticker).map(n=>n.ticker!))].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </>
            )}
            <button className="btn btn-primary" onClick={loadNews} disabled={newsLoading}>
              {newsLoading ? '…' : showNews ? <><Icons.Refresh size={13}/> Refresh</> : 'Load News'}
            </button>
          </div>
        </div>

        {showNews && (
          <div style={{ maxHeight:520, overflowY:'auto' }}>
            {(() => {
              const filtered = news.filter(n => {
                if (newsFilter !== 'all' && n.sentiment.label !== newsFilter) return false
                if (newsTicker !== 'all' && n.ticker !== newsTicker) return false
                return true
              })
              if (!filtered.length) return (
                <div style={{ padding:32, textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>
                  No stories match the current filter.
                </div>
              )
              return filtered.map((item, i) => {
                const isExp = newsExpanded === i
                const sentColor = item.sentiment.label==='positive'?'var(--up)':item.sentiment.label==='negative'?'var(--down)':'var(--text-subtle)'
                const sentIcon  = item.sentiment.label==='positive'?'↑':item.sentiment.label==='negative'?'↓':'→'
                const timeAgo = item.published
                  ? (() => {
                      const diff = Math.floor((Date.now()/1000 - item.published) / 60)
                      if (diff < 60) return `${diff}m ago`
                      if (diff < 1440) return `${Math.floor(diff/60)}h ago`
                      return `${Math.floor(diff/1440)}d ago`
                    })()
                  : ''
                return (
                  <div key={i}
                    style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)', cursor:'pointer', transition:'background 0.1s' }}
                    className="news-row"
                    onClick={() => setNewsExpanded(isExp ? null : i)}>
                    <div className="row" style={{ gap:10, alignItems:'flex-start' }}>
                      {/* Impact bar */}
                      <div style={{ width:3, alignSelf:'stretch', borderRadius:2, flexShrink:0, background: item.impact_score > 1.5 ? sentColor : 'var(--border)' }}/>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div className="row" style={{ gap:8, marginBottom:4, flexWrap:'wrap' }}>
                          {item.ticker && (
                            <span style={{ fontFamily:'var(--mono)', fontWeight:700, fontSize:11, color:'var(--accent)' }}>{item.ticker}</span>
                          )}
                          <span style={{ fontSize:11, color:'var(--text-subtle)', fontWeight:500 }}>{item.source}</span>
                          <span style={{ fontSize:10, color:'var(--text-subtle)' }}>{timeAgo}</span>
                          {/* Credibility badge */}
                          <span style={{ fontSize:9, padding:'1px 5px', borderRadius:3, fontFamily:'var(--mono)', fontWeight:600,
                            background: item.credibility>=85?'#dcfce7':item.credibility>=70?'#fef9c3':'#f3f4f6',
                            color:      item.credibility>=85?'#16a34a':item.credibility>=70?'#ca8a04':'#6b7280',
                          }}>
                            {item.credibility>=85?'High cred':item.credibility>=70?'Med cred':'Low cred'}
                          </span>
                          <span style={{ marginLeft:'auto', fontFamily:'var(--mono)', fontSize:11, fontWeight:600, color:sentColor }}>
                            {sentIcon} {item.sentiment.label}
                          </span>
                        </div>
                        <div style={{ fontSize:13, fontWeight:500, lineHeight:1.4, color:'var(--text)', marginBottom: isExp?6:0 }}>
                          {item.title}
                        </div>
                        {isExp && item.summary && (
                          <div style={{ fontSize:12, color:'var(--text-muted)', lineHeight:1.5, marginTop:4 }}>
                            {item.summary}
                          </div>
                        )}
                        {isExp && item.url && (
                          <a href={item.url} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize:11, color:'var(--accent)', marginTop:6, display:'inline-block' }}
                            onClick={e => e.stopPropagation()}>
                            Read full article →
                          </a>
                        )}
                      </div>
                      {/* Impact score */}
                      <div style={{ textAlign:'right', flexShrink:0 }}>
                        <div style={{ fontSize:10, color:'var(--text-subtle)', fontWeight:500 }}>Impact</div>
                        <div style={{ fontFamily:'var(--mono)', fontSize:13, fontWeight:600, color: item.impact_score>1.5?sentColor:'var(--text-muted)' }}>
                          {item.impact_score.toFixed(1)}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })
            })()}
          </div>
        )}

        {!showNews && (
          <div style={{ padding:32, textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>
            Click <strong>Load News</strong> to fetch the latest stories for your scanned tickers.
          </div>
        )}
      </div>
      <style>{`.news-row:hover { background: var(--bg-hover) !important; }`}</style>

      {/* ── Open positions ────────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom:20 }}>
        <div className="card-header">
          <h3 className="card-title">Open positions</h3>
          <span className="tag">{posArr.length} active</span>
        </div>
        <div className="card-body flush">
          <table className="tbl">
            <thead><tr>
              <th>Symbol</th><th className="right">Qty</th><th className="right">Entry</th>
              <th className="right">Current</th><th className="right">Value</th><th className="right">P&amp;L</th><th/>
            </tr></thead>
            <tbody>
              {posArr.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign:'center', padding:24 }} className="muted">No open positions.</td></tr>
              ) : posArr.map(([sym, p]) => {
                const cur = prices[sym] ?? p.entry
                const pnl = (cur - p.entry) * p.qty
                const pnlPct = (cur / p.entry - 1) * 100
                return (
                  <tr key={sym}>
                    <td>
                      <div style={{ fontWeight:600, cursor:'pointer', color:'var(--accent)' }} onClick={() => loadSymbol(sym)}>{sym}</div>
                      <div className="tiny muted">since {p.entryDate}</div>
                    </td>
                    <td className="num">{p.qty}</td>
                    <td className="num">€{p.entry.toFixed(2)}</td>
                    <td className="num" style={{ transition:'color 0.3s', color:pulse[sym]==='up'?'var(--up)':pulse[sym]==='down'?'var(--down)':'var(--text)' }}>
                      €{cur.toFixed(2)}
                    </td>
                    <td className="num">€{(cur*p.qty).toLocaleString('en-US', { maximumFractionDigits:0 })}</td>
                    <td className="num" style={{ color:pnl>=0?'var(--up)':'var(--down)', fontWeight:500 }}>
                      {pnl>=0?'+':''}€{Math.abs(pnl).toFixed(0)}
                      <div className="tiny" style={{ fontWeight:400 }}>{pnlPct>=0?'+':''}{pnlPct.toFixed(2)}%</div>
                    </td>
                    <td><button className="btn btn-sm btn-sell" onClick={() => setOrderModal({ sym, action:'SELL' })}>Sell</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Trade log ────────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Trade log</h3>
          <span className="tag">{portfolio?.trades.length ?? 0} executions</span>
        </div>
        <div className="card-body flush">
          <table className="tbl">
            <thead><tr>
              <th>Date</th><th>Symbol</th><th>Action</th>
              <th className="right">Qty</th><th className="right">Price</th>
              <th className="right">Value</th><th className="right">Realized P&amp;L</th>
            </tr></thead>
            <tbody>
              {(portfolio?.trades ?? []).length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign:'center', padding:24 }} className="muted">No trades yet.</td></tr>
              ) : (portfolio?.trades ?? []).map((t, i) => (
                <tr key={i}>
                  <td className="mono tiny">{t.date}</td>
                  <td style={{ fontWeight:600 }}>{t.sym}</td>
                  <td><span className={`pill ${t.action==='BUY'?'up':'down'}`}>{t.action}</span></td>
                  <td className="num">{t.qty}</td>
                  <td className="num">€{t.price.toFixed(2)}</td>
                  <td className="num">€{(t.qty*t.price).toLocaleString('en-US', { maximumFractionDigits:0 })}</td>
                  <td className="num" style={{ color:t.pnl==null?'var(--text-muted)':t.pnl>=0?'var(--up)':'var(--down)' }}>
                    {t.pnl==null?'—':`${t.pnl>=0?'+':''}€${Math.abs(t.pnl).toFixed(0)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Order modal ──────────────────────────────────────────────────────── */}
      {orderModal && (
        <div onClick={() => setOrderModal(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:50, display:'grid', placeItems:'center' }}>
          <div onClick={e => e.stopPropagation()} className="card" style={{ width:380, boxShadow:'var(--shadow-lg)' }}>
            <div className="card-header">
              <h3 className="card-title">{orderModal.action==='BUY'?'Buy':'Sell'} {orderModal.sym}</h3>
              <button className="icon-btn" onClick={() => setOrderModal(null)}><Icons.X size={14}/></button>
            </div>
            <div className="card-body">
              <div className="row between" style={{ marginBottom:14 }}>
                <span className="muted">Current price</span>
                <span className="mono" style={{ fontWeight:500 }}>€{prices[orderModal.sym]?.toFixed(2) ?? '—'}</span>
              </div>
              <label className="field" style={{ marginBottom:14 }}>
                <span className="label">Quantity</span>
                <input type="number" className="input input-lg" value={orderQty} onChange={e => setOrderQty(parseInt(e.target.value)||0)} min={1}/>
              </label>
              <div className="row between" style={{ marginBottom:4 }}>
                <span className="muted">Estimated total</span>
                <span className="mono" style={{ fontSize:18, fontWeight:500 }}>€{(orderQty*(prices[orderModal.sym]??0)).toLocaleString('en-US',{maximumFractionDigits:2})}</span>
              </div>
              <div className="row between tiny muted">
                <span>Transaction cost (0.10%)</span>
                <span className="mono">€{(orderQty*(prices[orderModal.sym]??0)*0.001).toFixed(2)}</span>
              </div>
              <button className={`btn ${orderModal.action==='BUY'?'btn-buy':'btn-sell'}`}
                style={{ width:'100%', marginTop:16, padding:'10px 12px', fontSize:14 }}
                onClick={executeOrder} disabled={orderLoading}>
                {orderLoading ? '…' : `Confirm ${orderModal.action} ${orderQty} ${orderModal.sym}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
