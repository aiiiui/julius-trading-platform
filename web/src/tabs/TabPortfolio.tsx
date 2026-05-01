import { useState, useMemo } from 'react'
import { Icons, Sparkline, Delta, fmt, stratColor, TICKER_META } from '../components/ui'
import TradingViewChart from '../components/TradingViewChart'
import TickerSearch from '../components/TickerSearch'
import SuggestionsStrip from '../components/SuggestionsStrip'
import type { BacktestResponse } from '../types'

const METRIC_OPTS = [
  { v: 'total_return', label: 'Return',   kind: 'pct' },
  { v: 'sharpe_ratio', label: 'Sharpe',   kind: 'num' },
  { v: 'max_drawdown', label: 'Max DD',   kind: 'pct' },
  { v: 'win_rate',     label: 'Win Rate', kind: 'pct' },
] as const

function heatColor(v: number | null, metric: string) {
  if (v == null || isNaN(v)) return 'var(--bg-subtle)'
  let intensity: number, isUp: boolean
  if (metric === 'max_drawdown') {
    isUp = false; intensity = Math.min(Math.abs(v) / 0.2, 1)
  } else if (metric === 'sharpe_ratio') {
    isUp = v >= 1; intensity = Math.min(Math.abs(v) / 2.5, 1)
  } else if (metric === 'win_rate') {
    isUp = v >= 0.5; intensity = Math.min(Math.abs(v - 0.5) / 0.3, 1)
  } else {
    isUp = v >= 0; intensity = Math.min(Math.abs(v) / 0.3, 1)
  }
  const a = 0.15 + intensity * 0.7
  return isUp ? `rgba(10,138,62,${a})` : `rgba(192,56,59,${a})`
}

