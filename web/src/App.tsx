import { useState, useEffect, useCallback } from 'react'
import { Icons, useToasts, stratColor } from './components/ui'
import TabLive      from './tabs/TabLive'
import TabPortfolio from './tabs/TabPortfolio'
import TabComparison from './tabs/TabComparison'
import TabAI        from './tabs/TabAI'
import TabRegime    from './tabs/TabRegime'
import { runBacktest, fetchLivePrices, fetchStrategies } from './api'
import TickerTagInput from './components/TickerTagInput'
import type { BacktestResponse, RunSettings, Tweaks } from './types'

const TABS = [
  { id: 'overview',   label: 'Portfolio Overview',  Icon: Icons.Pie,    short: '1' },
  { id: 'comparison', label: 'Strategy Comparison', Icon: Icons.Scale,  short: '2' },
  { id: 'ai',         label: 'AI Analysis',          Icon: Icons.Brain,  short: '3' },
  { id: 'regime',     label: 'Regime Analysis',      Icon: Icons.Thermo, short: '4' },
  { id: 'live',       label: 'Live Markets',         Icon: Icons.Pulse,  short: '5', live: true },
] as const

type TabId = typeof TABS[number]['id']

const DEFAULT_SETTINGS: RunSettings = {
  tickers:      ['AAPL', 'MSFT', 'JPM', 'XOM'],
  start:        '2025-01-01',
  end:          '2025-12-31',
  initial_cash: 10_000,
  tc_pct:       0.001,
  strategies:   ['EMA Crossover + Volume', 'RSI + Bollinger Bands', 'MACD + ADX', 'Buy & Hold'],
  use_pairs:    false,
}

// Quick-add preset groups (any valid yfinance symbol works)
const PRESETS: Record<string, string[]> = {
  'Mag 7':      ['AAPL','MSFT','NVDA','GOOGL','META','AMZN','TSLA'],
  'Financials': ['JPM','BAC','GS','V','MA','BLK'],
  'Energy':     ['XOM','CVX','COP','SLB','OXY'],
  'Healthcare': ['JNJ','UNH','LLY','PFE','ABBV'],
  'ETFs':       ['SPY','QQQ','IWM','GLD','TLT'],
  'Crypto':     ['BTC-USD','ETH-USD','SOL-USD'],
}

function loadTweaks(): Tweaks {
  try {
    const saved = JSON.parse(localStorage.getItem('julius-tweaks') || '{}')
    return { theme: saved.theme ?? 'light', accent: saved.accent ?? 'green' }
  } catch {}
  return { theme: 'light', accent: 'green' }
}

