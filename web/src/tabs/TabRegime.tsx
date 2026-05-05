import { useState, useEffect } from 'react'
import { fmt } from '../components/ui'
import type { BacktestResponse } from '../types'

// ── types ─────────────────────────────────────────────────────────────────────
interface RegimeRow {
  Strategy: string
  'Return (Overall)': number | null
  'Sharpe (Overall)': number | null
  'MaxDD (Overall)':  number | null
  'WinRate (Overall)':number | null
  'Return (Calm)':    number | null
  'Sharpe (Calm)':    number | null
  'MaxDD (Calm)':     number | null
  'Return (Volatile)':number | null
  'Sharpe (Volatile)':number | null
  'MaxDD (Volatile)': number | null
}

// ── colour helpers ─────────────────────────────────────────────────────────────
function heatColor(val: number | null): string {
  if (val == null) return 'transparent'
  const capped = Math.max(-0.5, Math.min(0.5, val))
  if (capped >= 0) {
    const g = Math.round(34 + capped / 0.5 * (197 - 34))
    return `rgba(22,${g},59,0.85)`
  }
  const r = Math.round(200 + (Math.abs(capped) / 0.5) * 55)
  return `rgba(${r},30,30,0.85)`
}

function pctColor(val: number | null) {
  if (val == null) return 'var(--text-muted)'
  return val >= 0 ? 'var(--up)' : 'var(--down)'
}

// ── mini price chart with regime background ──────────────────────────────────
function RegimeSparkline({
  prices, dates, regimeMap, width = 220, height = 56,
}: {
  prices: number[]; dates: string[]; regimeMap: Map<string, string>
  width?: number; height?: number
}) {
  if (!prices.length) return null
  const n   = prices.length
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1
  const px = (i: number) => (i / (n - 1)) * width
  const py = (v: number) => height - ((v - min) / range) * (height - 4) - 2

  // Build contiguous regime bands
  type Band = { x1: number; x2: number; r: string }
  const bands: Band[] = []
  if (n > 0) {
    let curR = regimeMap.get(dates[0]) ?? 'calm'
    let bandStart = 0
    for (let i = 1; i <= n - 1; i++) {
      const r = regimeMap.get(dates[i]) ?? curR
      if (r !== curR) {
        bands.push({ x1: px(bandStart), x2: px(i - 1), r: curR })
        bandStart = i
        curR = r
      }
    }
    bands.push({ x1: px(bandStart), x2: px(n - 1), r: curR })
  }

  const pts = prices.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={{ display: 'block' }}>
      {bands.map((b, i) => (
        <rect key={i} x={b.x1} y={0} width={Math.max(1, b.x2 - b.x1)} height={height}
          fill={b.r === 'calm' ? '#16c53a' : '#e53e3e'}
          opacity={0.14}/>
      ))}
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="1.5" opacity="0.9"/>
    </svg>
  )
}

// ── per-ticker card ───────────────────────────────────────────────────────────
function TickerTimelineCard({
  ticker, prices, dates, regimeMap, calmRet, volRet,
}: {
  ticker: string; prices: number[]; dates: string[]
  regimeMap: Map<string, string>; calmRet: number | null; volRet: number | null
}) {
  return (
    <div className="card" style={{ padding: '10px 14px', minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>{ticker}</span>
        <div style={{ display: 'flex', gap: 8, fontSize: 11 }}>
          <span style={{ color: '#16c53a' }}>C {calmRet != null ? fmt.pct(calmRet) : '—'}</span>
          <span style={{ color: '#e53e3e' }}>V {volRet != null ? fmt.pct(volRet) : '—'}</span>
        </div>
      </div>
      <RegimeSparkline prices={prices} dates={dates} regimeMap={regimeMap} width={220} height={52}/>
      <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 10, color: 'var(--text-muted)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ width: 8, height: 8, background: '#16c53a', opacity: 0.6, display: 'inline-block', borderRadius: 1 }}/>Calm
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ width: 8, height: 8, background: '#e53e3e', opacity: 0.6, display: 'inline-block', borderRadius: 1 }}/>Volatile
        </span>
      </div>
    </div>
  )
}

