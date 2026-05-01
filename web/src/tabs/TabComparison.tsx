import { useState, useMemo } from 'react'
import { fmt, stratColor, TICKER_META } from '../components/ui'
import TradingViewChart from '../components/TradingViewChart'
import TickerSearch from '../components/TickerSearch'
import SuggestionsStrip from '../components/SuggestionsStrip'
import type { BacktestResponse } from '../types'

const W = 880, H = 360, PAD = { l: 64, r: 20, t: 16, b: 36 }
const innerW = W - PAD.l - PAD.r
const innerH = H - PAD.t - PAD.b

export default function TabComparison({ data, theme = 'light' }: {
  data: BacktestResponse
  theme?: string
}) {
  const { batch_results, regime_labels } = data
  const perTicker = Object.fromEntries(Object.entries(batch_results).filter(([k]) => k !== 'PAIRS'))
  const tickers   = Object.keys(perTicker)

  const [focus,   setFocus]   = useState(tickers[0] ?? '')
  const [chartSym, setChartSym] = useState(tickers[0] ?? 'AAPL')
  const [hovered, setHovered] = useState<string | null>(null)

  const stratResults = perTicker[focus] ?? {}
  const strategies   = Object.keys(stratResults)

  const { paths, minV, maxV, days } = useMemo(() => {
    const allValues = Object.values(stratResults).flatMap(r => r.value_series)
    if (!allValues.length) return { paths: {}, minV: 0, maxV: 1, days: 252 }
    const minV  = Math.min(...allValues)
    const maxV  = Math.max(...allValues)
    const range = maxV - minV || 1
    const days  = Math.max(...Object.values(stratResults).map(r => r.value_series.length))

    const paths: Record<string, string> = {}
    for (const [name, r] of Object.entries(stratResults)) {
      const d = r.value_series
      paths[name] = d.map((v, i) => {
        const x = PAD.l + (i / (d.length - 1)) * innerW
        const y = PAD.t + innerH - ((v - minV) / range) * innerH
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
      }).join(' ')
    }
    return { paths, minV, maxV, days }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, JSON.stringify(stratResults)])

  const range   = maxV - minV || 1
  const yTicks  = 5
  const yLabels = Array.from({ length: yTicks }, (_, i) => ({
    v: minV + range * i / (yTicks - 1),
    y: PAD.t + innerH - (i / (yTicks - 1)) * innerH,
  }))

  const regimeBands = useMemo(() => {
    const bands: { x1: number; x2: number }[] = []
    let start = 0
    const n = regime_labels.length
    for (let i = 1; i <= n; i++) {
      if (i === n || regime_labels[i] !== regime_labels[start]) {
        if (regime_labels[start] === 'volatile') {
          bands.push({
            x1: PAD.l + (start / (days - 1)) * innerW,
            x2: PAD.l + (Math.min(i, days - 1) / (days - 1)) * innerW,
          })
        }
        start = i
      }
    }
    return bands
  }, [regime_labels, days])

  const baseline10k = maxV > 10_000 ? PAD.t + innerH - ((10_000 - minV) / range) * innerH : null

  return (
    <div className="page-fade">
      <div className="page-header">
        <div>
          <h1 className="page-title">Strategy comparison</h1>
          <p className="page-subtitle">Equity curves and full metrics for every strategy on one stock. Volatile regime windows shaded.</p>
        </div>
        <div className="row" style={{ gap: 12, alignItems: 'flex-end' }}>
          <div>
            <div className="label" style={{ marginBottom: 4, fontSize: 11 }}>Chart ticker</div>
            <TickerSearch value={chartSym} onChange={sym => { setChartSym(sym); if (tickers.includes(sym)) setFocus(sym) }} width={200}/>
          </div>
          <label className="field" style={{ minWidth: 200 }}>
            <span className="label">Backtest focus</span>
            <select className="select" value={focus} onChange={e => { setFocus(e.target.value); setChartSym(e.target.value) }}>
              {tickers.map(s => <option key={s} value={s}>{s} — {TICKER_META[s]?.name}</option>)}
            </select>
          </label>
        </div>
      </div>

      {/* TradingView Chart */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <div>
            <h3 className="card-title">Live chart — {chartSym}</h3>
            <p className="card-subtitle">TradingView · use search above to browse any global symbol</p>
          </div>
        </div>
        <TradingViewChart symbol={chartSym} theme={theme} height={440}/>
      </div>

      {/* Smart suggestions */}
      <SuggestionsStrip symbol={chartSym} onSelect={sym => { setChartSym(sym); if (tickers.includes(sym)) setFocus(sym) }}/>

      {/* Equity curve */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <div>
            <h3 className="card-title">Equity curves — {focus}</h3>
            <p className="card-subtitle">€10,000 initial capital · click legend to focus</p>
          </div>
          <span className="tag" style={{ background: 'rgba(192,56,59,0.08)', color: 'var(--down)', borderColor: 'transparent' }}>● volatile regime</span>
        </div>
        <div className="card-body">
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 380 }}>
            {yLabels.map((t, i) => (
              <g key={i}>
                <line x1={PAD.l} x2={W - PAD.r} y1={t.y} y2={t.y} stroke="var(--border)" strokeWidth="1" strokeDasharray="2 4"/>
                <text x={PAD.l - 8} y={t.y + 4} fontSize="11" fill="var(--text-muted)" textAnchor="end" fontFamily="var(--mono)">{fmt.money(t.v, 0)}</text>
              </g>
            ))}
            {regimeBands.map((b, i) => (
              <rect key={i} x={b.x1} y={PAD.t} width={b.x2 - b.x1} height={innerH} fill="var(--down)" opacity="0.04"/>
            ))}
            {baseline10k != null && (
              <line x1={PAD.l} x2={W - PAD.r} y1={baseline10k} y2={baseline10k}
                stroke="var(--text-subtle)" strokeWidth="1" strokeDasharray="3 3" opacity="0.5"/>
            )}
            {['Jan','Apr','Jul','Oct','Dec'].map((m, i) => (
              <text key={m} x={PAD.l + (i / 4) * innerW} y={H - 12} fontSize="11" fill="var(--text-muted)" textAnchor="middle" fontFamily="var(--mono)">{m}</text>
            ))}
            {strategies.map((name, i) => (
              <path key={name} d={paths[name] ?? ''} fill="none"
                stroke={stratColor(i)}
                strokeWidth={hovered === name ? 2.5 : 1.5}
                opacity={hovered && hovered !== name ? 0.2 : 1}
                strokeLinecap="round" strokeLinejoin="round"/>
            ))}
          </svg>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginTop: 16 }}>
            {strategies.map((name, i) => {
              const ret = stratResults[name]?.metrics.total_return ?? 0
              return (
                <div key={name}
                  onMouseEnter={() => setHovered(name)}
                  onMouseLeave={() => setHovered(null)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 6, background: hovered === name ? 'var(--bg-subtle)' : 'transparent', cursor: 'pointer' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: stratColor(i), flexShrink: 0 }}/>
                  <span style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                  <span className="mono" style={{ fontSize: 12, color: ret >= 0 ? 'var(--up)' : 'var(--down)', fontWeight: 500 }}>{fmt.pct(ret)}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Metrics table */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Performance metrics — {focus}</h3>
          <span className="tag">{strategies.length} strategies</span>
        </div>
        <div className="card-body flush">
          <table className="tbl">
            <thead><tr>
              <th>Strategy</th>
              <th className="right">Return</th><th className="right">CAGR</th>
              <th className="right">Sharpe</th><th className="right">Max DD</th>
              <th className="right">Calmar</th><th className="right">Win rate</th>
              <th className="right">Avg dur.</th><th className="right">Trades</th>
            </tr></thead>
            <tbody>
              {strategies.map((name, i) => {
                const m = stratResults[name]?.metrics
                if (!m) return null
                return (
                  <tr key={name}>
                    <td>
                      <div className="row" style={{ gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: stratColor(i), flexShrink: 0 }}/>
                        <span style={{ fontWeight: 500 }}>{name}</span>
                      </div>
                    </td>
                    <td className="num" style={{ color: (m.total_return ?? 0) >= 0 ? 'var(--up)' : 'var(--down)', fontWeight: 500 }}>{fmt.pct(m.total_return)}</td>
                    <td className="num">{fmt.pct(m.cagr)}</td>
                    <td className="num">{m.sharpe_ratio?.toFixed(2) ?? '—'}</td>
                    <td className="num" style={{ color: 'var(--down)' }}>{fmt.pct(m.max_drawdown, false)}</td>
                    <td className="num">{m.calmar_ratio?.toFixed(2) ?? '—'}</td>
                    <td className="num">{fmt.pctSimple(m.win_rate)}</td>
                    <td className="num">{m.avg_trade_duration != null ? `${m.avg_trade_duration.toFixed(0)}d` : '—'}</td>
                    <td className="num">{m.n_trades ?? '—'}</td>
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