export default function TabPortfolio({ data, spark, changes, theme = 'light' }: {
  data: BacktestResponse
  spark: Record<string, number[]>
  changes: Record<string, number>
  theme?: string
}) {
  const [metric, setMetric] = useState<'total_return'|'sharpe_ratio'|'max_drawdown'|'win_rate'>('total_return')
  const { batch_results } = data
  const perTicker  = Object.fromEntries(Object.entries(batch_results).filter(([k]) => k !== 'PAIRS'))
  const tickers    = Object.keys(perTicker)
  const strategies = tickers.length ? Object.keys(perTicker[tickers[0]]) : []

  const [focusedTicker,    setFocusedTicker]    = useState(tickers[0] ?? 'AAPL')
  const [assignedStrategy, setAssignedStrategy] = useState(strategies[0] ?? '')
  const [weights, setWeights] = useState<Record<string, number>>(() =>
    Object.fromEntries(tickers.map(t => [t, Math.round(100 / tickers.length)]))
  )

  const totalWeight = useMemo(() =>
    Object.values(weights).reduce((a, b) => a + b, 0) || 1,
    [weights]
  )

  const portfolioReturns = useMemo(() =>
    Object.fromEntries(strategies.map(strat => {
      let weighted = 0
      for (const ticker of tickers) {
        const w   = (weights[ticker] ?? 0) / totalWeight
        const ret = perTicker[ticker]?.[strat]?.metrics.total_return ?? 0
        weighted += w * ret
      }
      return [strat, weighted]
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [strategies, tickers, weights, totalWeight]
  )

  const bestStrategy = strategies.reduce(
    (best, s) => (portfolioReturns[s] ?? -Infinity) > (portfolioReturns[best] ?? -Infinity) ? s : best,
    strategies[0] ?? ''
  )

  let totalTrades = 0, totalReturn = 0, count = 0, worstDD = 0
  for (const strats of Object.values(perTicker)) {
    for (const [, r] of Object.entries(strats)) {
      const m = r.metrics
      if (m.total_return != null) { totalReturn += m.total_return; count++ }
      if (m.max_drawdown != null && m.max_drawdown < worstDD) worstDD = m.max_drawdown
      totalTrades += m.n_trades ?? 0
    }
  }
  const avgReturn     = count ? totalReturn / count : 0
  const assignedReturn = portfolioReturns[assignedStrategy] ?? 0

  return (
    <div className="page-fade">
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Portfolio dashboard</h1>
          <p className="page-subtitle">Interactive allocation &amp; strategy comparison. Click any row to focus the chart.</p>
        </div>
        <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
          <div>
            <div className="label" style={{ marginBottom: 4, fontSize: 11 }}>Chart ticker</div>
            <TickerSearch value={focusedTicker} onChange={setFocusedTicker} changes={changes} width={220}/>
          </div>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid-4 stat-grid" style={{ marginBottom: 24 }}>
        <div>
          <div className="stat-label">Capital deployed</div>
          <div className="stat-value">{fmt.money(tickers.length * 10_000, 0)}</div>
          <div className="stat-delta up">across {tickers.length} stocks · {strategies.length} strategies</div>
        </div>
        <div>
          <div className="stat-label">Active strategy return</div>
          <div className="stat-value" style={{ color: assignedReturn >= 0 ? 'var(--up)' : 'var(--down)' }}>
            {(assignedReturn * 100).toFixed(1)}<span style={{ fontSize: 18, opacity: 0.6 }}>%</span>
          </div>
          <div className="stat-delta muted" style={{ fontSize: 11 }}>{assignedStrategy.slice(0, 26) || '—'}</div>
        </div>
        <div>
          <div className="stat-label">Avg. strategy return</div>
          <div className="stat-value">{(avgReturn * 100).toFixed(1)}<span style={{ fontSize: 18, opacity: 0.6 }}>%</span></div>
          <div className={`stat-delta ${avgReturn >= 0 ? 'up' : 'down'}`}>{fmt.pct(avgReturn - 0.12)} vs benchmark</div>
        </div>
        <div>
          <div className="stat-label">Total trades</div>
          <div className="stat-value mono">{totalTrades.toLocaleString()}</div>
          <div className="stat-delta muted">worst DD {fmt.pct(worstDD)}</div>
        </div>
      </div>

      {/* TradingView Chart */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <div>
            <h3 className="card-title">Live chart — {focusedTicker}</h3>
            <p className="card-subtitle">TradingView · click heatmap row or ticker to switch</p>
          </div>
          <button className="btn" style={{ fontSize: 11 }} onClick={() => setFocusedTicker(tickers[0] ?? 'AAPL')}>
            Reset to portfolio
          </button>
        </div>
        <TradingViewChart symbol={focusedTicker} theme={theme} height={400}/>
      </div>

      {/* Smart suggestions */}
      <SuggestionsStrip symbol={focusedTicker} onSelect={setFocusedTicker} changes={changes} spark={spark}/>

      {/* Allocation + Strategy grid */}
      <div className="grid-2" style={{ gap: 24, marginBottom: 24 }}>

        {/* Allocation panel */}
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Asset allocation</h3>
              <p className="card-subtitle">Drag sliders to rebalance · weights auto-normalize</p>
            </div>
          </div>
          <div className="card-body">
            {/* Stacked bar */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ height: 20, borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
                {tickers.map((sym, i) => {
                  const pct = ((weights[sym] ?? 0) / totalWeight) * 100
                  return (
                    <div key={sym}
                      style={{ width: `${pct}%`, background: stratColor(i), transition: 'width 0.2s' }}
                      title={`${sym}: ${pct.toFixed(1)}%`}/>
                  )
                })}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 6 }}>
                {tickers.map((sym, i) => {
                  const pct = ((weights[sym] ?? 0) / totalWeight) * 100
                  return (
                    <div key={sym} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: stratColor(i) }}/>
                      {sym} {pct.toFixed(0)}%
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Sliders */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tickers.map((sym, i) => {
                const pct = ((weights[sym] ?? 0) / totalWeight) * 100
                return (
                  <div key={sym} style={{ display: 'grid', gridTemplateColumns: '52px 1fr 36px', gap: 8, alignItems: 'center' }}>
                    <button
                      onClick={() => setFocusedTicker(sym)}
                      style={{
                        fontWeight: 600, fontFamily: 'var(--mono)', fontSize: 12,
                        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                        color: sym === focusedTicker ? 'var(--accent-text)' : 'var(--text)',
                        textAlign: 'left',
                      }}>
                      {sym}
                    </button>
                    <input type="range" min={0} max={100} value={weights[sym] ?? 0}
                      style={{ accentColor: stratColor(i), cursor: 'pointer' }}
                      onChange={e => setWeights(w => ({ ...w, [sym]: Number(e.target.value) }))}/>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                )
              })}
            </div>

            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button className="btn" style={{ fontSize: 11, padding: '4px 10px' }}
                onClick={() => setWeights(Object.fromEntries(tickers.map(t => [t, Math.round(100 / tickers.length)])))}>
                Equal weight
              </button>
              <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>Click name to focus chart</span>
            </div>
          </div>
        </div>

        {/* Strategy comparison */}
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Strategy comparison</h3>
              <p className="card-subtitle">Weighted portfolio return · click to assign</p>
            </div>
          </div>
          <div className="card-body">
            <label className="field" style={{ marginBottom: 16 }}>
              <span className="label">Active strategy</span>
              <select className="select" value={assignedStrategy} onChange={e => setAssignedStrategy(e.target.value)}>
                {strategies.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {strategies.map((strat, i) => {
                const ret     = portfolioReturns[strat] ?? 0
                const maxAbs  = Math.max(...Object.values(portfolioReturns).map(Math.abs)) || 0.01
                const barW    = Math.abs(ret / maxAbs) * 100
                const active  = strat === assignedStrategy
                return (
                  <div key={strat} onClick={() => setAssignedStrategy(strat)} className="strat-bar-row">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: stratColor(i), flexShrink: 0 }}/>
                        <span style={{ fontSize: 12, fontWeight: active ? 600 : 400, color: active ? 'var(--text)' : 'var(--text-muted)' }}>
                          {strat}
                        </span>
                        {active && (
                          <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'var(--accent-soft)', color: 'var(--accent-text)', fontFamily: 'var(--mono)' }}>
                            active
                          </span>
                        )}
                      </div>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: ret >= 0 ? 'var(--up)' : 'var(--down)' }}>
                        {ret >= 0 ? '+' : ''}{(ret * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-subtle)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 3, transition: 'width 0.3s',
                        width: `${barW}%`,
                        background: active ? 'var(--accent)' : ret >= 0 ? 'var(--up)' : 'var(--down)',
                        opacity: active ? 1 : 0.6,
                      }}/>
                    </div>
                  </div>
                )
              })}
            </div>

            {bestStrategy && (
              <div style={{ marginTop: 14, padding: '8px 10px', borderRadius: 6, background: 'var(--up-soft)', fontSize: 11, color: 'var(--up)' }}>
                Best weighted portfolio: <strong>{bestStrategy}</strong> — {fmt.pct(portfolioReturns[bestStrategy] ?? null)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Performance heatmap */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <div>
            <h3 className="card-title">Performance heatmap</h3>
            <p className="card-subtitle">Stock × strategy matrix · click row to focus chart</p>
          </div>
          <div className="subtabs">
            {METRIC_OPTS.map(o => (
              <button key={o.v} className={`subtab ${metric === o.v ? 'active' : ''}`} onClick={() => setMetric(o.v)}>{o.label}</button>
            ))}
          </div>
        </div>
        <div className="card-body" style={{ overflowX: 'auto' }}>
          <div className="heatmap">
            <div className="heatmap-row" style={{ display: 'grid', gridTemplateColumns: `120px repeat(${strategies.length}, 1fr)`, marginBottom: 4 }}>
              <div/>
              {strategies.map((s, i) => (
                <div key={s} className="tiny muted" style={{ textAlign: 'center', padding: '0 4px' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: stratColor(i), display: 'inline-block', marginRight: 4 }}/>
                  {s.split(' ')[0]}
                </div>
              ))}
            </div>
            {tickers.map(sym => (
              <div key={sym}
                className="heatmap-row"
                style={{ display: 'grid', gridTemplateColumns: `120px repeat(${strategies.length}, 1fr)`, cursor: 'pointer' }}
                onClick={() => setFocusedTicker(sym)}>
                <div className="heatmap-label" style={{ background: sym === focusedTicker ? 'var(--accent-soft)' : undefined }}>
                  <div style={{ fontWeight: 600, color: sym === focusedTicker ? 'var(--accent-text)' : 'var(--text)' }}>{sym}</div>
                  <div className="tiny muted">{TICKER_META[sym]?.sector}</div>
                </div>
                {strategies.map(s => {
                  const m   = perTicker[sym]?.[s]?.metrics
                  const v   = m ? (m as unknown as Record<string, number | null>)[metric] : null
                  const kind = METRIC_OPTS.find(o => o.v === metric)?.kind
                  const display = v == null ? '—' : kind === 'pct' ? `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}%` : v.toFixed(2)
                  return (
                    <div key={s} className="heatmap-cell" style={{ background: heatColor(v, metric) }}
                      title={`${sym} · ${s}: ${display}`}>
                      {display}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Per-stock table */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Per-stock summary</h3>
          <p className="card-subtitle">Best &amp; worst strategy · click row to focus chart</p>
        </div>
        <div className="card-body flush">
          <table className="tbl">
            <thead><tr>
              <th>Symbol</th><th>Sector</th><th>Today</th>
              <th style={{ width: 100 }}>30d</th>
              <th>Best strategy</th><th className="right">Best</th>
              <th>Worst strategy</th><th className="right">Worst</th>
              <th className="right">Trades</th>
            </tr></thead>
            <tbody>
              {tickers.map(sym => {
                const strats = perTicker[sym]
                let best: { name: string; ret: number } | null = null
                let worst: { name: string; ret: number } | null = null
                let trades = 0
                for (const [name, r] of Object.entries(strats)) {
                  const ret = r.metrics.total_return ?? -Infinity
                  trades += r.metrics.n_trades ?? 0
                  if (!best || ret > best.ret) best = { name, ret }
                  if (!worst || ret < worst.ret) worst = { name, ret }
                }
                const pct = changes[sym] ?? 0
                return (
                  <tr key={sym} onClick={() => setFocusedTicker(sym)} style={{ cursor: 'pointer', background: sym === focusedTicker ? 'var(--bg-subtle)' : undefined }}>
                    <td>
                      <div style={{ fontWeight: 600, color: sym === focusedTicker ? 'var(--accent-text)' : undefined }}>{sym}</div>
                      <div className="tiny muted">{TICKER_META[sym]?.name}</div>
                    </td>
                    <td><span className="tag">{TICKER_META[sym]?.sector}</span></td>
                    <td><Delta value={pct}/></td>
                    <td><Sparkline data={spark[sym]?.slice(-30) ?? []}/></td>
                    <td className="tiny">{best?.name}</td>
                    <td className="num" style={{ color: 'var(--up)', fontWeight: 500 }}>{fmt.pct(best?.ret ?? null)}</td>
                    <td className="tiny muted">{worst?.name}</td>
                    <td className="num" style={{ color: 'var(--down)' }}>{fmt.pct(worst?.ret ?? null)}</td>
                    <td className="num">{trades}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        .strat-bar-row { cursor: pointer; padding: 4px 6px; margin: 0 -6px; border-radius: 5px; transition: background 0.1s; }
        .strat-bar-row:hover { background: var(--bg-subtle); }
      `}</style>
    </div>
  )
}