// ── main component ─────────────────────────────────────────────────────────────
export default function TabRegime({ data }: { data: BacktestResponse }) {
  const { batch_results, regime_labels, regime_dates = [], price_data } = data
  const perTicker = Object.fromEntries(Object.entries(batch_results).filter(([k]) => k !== 'PAIRS'))
  const tickers   = Object.keys(perTicker)

  const [allRegimeData, setAllRegimeData] = useState<Record<string, RegimeRow[]>>({})
  const [loadingAll, setLoadingAll]       = useState(true)
  const [sortBy, setSortBy]               = useState<'calm' | 'volatile' | 'overall'>('calm')
  const [focus, setFocus]                 = useState(tickers[0] ?? '')

  useEffect(() => {
    setLoadingAll(true)
    const base = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000').replace(/\/$/, '')
    fetch(`${base}/api/regime_analysis_all`)
      .then(r => r.json())
      .then(d => { setAllRegimeData(d); setLoadingAll(false) })
      .catch(() => setLoadingAll(false))
  }, [])

  // date→regime lookup
  const regimeMap = new Map<string, string>()
  regime_dates.forEach((d, i) => { if (regime_labels[i]) regimeMap.set(d, regime_labels[i]) })

  const calmDays = regime_labels.filter(r => r === 'calm').length
  const volDays  = regime_labels.length - calmDays

  function bestReturn(rows: RegimeRow[], key: 'Return (Calm)' | 'Return (Volatile)' | 'Return (Overall)'): number | null {
    if (!rows?.length) return null
    const vals = rows.map(r => r[key]).filter((v): v is number => v != null)
    return vals.length ? Math.max(...vals) : null
  }

  function bestSharpe(rows: RegimeRow[], key: 'Sharpe (Calm)' | 'Sharpe (Volatile)'): number | null {
    if (!rows?.length) return null
    const vals = rows.map(r => r[key]).filter((v): v is number => v != null)
    return vals.length ? Math.max(...vals) : null
  }

  const tickerSummary = tickers.map(t => ({
    ticker:  t,
    calm:    bestReturn(allRegimeData[t], 'Return (Calm)'),
    vol:     bestReturn(allRegimeData[t], 'Return (Volatile)'),
    overall: bestReturn(allRegimeData[t], 'Return (Overall)'),
  }))

  const sorted = [...tickerSummary].sort((a, b) => {
    const va = sortBy === 'calm' ? a.calm : sortBy === 'volatile' ? a.vol : a.overall
    const vb = sortBy === 'calm' ? b.calm : sortBy === 'volatile' ? b.vol : b.overall
    return (vb ?? -Infinity) - (va ?? -Infinity)
  })

  const focusRows: RegimeRow[] = allRegimeData[focus] ?? []

  return (
    <div className="page-fade">
      <div className="page-header">
        <div>
          <h1 className="page-title">Regime analysis</h1>
          <p className="page-subtitle">
            Performance in calm (VIX &lt; 20) vs volatile (VIX ≥ 20) markets across all {tickers.length} stocks.
          </p>
        </div>
      </div>

      {/* ── Global stats ─────────────────────────────────────────────────── */}
      <div className="grid-3 stat-grid" style={{ marginBottom: 24 }}>
        <div>
          <div className="stat-label">Trading days</div>
          <div className="stat-value mono">{regime_labels.length}</div>
        </div>
        <div>
          <div className="stat-label">Calm · VIX &lt; 20</div>
          <div className="stat-value mono" style={{ color: '#16c53a' }}>{calmDays}</div>
          <div className="stat-delta" style={{ color: '#16c53a' }}>{(calmDays / (regime_labels.length || 1) * 100).toFixed(0)}% of period</div>
        </div>
        <div>
          <div className="stat-label">Volatile · VIX ≥ 20</div>
          <div className="stat-value mono" style={{ color: 'var(--down)' }}>{volDays}</div>
          <div className="stat-delta down">{(volDays / (regime_labels.length || 1) * 100).toFixed(0)}% of period</div>
        </div>
      </div>

      {/* ── Global regime timeline ───────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <h3 className="card-title">Market regime timeline</h3>
          <p className="card-subtitle">Daily VIX classification — green = calm, red = volatile</p>
        </div>
        <div className="card-body">
          <svg viewBox="0 0 880 40" style={{ width: '100%', height: 36 }} preserveAspectRatio="none">
            {regime_labels.map((r, i) => (
              <rect key={i}
                x={i * (880 / (regime_labels.length || 1))} y={0}
                width={(880 / (regime_labels.length || 1)) + 0.5} height={40}
                fill={r === 'calm' ? '#16c53a' : '#e53e3e'}
                opacity={r === 'calm' ? 0.4 : 0.7}
              />
            ))}
          </svg>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
            {[0, 0.25, 0.5, 0.75, 1].map(frac => {
              const idx = Math.min(Math.floor(frac * (regime_dates.length - 1)), regime_dates.length - 1)
              return <span key={frac}>{regime_dates[idx] ?? ''}</span>
            })}
          </div>
        </div>
      </div>

      {/* ── All-stocks heatmap ───────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h3 className="card-title">All-stocks regime heatmap</h3>
            <p className="card-subtitle">Best strategy return per regime. Click a row to drill into strategy detail below.</p>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['calm', 'volatile', 'overall'] as const).map(s => (
              <button key={s} onClick={() => setSortBy(s)}
                style={{
                  fontSize: 11, padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border)',
                  background: sortBy === s ? 'var(--accent)' : 'transparent',
                  color: sortBy === s ? '#fff' : 'var(--text-muted)',
                  cursor: 'pointer', fontWeight: 600,
                }}>
                ↑ {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="card-body flush">
          {loadingAll ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading regime data…</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th className="right" style={{ background: 'rgba(22,197,58,0.07)' }}>Calm Ret.</th>
                    <th className="right" style={{ background: 'rgba(22,197,58,0.07)' }}>Calm Sharpe</th>
                    <th className="right" style={{ background: 'rgba(229,62,62,0.07)' }}>Vol. Ret.</th>
                    <th className="right" style={{ background: 'rgba(229,62,62,0.07)' }}>Vol. Sharpe</th>
                    <th className="right">Overall Ret.</th>
                    <th>Profile</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(({ ticker, calm, vol, overall }) => {
                    const rows = allRegimeData[ticker] ?? []
                    const cs = bestSharpe(rows, 'Sharpe (Calm)')
                    const vs = bestSharpe(rows, 'Sharpe (Volatile)')
                    const profile = (calm != null && vol != null)
                      ? (vol > calm ? 'crisis-alpha' : calm > 0 && vol > 0 ? 'all-weather' : 'fair-weather')
                      : '—'
                    const profileColor = profile === 'crisis-alpha' ? '#f6ad55'
                      : profile === 'all-weather' ? '#16c53a' : 'var(--text-muted)'
                    return (
                      <tr key={ticker} style={{ cursor: 'pointer' }}
                        onClick={() => setFocus(ticker)}>
                        <td style={{ fontWeight: 700 }}>{ticker}</td>
                        <td className="num" style={{ background: heatColor(calm), color: pctColor(calm) }}>
                          {calm != null ? fmt.pct(calm) : '—'}
                        </td>
                        <td className="num">
                          {cs != null && cs > -98 ? cs.toFixed(2) : '—'}
                        </td>
                        <td className="num" style={{ background: heatColor(vol), color: pctColor(vol) }}>
                          {vol != null ? fmt.pct(vol) : '—'}
                        </td>
                        <td className="num">
                          {vs != null && vs > -98 ? vs.toFixed(2) : '—'}
                        </td>
                        <td className="num" style={{ color: pctColor(overall) }}>
                          {overall != null ? fmt.pct(overall) : '—'}
                        </td>
                        <td><span style={{ fontSize: 11, color: profileColor, fontWeight: 600 }}>{profile}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Per-stock regime timelines ───────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <h3 className="card-title">Regime timeline per stock</h3>
          <p className="card-subtitle">Price history with calm (green) / volatile (red) background. C = best calm return, V = best volatile return.</p>
        </div>
        <div className="card-body">
          {regimeMap.size === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Re-run backtest to populate regime dates.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(252px, 1fr))', gap: 10 }}>
              {tickers.map(ticker => {
                const pd = price_data[ticker]
                if (!pd) return null
                const summary = tickerSummary.find(t => t.ticker === ticker)
                return (
                  <TickerTimelineCard
                    key={ticker}
                    ticker={ticker}
                    prices={pd.series}
                    dates={pd.dates}
                    regimeMap={regimeMap}
                    calmRet={summary?.calm ?? null}
                    volRet={summary?.vol ?? null}
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Strategy detail ──────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h3 className="card-title">Strategy detail — {focus}</h3>
            <p className="card-subtitle">Real regime-split metrics from backtest data.</p>
          </div>
          <select className="select" value={focus} onChange={e => setFocus(e.target.value)} style={{ minWidth: 120 }}>
            {tickers.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="card-body flush">
          {loadingAll ? (
            <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
          ) : focusRows.length === 0 ? (
            <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 13 }}>No data for {focus}.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Strategy</th>
                    <th className="right">Total Ret.</th>
                    <th className="right">Sharpe</th>
                    <th className="right" style={{ background: 'rgba(22,197,58,0.07)' }}>Calm Ret.</th>
                    <th className="right" style={{ background: 'rgba(22,197,58,0.07)' }}>Calm Sharpe</th>
                    <th className="right" style={{ background: 'rgba(22,197,58,0.07)' }}>Calm DD</th>
                    <th className="right" style={{ background: 'rgba(229,62,62,0.07)' }}>Vol. Ret.</th>
                    <th className="right" style={{ background: 'rgba(229,62,62,0.07)' }}>Vol. Sharpe</th>
                    <th className="right" style={{ background: 'rgba(229,62,62,0.07)' }}>Vol. DD</th>
                  </tr>
                </thead>
                <tbody>
                  {focusRows.map(r => (
                    <tr key={r.Strategy}>
                      <td style={{ fontWeight: 500, fontSize: 12 }}>{r.Strategy}</td>
                      <td className="num" style={{ color: pctColor(r['Return (Overall)']) }}>
                        {r['Return (Overall)'] != null ? fmt.pct(r['Return (Overall)']) : '—'}
                      </td>
                      <td className="num">
                        {r['Sharpe (Overall)'] != null ? r['Sharpe (Overall)'].toFixed(2) : '—'}
                      </td>
                      <td className="num" style={{ color: pctColor(r['Return (Calm)']) }}>
                        {r['Return (Calm)'] != null ? fmt.pct(r['Return (Calm)']) : '—'}
                      </td>
                      <td className="num">
                        {r['Sharpe (Calm)'] != null ? r['Sharpe (Calm)'].toFixed(2) : '—'}
                      </td>
                      <td className="num" style={{ color: 'var(--down)' }}>
                        {r['MaxDD (Calm)'] != null ? fmt.pct(r['MaxDD (Calm)'], false) : '—'}
                      </td>
                      <td className="num" style={{ color: pctColor(r['Return (Volatile)']) }}>
                        {r['Return (Volatile)'] != null ? fmt.pct(r['Return (Volatile)']) : '—'}
                      </td>
                      <td className="num">
                        {r['Sharpe (Volatile)'] != null ? r['Sharpe (Volatile)'].toFixed(2) : '—'}
                      </td>
                      <td className="num" style={{ color: 'var(--down)' }}>
                        {r['MaxDD (Volatile)'] != null ? fmt.pct(r['MaxDD (Volatile)'], false) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
