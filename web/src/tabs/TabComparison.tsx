import { useState, useMemo } from 'react'
import { fmt, stratColor } from '../components/ui'
import type { BacktestResponse, StrategyResult } from '../types'

// ── Strategy logic reference data ────────────────────────────────────────────

interface StratDef {
  description: string
  buyCondition: string
  sellCondition: string
  formulas: string[]
  parameters: Record<string, string>
  note: string
}

const STRATEGY_DEFS: Record<string, StratDef> = {
  'EMA Crossover + Volume': {
    description: 'Trend-following strategy that requires three EMAs to form a bullish stack (EMA50 > EMA100 > EMA200) before entering, with volume confirmation to filter low-conviction breakouts.',
    buyCondition: 'EMA50 crosses above EMA100, AND EMA100 > EMA200 (all three stacked bullishly), AND Volume > 20-day average volume',
    sellCondition: 'EMA50 crosses below EMA100, OR EMA100 crosses below EMA200 (trend breakdown at any level)',
    formulas: [
      'EMAₙ(t) = Price(t) × α + EMAₙ(t−1) × (1−α),   α = 2/(n+1)',
      'Buy signal:  EMA50[t−1] ≤ EMA100[t−1]  AND  EMA50[t] > EMA100[t]  AND  EMA100 > EMA200  AND  Vol > VolMA(20)',
      'Sell signal: EMA50[t−1] > EMA100[t−1]  AND  EMA50[t] ≤ EMA100[t]',
      '          OR EMA100[t−1] > EMA200[t−1] AND  EMA100[t] ≤ EMA200[t]',
    ],
    parameters: { 'Fast EMA': '50', 'Mid EMA': '100', 'Slow EMA': '200', 'Volume window': '20' },
    note: 'Works best in strong trending markets. Lags heavily in sideways conditions due to slow EMA periods.',
  },
  'RSI + Bollinger Bands': {
    description: 'Mean-reversion strategy for ranging/sideways markets. Buys extreme oversold readings where price has also touched the lower Bollinger Band, expecting a snap-back to the mean.',
    buyCondition: 'RSI(14) < 30 (oversold)  AND  Close ≤ Lower Bollinger Band (20-period, 2σ)',
    sellCondition: 'RSI(14) > 70 (overbought)  AND  Close ≥ Upper Bollinger Band (20-period, 2σ)',
    formulas: [
      'RSI = 100 − 100 / (1 + RS),   RS = AvgGain(14) / AvgLoss(14)',
      'Middle Band = SMA(close, 20)',
      'Upper Band  = Middle + 2 × StdDev(close, 20)',
      'Lower Band  = Middle − 2 × StdDev(close, 20)',
      'Buy:  RSI < 30  AND  close ≤ LowerBand',
      'Sell: RSI > 70  AND  close ≥ UpperBand  (SELL takes priority if both fire simultaneously)',
    ],
    parameters: { 'RSI period': '14', 'RSI oversold': '30', 'RSI overbought': '70', 'BB window': '20', 'BB std dev': '2.0' },
    note: 'Destructs in sustained trends. Best combined with a regime filter to disable in trending markets.',
  },
  'MACD + ADX': {
    description: 'Momentum strategy that triggers on MACD crossovers only when ADX confirms a strong underlying trend (>25), filtering out weak signals in choppy, low-momentum markets.',
    buyCondition: 'MACD line crosses above Signal line  AND  ADX(14) > 25',
    sellCondition: 'MACD line crosses below Signal line  AND  ADX(14) > 25',
    formulas: [
      'MACD line    = EMA(12) − EMA(26)',
      'Signal line  = EMA(9) of MACD line',
      'Histogram    = MACD − Signal',
      'ADX = 100 × EMA(|+DM − (−DM)| / (TR)) over 14 periods',
      'Buy:  MACD[t−1] ≤ Signal[t−1]  AND  MACD[t] > Signal[t]  AND  ADX > 25',
      'Sell: MACD[t−1] ≥ Signal[t−1]  AND  MACD[t] < Signal[t]  AND  ADX > 25',
    ],
    parameters: { 'MACD fast': '12', 'MACD slow': '26', 'MACD signal': '9', 'ADX window': '14', 'ADX threshold': '25' },
    note: 'The ADX filter means signals are skipped in ranging markets. Tradeoff: misses early trend entries while ADX is still building.',
  },
  'Buy & Hold': {
    description: 'Passive benchmark strategy. Buys on the first day and holds until the last day with no active decisions. Represents what an investor earns by simply holding the asset.',
    buyCondition: 'Day 1 open price — always buys immediately',
    sellCondition: 'Final day close price — forced close at end of period',
    formulas: [
      'Return = (P_end − P_start) / P_start',
      'No intermediate trading decisions are made',
    ],
    parameters: { 'Hold period': 'Full backtest range' },
    note: 'Use this as the baseline. Any active strategy should outperform Buy & Hold on a risk-adjusted basis to justify complexity.',
  },
  'MA Crossover': {
    description: 'Classic dual moving-average crossover. Buys when the fast SMA crosses above the slow SMA, signalling upward momentum, and sells when it crosses back below.',
    buyCondition: 'SMA(fast) crosses above SMA(slow)',
    sellCondition: 'SMA(fast) crosses below SMA(slow)',
    formulas: [
      'SMA(n) = (1/n) × Σ Close[t−n+1 … t]',
      'Buy:  SMA_fast[t−1] ≤ SMA_slow[t−1]  AND  SMA_fast[t] > SMA_slow[t]',
      'Sell: SMA_fast[t−1] ≥ SMA_slow[t−1]  AND  SMA_fast[t] < SMA_slow[t]',
    ],
    parameters: { 'Fast SMA': '50', 'Slow SMA': '200' },
    note: 'Simpler and more reactive than the EMA Crossover. No volume filter means more false signals in noisy conditions.',
  },
  'ML Signal': {
    description: 'Random Forest classifier trained on 40+ engineered features (EMAs, RSI, MACD, volume ratios, Bollinger position, etc.). Predicts next-day direction using a 70/15/15 train/val/test split.',
    buyCondition: 'Predicted probability of UP > 0.55',
    sellCondition: 'Predicted probability of DOWN < 0.45  (i.e., prob_UP < 0.45)',
    formulas: [
      'Features: EMA(10/20/50/100/200), RSI(14), MACD, BB position, volume ratios, price momentum',
      'Model: RandomForestClassifier(n_estimators=200, max_depth=6)',
      'Label: Close[t+1] > Close[t] → 1 (UP),  else 0 (DOWN)',
      'Buy:  P(UP|features) > 0.55',
      'Sell: P(UP|features) < 0.45',
    ],
    parameters: { 'Trees': '200', 'Max depth': '6', 'Buy threshold': '0.55', 'Sell threshold': '0.45' },
    note: 'Requires sufficient training data (~2 years). Performance degrades in market regimes unseen during training.',
  },
  'LSTM Multi-Signal': {
    description: 'LSTM neural network with 15 technical features. Uses a sliding 20-day window to capture temporal dependencies and predict next-day direction via sigmoid output.',
    buyCondition: 'Sigmoid output probability > 0.55',
    sellCondition: 'Sigmoid output probability < 0.45',
    formulas: [
      'Architecture: LSTM(64) → Dropout(0.2) → LSTM(32) → Dense(1, sigmoid)',
      'Features (15): EMA(10/20/50/100/200), RSI(14), MACD, MACD signal, BB position, ADX, Δclose%, Δvol%, ROC(5), ROC(10), StochRSI(14)',
      'Sequence length: 20 days',
      'Training: 70% train / 15% val / 15% test, EarlyStopping(patience=10)',
      'Buy:  P(t) > 0.55    Sell: P(t) < 0.45    Hold otherwise',
    ],
    parameters: { 'LSTM units': '64/32', 'Dropout': '0.2', 'Sequence length': '20', 'Epochs': 'up to 50' },
    note: 'Most compute-intensive strategy. Requires TensorFlow. Performance varies significantly by training regime.',
  },
}