export default function App() {
  const [tab, setTab]         = useState<TabId>('live')
  const [tweaks, _setTweaks]  = useState<Tweaks>(loadTweaks)
  const { push, node: toastNode } = useToasts()

  // Backtest state
  const [btData,    setBtData]    = useState<BacktestResponse | null>(null)
  const [settings,  setSettings]  = useState<RunSettings>(DEFAULT_SETTINGS)
  const [running,   setRunning]   = useState(false)
  const [showConfig,   setShowConfig]   = useState(false)
  const [strategies,   setStrategies]   = useState<string[]>([])

  // Live price state (used by Portfolio Overview tab for sparklines/changes)
  const [spark,   setSpark]   = useState<Record<string, number[]>>({})
  const [changes, setChanges] = useState<Record<string, number>>({})

  useEffect(() => {
    fetchStrategies().then(setStrategies).catch(() => {})
    const warmTickers = Object.values(PRESETS).flat().slice(0, 12)
    fetchLivePrices(warmTickers).then(d => {
      setSpark(d.spark)
      setChanges(d.changes)
    }).catch(() => {})
  }, [])

  // Apply theme + accent
  const setTweak = useCallback(<K extends keyof Tweaks>(k: K, v: Tweaks[K]) => {
    _setTweaks(t => {
      const next = { ...t, [k]: v }
      localStorage.setItem('julius-tweaks', JSON.stringify(next))
      return next
    })
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', tweaks.theme)
    const root = document.documentElement
    const map: Record<string, { dark: string; light: string; soft: string }> = {
      green: { dark: '#5fd48a', light: '#0a5c2f', soft: '#e8f3ec' },
      blue:  { dark: '#7cb8ff', light: '#1d4ed8', soft: '#e0ebff' },
      amber: { dark: '#f4c177', light: '#b45309', soft: '#fdf2e0' },
    }
    const c = map[tweaks.accent] ?? map.green
    if (tweaks.theme === 'dark') {
      root.style.setProperty('--accent', c.dark)
      root.style.setProperty('--accent-text', c.dark)
    } else {
      root.style.setProperty('--accent', c.light)
      root.style.setProperty('--accent-text', c.light)
      root.style.setProperty('--accent-soft', c.soft)
    }
  }, [tweaks])

  // Keyboard shortcuts 1–5
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const el = document.activeElement as HTMLElement
      if (el?.tagName === 'INPUT' || el?.tagName === 'SELECT' || el?.tagName === 'TEXTAREA') return
      const idx = parseInt(e.key) - 1
      if (idx >= 0 && idx < TABS.length) setTab(TABS[idx].id)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleRunBacktest = async () => {
    setRunning(true)
    setShowConfig(false)
    try {
      const result = await runBacktest(settings)
      setBtData(result)
      push({ kind: 'success', msg: `Backtest complete — ${settings.tickers.length} stocks × ${settings.strategies.length} strategies` })
      if (tab === 'live') setTab('overview')
    } catch (e: unknown) {
      push({ kind: 'error', msg: 'Backtest failed: ' + String(e) })
    } finally {
      setRunning(false)
    }
  }

  const activeLabel = TABS.find(t => t.id === tab)?.label ?? ''
  const allStrats = strategies.length ? strategies : DEFAULT_SETTINGS.strategies

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">J</div>
          <div className="brand-name">Julius</div>
        </div>

        <div className="nav-section">Workspace</div>
        {TABS.map(t => (
          <button key={t.id} className={`nav-item ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            <t.Icon className="nav-icon"/>
            {t.label}
            {t.id === 'live'
              ? <span className="nav-badge" style={{ background: 'var(--up-soft)', color: 'var(--up)' }}>● live</span>
              : <span className="nav-badge">{t.short}</span>
            }
          </button>
        ))}

        <div className="nav-section">Configuration</div>
        <button className="nav-item" onClick={() => setShowConfig(v => !v)}>
          <Icons.Calendar className="nav-icon"/>
          Backtest period
          <span className="nav-badge">2025</span>
        </button>
        <button className="nav-item" onClick={() => setShowConfig(v => !v)}>
          <Icons.Layers className="nav-icon"/>
          Strategies
          <span className="nav-badge">{settings.strategies.length}</span>
        </button>
        <button className="nav-item" onClick={() => setShowConfig(v => !v)}>
          <Icons.Wallet className="nav-icon"/>
          Capital
          <span className="nav-badge">€{(settings.initial_cash / 1000).toFixed(0)}k</span>
        </button>

        <div className="sidebar-footer">
          <div className="user-avatar">BC</div>
          <div className="user-info">
            <span className="user-name">Bocconi</span>
            <span className="user-meta">Spring 2026</span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="main">
        {/* Top bar */}
        <header className="topbar">
          <div className="topbar-title">
            <span className="crumb">Julius</span>
            <span className="crumb">/</span>
            <span>{activeLabel}</span>
          </div>
          <div className="search-box">
            <Icons.Search size={14}/>
            <input placeholder="Search ticker, strategy, trade…"/>
            <span className="kbd">⌘K</span>
          </div>
          <div className="topbar-right">
            <div className="theme-tile">
              <button className={tweaks.theme === 'light' ? 'active' : ''} onClick={() => setTweak('theme', 'light')} title="Light"><Icons.Sun size={14}/></button>
              <button className={tweaks.theme === 'dark'  ? 'active' : ''} onClick={() => setTweak('theme', 'dark')}  title="Dark"><Icons.Moon size={14}/></button>
            </div>
            <button className="icon-btn"><Icons.Bell/></button>
            <button className="icon-btn" onClick={() => setShowConfig(v => !v)}><Icons.Settings/></button>
          </div>
        </header>

        <div className="content">
          {/* Run configuration panel */}
          {showConfig && (
            <div className="card" style={{ marginBottom: 24, boxShadow: 'var(--shadow-md)' }}>
              <div className="card-header">
                <h3 className="card-title">Run configuration</h3>
                <button className="icon-btn" onClick={() => setShowConfig(false)}><Icons.X size={14}/></button>
              </div>
              <div className="card-body">
                <div className="grid-2" style={{ gap: 20, marginBottom: 16 }}>
                  <div className="field">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span className="label">Tickers — any yfinance symbol ({settings.tickers.length})</span>
                    </div>
                    <TickerTagInput
                      tickers={settings.tickers}
                      onChange={tickers => setSettings(s => ({ ...s, tickers }))}
                    />
                    <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 8, marginBottom: 5 }}>Quick add:</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {Object.entries(PRESETS).map(([label, syms]) => (
                        <button key={label}
                          onClick={() => setSettings(s => ({ ...s, tickers: [...new Set([...s.tickers, ...syms])] }))}
                          style={{
                            padding: '3px 9px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
                            border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                            color: 'var(--text-muted)',
                          }}>
                          + {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="field" style={{ marginBottom: 12 }}>
                      <span className="label">Start date</span>
                      <input type="date" className="input" value={settings.start} onChange={e => setSettings(s => ({ ...s, start: e.target.value }))}/>
                    </label>
                    <label className="field" style={{ marginBottom: 12 }}>
                      <span className="label">End date</span>
                      <input type="date" className="input" value={settings.end} onChange={e => setSettings(s => ({ ...s, end: e.target.value }))}/>
                    </label>
                    <label className="field" style={{ marginBottom: 12 }}>
                      <span className="label">Initial capital (€)</span>
                      <input type="number" className="input" value={settings.initial_cash} min={1000} step={1000}
                        onChange={e => setSettings(s => ({ ...s, initial_cash: Number(e.target.value) }))}/>
                    </label>
                  </div>
                </div>

                <label className="field" style={{ marginBottom: 16 }}>
                  <span className="label">Strategies</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                    {allStrats.map((name, i) => {
                      const checked = settings.strategies.includes(name)
                      return (
                        <button key={name} onClick={() => setSettings(s => ({
                          ...s,
                          strategies: checked
                            ? s.strategies.filter(n => n !== name)
                            : [...s.strategies, name],
                        }))}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '5px 10px', borderRadius: 6, fontSize: 12,
                          border: `1px solid ${checked ? stratColor(i) : 'var(--border)'}`,
                          background: checked ? `${stratColor(i)}18` : 'var(--bg-elevated)',
                          color: checked ? stratColor(i) : 'var(--text-muted)',
                          cursor: 'pointer',
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: 2, background: stratColor(i) }}/>
                          {name}
                        </button>
                      )
                    })}
                  </div>
                </label>

                <button className="btn btn-primary" style={{ minWidth: 160 }} onClick={handleRunBacktest} disabled={running}>
                  {running ? (
                    <><span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }}/> Running…</>
                  ) : (
                    <><Icons.Play size={13}/> Run Backtest</>
                  )}
                </button>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            </div>
          )}

          {/* Tab content */}
          {tab === 'live' && <TabLive pushToast={push} theme={tweaks.theme}/>}

          {tab !== 'live' && !btData && (
            <div style={{ display: 'grid', placeItems: 'center', minHeight: 400 }}>
              <div style={{ textAlign: 'center', maxWidth: 440 }}>
                <div style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 32, marginBottom: 12 }}>No backtest data</div>
                <p className="muted" style={{ marginBottom: 24 }}>Configure your tickers and strategies, then run a backtest to populate the analysis tabs.</p>
                <button className="btn btn-primary" style={{ padding: '10px 24px', fontSize: 14 }} onClick={() => setShowConfig(true)}>
                  <Icons.Play size={14}/> Configure & Run
                </button>
              </div>
            </div>
          )}

          {tab === 'overview'   && btData && <TabPortfolio  data={btData} spark={spark} changes={changes} theme={tweaks.theme}/>}
          {tab === 'comparison' && btData && <TabComparison data={btData} theme={tweaks.theme}/>}
          {tab === 'ai'         && btData && <TabAI         data={btData}/>}
          {tab === 'regime'     && btData && <TabRegime     data={btData} theme={tweaks.theme}/>}
        </div>
      </main>

      {toastNode}
    </div>
  )
}
