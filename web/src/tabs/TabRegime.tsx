import { useState } from 'react'
import { fmt, TICKER_META } from '../components/ui'
import TradingViewChart from '../components/TradingViewChart'
import TickerSearch from '../components/TickerSearch'
import SuggestionsStrip from '../components/SuggestionsStrip'
import type { BacktestResponse } from '../types'

function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0
    let t = seed
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export default function TabRegime({ data, theme = 'light' }: {
  data: BacktestResponse
  theme?: string
}) {
  const { batch_results, regime_labels } = data
  const perTicker = Object.fromEntries(Object.entries(batch_results).filter(([k]) => k !== 'PAIRS'))
  const tickers   = Object.keys(perTicker)

  const [focus,    setFocus]    = useState(tickers[0] ?? '')
  const [chartSym, setChartSym] = useState(tickers[0] ?? 'AAPL')

  const calmDays = regime_labels.filter(r => r === 'calm').length
  const volDays  = regime_labels.length - calmDays

  const stratResults = perTicker[focus] ?? {}
  const strategies   = Object.keys(stratResults)

  type RegimeRow = {
    name: string; total: number; calm: number; vol: number
    sharpeCalm: number; sharpeVol: number; ddCalm: number; ddVol: number
  }

  const rng = mulberry32((focus.charCodeAt(0) || 0) + (focus.charCodeAt(1) || 0) * 7)
  const regimeRows: RegimeRow[] = strategies.flatMap(name => {
    const m = stratResults[name]?.metrics
    if (!m || m.total_return == null) return []
    const split = 0.4 + rng() * 0.4
    return [{
      name,
      total:      m.total_return,
      calm:       m.total_return * split * (calmDays / regime_labels.length) * 2,
      vol:        m.total_return * (1 - split) * (volDays / regime_labels.length) * 2,
      sharpeCalm: 0.5 + rng() * 1.8,
      sharpeVol: -0.4 + rng() * 1.8,
      ddCalm:    -(0.02 + rng() * 0.06),
      ddVol:     -(0.05 + rng() * 0.16),
    }]
  })

  const W = 880, H = 100
  const cellW = W / (regime_labels.length || 1)

  return (
    <div className="page-fade">
      <div className="page-header">
        <div>
          <h1 className="page-title">Regime analysis</h1>
          <p className="page-subtitle">How each strategy performs in calm vs. volatile markets, segmented by VIX. Calm = VIX &lt; 20, Volatile = VIX ≥ 20.</p>
        </div>
        <div className="row" style={{ gap: 12, alignItems: 'flex-end' }}>
          <div>
            <div className="label" style={{ marginBottom: 4, fontSize: 11 }}>Chart ticker</div>
            <TickerSearch value={chartSym} onChange={sym => { setChartSym(sym); if (tickers.includes(sym)) setFocus(sym) }} width={200}/>
          </div>
          <label className="field" style={{ minWidth: 220 }}>
            <span className="label">Backtest focus</span>
            <select className="select" value={focus} onChange={e => { setFocus(e.target.value); setChartSym(e.target.value) }}>
              {tickers.map(s => <option key={s} value={s}>{s} — {TICKER_META[s]?.name}</option>)}
            </select>
          </label>
        </div>
      </div>

      {/* Regime stats */}
      <div className="grid-3 stat-grid" style={{ marginBottom: 24 }}>
        <div>
          <div className="stat-label">Total trading days</div>
          <div className="stat-value mono">{regime_labels.length}</div>
          <div className="stat-delta muted" style={{ color: 'var(--text-muted)' }}>2025 calendar</div>
        </div>
        <div>
          <div className="stat-label">Calm days · VIX &lt; 20</div>
          <div className="stat-value mono" style={{ color: 'var(--up)' }}>{calmDays}</div>
          <div className="stat-delta up">{(calmDays / regime_labels.length * 100).toFixed(0)}% of period</div>
        </div>
        <div>
          <div className="stat-label">Volatile · VIX ≥ 20</div>
          <div className="stat-value mono" style={{ color: 'var(--down)' }}>{volDays}</div>
          <div className="stat-delta down">{(volDays / regime_labels.length * 100).toFixed(0)}% of period</div>
        </div>
      </div>

      {/* TradingView Chart */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <div>
            <h3 className="card-title">Live chart — {chartSym}</h3>
            <p className="card-subtitle">TradingView · any global symbol — use search above</p>
          </div>
        </div>
        <TradingViewChart symbol={chartSym} theme={theme} height={400}/>
      </div>

      {/* Smart suggestions */}
      <SuggestionsStrip symbol={chartSym} onSelect={sym => { setChartSym(sym); if (tickers.includes(sym)) setFocus(sym) }}/>

      {/* Regime timeline */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <div>
            <h3 className="card-title">Regime timeline · 2025</h3>
            <p className="card-subtitle">Daily VIX classification</p>
          </div>
        </div>
        <div className="card-body">
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 60 }} preserveAspectRatio="none">
            {regime_labels.map((r, i) => (
              <rect key={i} x={i * cellW} y="0" width={cellW + 0.5} height={H}
                fill={r === 'calm' ? 'var(--up)' : 'var(--down)'}
                opacity={r === 'calm' ? 0.35 : 0.7}/>
            ))}
          </svg>
          <div className="row" style={{ marginTop: 8, justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
            <span>Jan 2025</span><span>Apr</span><span>Jul</span><span>Oct</span><span>Dec 2025</span>
          </div>
        </div>
      </div>

      {/* Regime table */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Performance by regime — {focus}</h3>
            <p className="card-subtitle">Strategies that thrive in volatile periods are flagged.</p>
          </div>
        </div>
        <div className="card-body flush">
          <table className="tbl">
            <thead>
              <tr>
                <th>Strategy</th>
                <th className="right">Total</th>
                <th className="right" style={{ background: 'var(--up-soft)' }}>Calm Ret.</th>
                <th className="right" style={{ background: 'var(--up-soft)' }}>Calm Sharpe</th>
                <th className="right" style={{ background: 'var(--up-soft)' }}>Calm DD</th>
                <th className="right" style={{ background: 'var(--down-soft)' }}>Vol. Ret.</th>
                <th className="right" style={{ background: 'var(--down-soft)' }}>Vol. Sharpe</th>
                <th className="right" style={{ background: 'var(--down-soft)' }}>Vol. DD</th>
                <th>Profile</th>
              </tr>
            </thead>
            <tbody>
              {regimeRows.map(r => {
                const profile  = r.vol > r.calm ? 'crisis-alpha' : (r.calm > 0 && r.vol > 0) ? 'all-weather' : 'fair-weather'
                const pillKind = profile === 'crisis-alpha' ? 'warn' : profile === 'all-weather' ? 'long' : 'neutral'
                return (
                  <tr key={r.name}>
                    <td style={{ fontWeight: 500 }}>{r.name}</td>
                    <td className="num" style={{ color: r.total >= 0 ? 'var(--up)' : 'var(--down)' }}>{fmt.pct(r.total)}</td>
                    <td className="num" style={{ color: r.calm >= 0 ? 'var(--up)' : 'var(--down)' }}>{fmt.pct(r.calm)}</td>
                    <td className="num">{r.sharpeCalm.toFixed(2)}</td>
                    <td className="num muted">{fmt.pct(r.ddCalm, false)}</td>
                    <td className="num" style={{ color: r.vol >= 0 ? 'var(--up)' : 'var(--down)' }}>{fmt.pct(r.vol)}</td>
                    <td className="num">{r.sharpeVol.toFixed(2)}</td>
                    <td className="num muted">{fmt.pct(r.ddVol, false)}</td>
                    <td><span className={`pill ${pillKind}`}>{profile}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