// ── Chart component ───────────────────────────────────────────────────────────

const CW = 860, CH = 220, PAD = { l: 58, r: 18, t: 14, b: 30 }
const iW = CW - PAD.l - PAD.r
const iH = CH - PAD.t - PAD.b

interface TradeRecord { date: string; action: string; price: number }

function BuySellMarker({ x, y, dir, color }: { x: number; y: number; dir: 'up' | 'down'; color: string }) {
  const s = 6
  const pts = dir === 'up'
    ? `${x},${y - 8} ${x - s},${y} ${x + s},${y}`
    : `${x},${y + 8} ${x - s},${y} ${x + s},${y}`
  return <polygon points={pts} fill={color} opacity={0.9} />
}

function PriceChart({
  prices, dates, strategies, stratResults, visible, regimeLabels,
}: {
  prices: number[]
  dates: string[]
  strategies: string[]
  stratResults: Record<string, StrategyResult>
  visible: Record<string, boolean>
  regimeLabels: string[]
}) {
  const n = prices.length
  if (n < 2) return null

  const minP = Math.min(...prices)
  const maxP = Math.max(...prices)
  const range = maxP - minP || 1
  const xOf = (i: number) => PAD.l + (i / (n - 1)) * iW
  const yOf = (p: number) => PAD.t + iH - ((p - minP) / range) * iH

  const dateIdx = useMemo(
    () => new Map(dates.map((d, i) => [d, i])),
    [dates]
  )

  const pricePath = prices.map((p, i) =>
    `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)} ${yOf(p).toFixed(1)}`
  ).join(' ')

  const yTicks = Array.from({ length: 5 }, (_, i) => ({
    p: minP + range * i / 4,
    y: PAD.t + iH - (i / 4) * iH,
  }))

  const xStep = Math.floor(n / 4)
  const xTicks = [0, xStep, xStep * 2, xStep * 3, n - 1].map(i => ({
    label: dates[i]?.slice(0, 7) ?? '',
    x: xOf(i),
  }))

  const regimeBands = useMemo(() => {
    const bands: { x1: number; x2: number }[] = []
    let start = 0
    const rn = Math.min(regimeLabels.length, n)
    for (let i = 1; i <= rn; i++) {
      if (i === rn || regimeLabels[i] !== regimeLabels[start]) {
        if (regimeLabels[start] === 'volatile') {
          bands.push({ x1: xOf(start), x2: xOf(Math.min(i, n - 1)) })
        }
        start = i
      }
    }
    return bands
  }, [regimeLabels, n])

  return (
    <svg viewBox={`0 0 ${CW} ${CH}`} style={{ width: '100%', display: 'block' }}>
      {/* Grid + y-axis */}
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={PAD.l} x2={CW - PAD.r} y1={t.y} y2={t.y}
            stroke="var(--border)" strokeWidth={0.5} strokeDasharray="2 4" />
          <text x={PAD.l - 6} y={t.y + 4} fontSize={9.5} fill="var(--text-subtle)"
            textAnchor="end" fontFamily="var(--mono)">{t.p.toFixed(0)}</text>
        </g>
      ))}

      {/* X-axis labels */}
      {xTicks.map((t, i) => (
        <text key={i} x={t.x} y={CH - 6} fontSize={9} fill="var(--text-subtle)"
          textAnchor="middle" fontFamily="var(--mono)">{t.label}</text>
      ))}

      {/* Volatile regime bands */}
      {regimeBands.map((b, i) => (
        <rect key={i} x={b.x1} y={PAD.t} width={b.x2 - b.x1} height={iH}
          fill="var(--down)" opacity={0.04} />
      ))}

      {/* Price line */}
      <path d={pricePath} fill="none" stroke="var(--text-subtle)" strokeWidth={1.5}
        strokeLinecap="round" strokeLinejoin="round" />

      {/* Buy/sell markers per strategy */}
      {strategies.map((name, si) => {
        if (!visible[name]) return null
        const trades = (stratResults[name]?.trades ?? []) as unknown as TradeRecord[]
        return trades.map((tr, ti) => {
          const idx = dateIdx.get(tr.date)
          if (idx === undefined) return null
          const x = xOf(idx)
          const y = yOf(tr.price)
          return (
            <BuySellMarker key={`${si}-${ti}`}
              x={x} y={y}
              dir={tr.action === 'BUY' ? 'up' : 'down'}
              color={stratColor(si)} />
          )
        })
      })}
    </svg>
  )
}

// ── Strategy logic accordion ─────────────────────────────────────────────────

function StrategyLogicCard({ name, avgReturn, def }: { name: string; avgReturn: number | null; def: StratDef }) {
  const [open, setOpen] = useState(false)
  const color = Object.keys(STRATEGY_DEFS).indexOf(name)
  const c = stratColor(Math.max(0, color))

  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text)', textAlign: 'left',
        }}
      >
        <span style={{ width: 10, height: 10, borderRadius: 2, background: c, flexShrink: 0 }} />
        <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{name}</span>
        {avgReturn !== null && (
          <span style={{ fontSize: 12, color: avgReturn >= 0 ? 'var(--up)' : 'var(--down)', fontFamily: 'var(--mono)' }}>
            avg {fmt.pct(avgReturn)}
          </span>
        )}
        <span style={{ fontSize: 11, color: 'var(--text-subtle)', marginLeft: 8 }}>
          {open ? '▲ hide' : '▼ click to know more'}
        </span>
      </button>

      {open && (
        <div style={{ padding: '0 20px 20px', borderTop: '1px solid var(--border)' }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '16px 0 20px', lineHeight: 1.6 }}>
            {def.description}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div style={{
              padding: '12px 14px', borderRadius: 8,
              background: 'rgba(10,138,62,0.06)', border: '1px solid rgba(10,138,62,0.15)',
            }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--up)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                ▲ Buy condition
              </div>
              <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>{def.buyCondition}</div>
            </div>
            <div style={{
              padding: '12px 14px', borderRadius: 8,
              background: 'rgba(192,56,59,0.06)', border: '1px solid rgba(192,56,59,0.15)',
            }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--down)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                ▼ Sell condition
              </div>
              <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>{def.sellCondition}</div>
            </div>
          </div>

          <div style={{
            padding: '12px 14px', borderRadius: 8, marginBottom: 14,
            background: 'var(--bg-subtle)', border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Mathematical formulas
            </div>
            {def.formulas.map((f, i) => (
              <div key={i} style={{ fontSize: 11.5, fontFamily: 'var(--mono)', color: 'var(--text-muted)', lineHeight: 2.1 }}>{f}</div>
            ))}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {Object.entries(def.parameters).map(([k, v]) => (
              <span key={k} style={{
                padding: '3px 10px', borderRadius: 5, fontSize: 11,
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                color: 'var(--text-muted)',
              }}>
                <span style={{ color: 'var(--text-subtle)' }}>{k}: </span>{v}
              </span>
            ))}
          </div>

          <div style={{
            fontSize: 12, color: 'var(--text-subtle)', fontStyle: 'italic',
            padding: '8px 12px', borderLeft: '2px solid var(--border)',
          }}>
            {def.note}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Per-ticker card ───────────────────────────────────────────────────────────

function TickerCard({
  ticker, stratResults, strategies, priceData, regimeLabels,
}: {
  ticker: string
  stratResults: Record<string, StrategyResult>
  strategies: string[]
  priceData: { series: number[]; dates: string[] } | undefined
  regimeLabels: string[]
}) {
  const [visible, setVisible] = useState<Record<string, boolean>>(
    () => Object.fromEntries(strategies.map(s => [s, true]))
  )
  const [showMetrics, setShowMetrics] = useState(false)

  const bestStrat = useMemo(() => {
    let best = '', bestRet = -Infinity
    for (const [name, r] of Object.entries(stratResults)) {
      const ret = r.metrics.total_return ?? -Infinity
      if (ret > bestRet) { bestRet = ret; best = name }
    }
    return best
  }, [stratResults])

  const bestRet = stratResults[bestStrat]?.metrics.total_return ?? null

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      {/* Card header */}
      <div className="card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 16 }}>{ticker}</span>
          {bestStrat && (
            <span style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 4,
              background: 'var(--up-soft)', color: 'var(--up)',
            }}>
              Best: {bestStrat} ({fmt.pct(bestRet)})
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn"
            style={{ fontSize: 11, padding: '4px 12px' }}
            onClick={() => setShowMetrics(v => !v)}
          >
            {showMetrics ? 'Hide metrics' : 'Show metrics'}
          </button>
        </div>
      </div>

      {/* Strategy toggles */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 20px 0' }}>
        {strategies.map((name, i) => (
          <button key={name}
            onClick={() => setVisible(v => ({ ...v, [name]: !v[name] }))}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '3px 9px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
              border: `1px solid ${visible[name] ? stratColor(i) : 'var(--border)'}`,
              background: visible[name] ? `${stratColor(i)}15` : 'var(--bg-subtle)',
              color: visible[name] ? stratColor(i) : 'var(--text-subtle)',
            }}>
            <span style={{ width: 6, height: 6, borderRadius: 1, background: visible[name] ? stratColor(i) : 'var(--border)' }} />
            {name}
          </button>
        ))}
        <span style={{ fontSize: 11, color: 'var(--text-subtle)', alignSelf: 'center', marginLeft: 4 }}>
          ▲ buy  ▼ sell
        </span>
      </div>

      {/* Price chart */}
      <div style={{ padding: '8px 20px 4px' }}>
        {priceData && priceData.series.length > 1 ? (
          <PriceChart
            prices={priceData.series}
            dates={priceData.dates}
            strategies={strategies}
            stratResults={stratResults}
            visible={visible}
            regimeLabels={regimeLabels}
          />
        ) : (
          <div style={{ height: CH, display: 'grid', placeItems: 'center', color: 'var(--text-subtle)', fontSize: 12 }}>
            Run a backtest to see price chart
          </div>
        )}
      </div>

      {/* Metrics table (collapsible) */}
      {showMetrics && (
        <div style={{ padding: '0 0 4px', borderTop: '1px solid var(--border)', marginTop: 8 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Strategy</th>
                <th className="right">Return</th>
                <th className="right">CAGR</th>
                <th className="right">Sharpe</th>
                <th className="right">Max DD</th>
                <th className="right">Win rate</th>
                <th className="right">Trades</th>
              </tr>
            </thead>
            <tbody>
              {strategies.map((name, i) => {
                const m = stratResults[name]?.metrics
                if (!m) return null
                const ret = m.total_return ?? 0
                return (
                  <tr key={name}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: stratColor(i), flexShrink: 0 }} />
                        <span style={{ fontWeight: 500 }}>{name}</span>
                      </div>
                    </td>
                    <td className="num" style={{ color: ret >= 0 ? 'var(--up)' : 'var(--down)', fontWeight: 600 }}>
                      {fmt.pct(ret)}
                    </td>
                    <td className="num">{fmt.pct(m.cagr)}</td>
                    <td className="num">{m.sharpe_ratio?.toFixed(2) ?? '—'}</td>
                    <td className="num" style={{ color: 'var(--down)' }}>{fmt.pct(m.max_drawdown, false)}</td>
                    <td className="num">{fmt.pctSimple(m.win_rate)}</td>
                    <td className="num">{m.n_trades ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export default function TabComparison({ data, theme: _theme = 'light' }: {
  data: BacktestResponse
  theme?: string
}) {
  const { batch_results, price_data, regime_labels } = data
  const perTicker = Object.fromEntries(
    Object.entries(batch_results).filter(([k]) => k !== 'PAIRS')
  )
  const tickers   = Object.keys(perTicker)
  const allStrats = useMemo(() => {
    const s = new Set<string>()
    for (const t of tickers) Object.keys(perTicker[t] ?? {}).forEach(n => s.add(n))
    return Array.from(s)
  }, [tickers])

  // Summary: best strategy per ticker
  const summary = useMemo(() => tickers.map(ticker => {
    const results = perTicker[ticker] ?? {}
    let best = '', bestRet = -Infinity
    const row: Record<string, number | null> = {}
    for (const [name, r] of Object.entries(results)) {
      const ret = r.metrics.total_return ?? -Infinity
      row[name] = r.metrics.total_return
      if (ret > bestRet) { bestRet = ret; best = name }
    }
    return { ticker, row, best, bestRet }
  }), [tickers])

  // Avg return per strategy across all tickers
  const stratAvgReturn = useMemo(() => {
    const out: Record<string, number | null> = {}
    for (const name of allStrats) {
      const vals = tickers
        .map(t => perTicker[t]?.[name]?.metrics.total_return)
        .filter((v): v is number => v !== null && v !== undefined)
      out[name] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
    }
    return out
  }, [allStrats, tickers])

  return (
    <div className="page-fade">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Strategy comparison & backtesting</h1>
          <p className="page-subtitle">
            Historical price charts with entry/exit markers — one chart per ticker.
            Volatile regime windows shaded. ▲ buy  ▼ sell.
          </p>
        </div>
      </div>

      {/* Cross-ticker summary table */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <h3 className="card-title">Returns summary — all tickers × all strategies</h3>
          <span className="tag">{tickers.length} tickers · {allStrats.length} strategies</span>
        </div>
        <div className="card-body flush">
          <table className="tbl">
            <thead>
              <tr>
                <th>Ticker</th>
                {allStrats.map((s, i) => (
                  <th key={s} className="right">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                      <span style={{ width: 7, height: 7, borderRadius: 1, background: stratColor(i), flexShrink: 0 }} />
                      {s.length > 16 ? s.slice(0, 14) + '…' : s}
                    </span>
                  </th>
                ))}
                <th className="right">Best strategy</th>
              </tr>
            </thead>
            <tbody>
              {summary.map(({ ticker, row, best, bestRet }) => (
                <tr key={ticker}>
                  <td><span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{ticker}</span></td>
                  {allStrats.map(s => {
                    const ret = row[s] ?? null
                    return (
                      <td key={s} className="num" style={{
                        color: ret === null ? 'var(--text-subtle)' : ret >= 0 ? 'var(--up)' : 'var(--down)',
                        fontWeight: s === best ? 700 : 400,
                        background: s === best ? 'var(--up-soft)' : undefined,
                      }}>
                        {ret !== null ? fmt.pct(ret) : '—'}
                      </td>
                    )
                  })}
                  <td className="num">
                    <span style={{ fontSize: 11, color: 'var(--up)', fontWeight: 600 }}>
                      {best} ({fmt.pct(bestRet)})
                    </span>
                  </td>
                </tr>
              ))}
              {/* Average row */}
              <tr style={{ borderTop: '1px solid var(--border)', fontWeight: 600 }}>
                <td style={{ color: 'var(--text-subtle)', fontSize: 11, textTransform: 'uppercase' }}>Avg</td>
                {allStrats.map(s => {
                  const avg = stratAvgReturn[s]
                  return (
                    <td key={s} className="num" style={{ color: avg === null ? 'var(--text-subtle)' : avg >= 0 ? 'var(--up)' : 'var(--down)' }}>
                      {avg !== null ? fmt.pct(avg) : '—'}
                    </td>
                  )
                })}
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-ticker charts */}
      {tickers.map(ticker => (
        <TickerCard
          key={ticker}
          ticker={ticker}
          stratResults={perTicker[ticker] ?? {}}
          strategies={Object.keys(perTicker[ticker] ?? {})}
          priceData={price_data?.[ticker]}
          regimeLabels={regime_labels}
        />
      ))}

      {/* Strategy logic reference */}
      <div style={{ marginTop: 32 }}>
        <div className="page-header" style={{ marginBottom: 12 }}>
          <div>
            <h2 style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 22, margin: 0 }}>
              Strategy logic reference
            </h2>
            <p className="page-subtitle">Click any strategy to expand the model logic, buy/sell conditions, and mathematical formulas.</p>
          </div>
        </div>
        {allStrats.map(name => (
          <StrategyLogicCard
            key={name}
            name={name}
            avgReturn={stratAvgReturn[name] ?? null}
            def={STRATEGY_DEFS[name] ?? {
              description: `${name} — custom strategy.`,
              buyCondition: 'See strategy source code',
              sellCondition: 'See strategy source code',
              formulas: [],
              parameters: {},
              note: '',
            }}
          />
        ))}
      </div>
    </div>
  )
}
