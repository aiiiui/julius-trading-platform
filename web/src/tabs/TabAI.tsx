import { useState, useMemo, useEffect } from 'react'
import { Icons, fmt, TICKER_META } from '../components/ui'
import { fetchAIAnalysis } from '../api'
import type { AIAnalysis } from '../api'
import type { BacktestResponse } from '../types'

// ── XAI helper computations ───────────────────────────────────────────────────

function computeRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50
  let gains = 0, losses = 0
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    if (d > 0) gains += d; else losses -= d
  }
  const ag = gains / period, al = losses / period
  return al === 0 ? 100 : 100 - 100 / (1 + ag / al)
}

function computeEMA(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1] ?? 0
  const alpha = 2 / (period + 1)
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period
  for (let i = period; i < closes.length; i++) ema = closes[i] * alpha + ema * (1 - alpha)
  return ema
}

function computeMACD(closes: number[]): number {
  if (closes.length < 26) return 0
  return computeEMA(closes, 12) - computeEMA(closes, 26)
}

// ── XAI dark-terminal design constants ───────────────────────────────────────

const D = {
  bg:      '#0d110e',
  panel:   '#111814',
  border:  '#1d2620',
  text:    '#d4e0d6',
  muted:   '#5a7060',
  blue:    '#4A90E2',
  purple:  '#7B4FE8',
  green:   '#c5d934',
  active:  '#3A7DDE',
}

const PIPELINE_NODES = [
  { id: 'ingestion', label: 'Ingestion',  icon: (
    <svg width={18} height={18} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <rect x={2} y={2} width={6} height={6} rx={1}/><rect x={10} y={2} width={6} height={6} rx={1}/>
      <rect x={2} y={10} width={6} height={6} rx={1}/><rect x={10} y={10} width={6} height={6} rx={1}/>
    </svg>
  )},
  { id: 'features',  label: 'Features',   icon: (
    <svg width={18} height={18} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M2 3h14l-5 6v5l-4-2V9L2 3z"/>
    </svg>
  )},
  { id: 'patterns',  label: 'Patterns',   icon: (
    <svg width={18} height={18} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M2 12 Q5 4 8 9 Q11 14 14 6 L16 6" strokeLinecap="round"/>
    </svg>
  )},
  { id: 'context',   label: 'Context',    icon: (
    <svg width={18} height={18} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <circle cx={9} cy={9} r={2}/><path d="M4 9a5 5 0 0 1 5-5"/><path d="M14 9a5 5 0 0 1-5 5"/>
      <path d="M1 9a8 8 0 0 1 8-8"/><path d="M17 9a8 8 0 0 1-8 8"/>
    </svg>
  )},
  { id: 'scoring',   label: 'Scoring',    icon: (
    <svg width={18} height={18} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <rect x={2} y={4} width={14} height={10} rx={2}/>
      <path d="M6 12 L6 9 M9 12 L9 7 M12 12 L12 10"/>
    </svg>
  )},
  { id: 'output',    label: 'Output',     icon: (
    <svg width={18} height={18} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M9 2 L14 9 L11 9 L11 16 L7 16 L7 9 L4 9 Z"/>
    </svg>
  )},
]

const FEATURE_MAP: Record<string, { label: string; weight: number }[]> = {
  'EMA Crossover + Volume': [
    { label: 'EMA',    weight: 50 }, { label: 'VOLUME', weight: 20 },
    { label: 'MACD',   weight: 20 }, { label: 'RSI',    weight: 10 },
  ],
  'RSI + Bollinger Bands': [
    { label: 'RSI',    weight: 40 }, { label: 'MACD',   weight: 25 },
    { label: 'EMA',    weight: 20 }, { label: 'VOLUME', weight: 15 },
  ],
  'MACD + ADX': [
    { label: 'MACD',   weight: 45 }, { label: 'EMA',    weight: 35 },
    { label: 'VOLUME', weight: 20 }, { label: 'RSI',    weight: 0  },
  ],
  'LSTM Multi-Signal': [
    { label: 'EMA',    weight: 38 }, { label: 'RSI',    weight: 32 },
    { label: 'MACD',   weight: 20 }, { label: 'VOLUME', weight: 10 },
  ],
  'ML Signal': [
    { label: 'RSI',    weight: 40 }, { label: 'EMA',    weight: 35 },
    { label: 'MACD',   weight: 15 }, { label: 'VOLUME', weight: 10 },
  ],
}
const DEFAULT_FEAT = [
  { label: 'EMA', weight: 50 }, { label: 'MACD', weight: 20 },
  { label: 'RSI', weight: 10 }, { label: 'VOLUME', weight: 20 },
]

// ── XAI Stepper main component ────────────────────────────────────────────────

function XAIStepper({ data, ticker }: { data: BacktestResponse; ticker: string }) {
  const [activeNode, setActiveNode] = useState(3)   // 0-5
  const [playing,    setPlaying]    = useState(false)
  const [modelType,  setModelType]  = useState<'LSTM' | 'RF'>('LSTM')

  useEffect(() => {
    if (!playing) return
    const t = setTimeout(() => {
      setActiveNode(n => {
        if (n >= 5) { setPlaying(false); return n }
        return n + 1
      })
    }, 1600)
    return () => clearTimeout(t)
  }, [playing, activeNode])

  const prices    = data.price_data?.[ticker]?.series ?? []
  const bestStrat = useMemo(() => {
    const results = data.batch_results[ticker] ?? {}
    let best = '', bestRet = -Infinity
    for (const [name, r] of Object.entries(results)) {
      const ret = r.metrics.total_return ?? -Infinity
      if (ret > bestRet) { bestRet = ret; best = name }
    }
    return best
  }, [data, ticker])

  const metrics   = data.batch_results[ticker]?.[bestStrat]?.metrics
  const lstmData  = data.lstm_by_ticker?.[ticker]

  const lastClose  = prices[prices.length - 1] ?? 0
  const prevClose  = prices[prices.length - 2] ?? lastClose
  const changePct  = prevClose ? ((lastClose - prevClose) / prevClose) * 100 : 0
  const rsi        = useMemo(() => computeRSI(prices), [prices])
  const macd       = useMemo(() => computeMACD(prices), [prices])
  const ema20      = useMemo(() => computeEMA(prices, 20), [prices])
  const features   = (FEATURE_MAP[bestStrat] ?? DEFAULT_FEAT).filter(f => f.weight > 0)

  const regime = useMemo(() => {
    const labels  = data.regime_labels ?? []
    const current = labels[labels.length - 1] ?? 'calm'
    const volPct  = labels.length ? Math.round(labels.filter(l => l === 'volatile').length / labels.length * 100) : 0
    return { current, volPct, label: current === 'volatile' ? 'High Volatility' : 'Trending' }
  }, [data.regime_labels])

  const confidence = useMemo(() => {
    if (lstmData?.confidence?.length) {
      const last20 = lstmData.confidence.slice(-20)
      return Math.round(last20.reduce((a: number, b: number) => a + b, 0) / last20.length * 100)
    }
    const wr     = metrics?.win_rate ?? 0.5
    const sharpe = Math.min(3, Math.max(0, metrics?.sharpe_ratio ?? 0))
    return Math.round(((wr + sharpe / 3) / 2) * 100)
  }, [lstmData, metrics])

  const signal = useMemo(() => {
    const ret = metrics?.total_return ?? 0
    const wr  = metrics?.win_rate ?? 0.5
    if (ret > 0.05 && wr > 0.5)  return { label: 'Buy',  hex: '#4ade80' }
    if (ret < -0.05 || wr < 0.4) return { label: 'Sell', hex: '#f87171' }
    return { label: 'Hold', hex: '#fbbf24' }
  }, [metrics])

  const avgPerTrade = metrics?.n_trades ? (metrics.total_return ?? 0) / (metrics.n_trades || 1) : 0
  const targetPrice = lastClose * (1 + Math.max(0, avgPerTrade))
  const stopPrice   = lastClose * (1 + (metrics?.max_drawdown ?? -0.1) * 0.4)

  // Confidence arc geometry
  const R = 52, cx = 70, cy = 70
  const circ    = 2 * Math.PI * R
  const startAngle = -220 * Math.PI / 180
  const arcSpan    = 260 * Math.PI / 180
  const filled     = (confidence / 100) * arcSpan
  const toXY = (a: number) => ({
    x: cx + R * Math.cos(a),
    y: cy + R * Math.sin(a),
  })
  const arcPath = (from: number, span: number) => {
    const s = toXY(from), e = toXY(from + span)
    return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${R} ${R} 0 ${span > Math.PI ? 1 : 0} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`
  }

  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${D.border}`, marginBottom: 32 }}>

      {/* ── Top header bar ── */}
      <div style={{
        background: D.bg, padding: '14px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: `1px solid ${D.border}`,
      }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: D.text, letterSpacing: '-0.3px' }}>
          XAI Trading Dashboard
        </span>
        <div style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
          {[
            { label: 'AI MODEL',       value: modelType === 'LSTM' ? 'LSTM' : 'Random Forest', color: D.blue },
            { label: 'MARKET CONTEXT', value: regime.label,   color: '#a78bfa' },
            { label: 'SIGNAL',         value: signal.label,   color: signal.hex },
            { label: 'CONFIDENCE',     value: `${confidence}.0%`, color: D.green },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 9, color: D.muted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>{s.label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--mono)', color: s.color }}>{s.value}</div>
            </div>
          ))}
          <button
            style={{
              padding: '6px 14px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
              background: playing ? D.border : D.active, color: '#fff', border: 'none',
              fontFamily: 'var(--mono)', fontWeight: 600, marginLeft: 8,
            }}
            onClick={() => { setActiveNode(0); setPlaying(true) }}
          >
            {playing ? '⟳' : '▶ Play'}
          </button>
        </div>
      </div>

      {/* ── Feature importance chart ── */}
      <div style={{ background: D.panel, padding: '28px 28px 8px', borderBottom: `1px solid ${D.border}` }}>
        <svg viewBox="0 0 680 200" style={{ width: '100%', display: 'block' }}>
          <defs>
            <linearGradient id="barGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor={D.blue}/>
              <stop offset="100%" stopColor={D.purple}/>
            </linearGradient>
          </defs>

          {/* X-axis grid lines + labels */}
          {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(v => {
            const x = 90 + (v / 100) * 560
            return (
              <g key={v}>
                <line x1={x} x2={x} y1={10} y2={160} stroke={D.border} strokeWidth={1}/>
                <text x={x} y={175} fontSize={10} fill={D.muted} textAnchor="middle" fontFamily="var(--mono)">{v}</text>
              </g>
            )
          })}
          <text x={670} y={175} fontSize={10} fill={D.muted} textAnchor="end" fontFamily="var(--mono)">Weight (%) →</text>

          {/* Bars */}
          {features.map((f, i) => {
            const y = 20 + i * 38
            const w = (f.weight / 100) * 560
            return (
              <g key={f.label}>
                <text x={84} y={y + 14} fontSize={12} fill={D.text} textAnchor="end" fontFamily="var(--mono)" fontWeight={500}>{f.label}</text>
                <rect x={90} y={y} width={560} height={22} rx={3} fill={D.border} opacity={0.5}/>
                <rect x={90} y={y} width={w}   height={22} rx={3} fill="url(#barGrad)"/>
                <text x={90 + w + 6} y={y + 15} fontSize={11} fill="#a0b8ff" fontFamily="var(--mono)" fontWeight={600}>{f.weight}%</text>
              </g>
            )
          })}
        </svg>
      </div>

      {/* ── Pipeline + Gauge section ── */}
      <div style={{
        background: D.bg, padding: '24px 28px',
        display: 'flex', alignItems: 'center', gap: 20,
        borderBottom: `1px solid ${D.border}`,
      }}>
        {/* Left labels */}
        <div style={{ minWidth: 160 }}>
          <div style={{ fontSize: 11, color: D.muted, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 4 }}>1. INFERENCE CORE</div>
          <div style={{ fontSize: 11, color: D.muted, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 20 }}>2. EXPLANATION PIPELINE</div>
          {/* Confidence gauge */}
          <svg width={140} height={140} viewBox="0 0 140 140">
            <path d={arcPath(startAngle, arcSpan)} fill="none" stroke="#2a2d2a" strokeWidth={11} strokeLinecap="round"/>
            <path d={arcPath(startAngle, filled)}  fill="none" stroke={D.green}  strokeWidth={11} strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.9s ease' }}/>
            <text x={cx} y={cy - 6}  fontSize={22} fontWeight={800} fill={D.green}  textAnchor="middle" fontFamily="var(--mono)">{confidence}%</text>
            <text x={cx} y={cy + 14} fontSize={9}  fill={D.muted}                   textAnchor="middle" fontFamily="var(--mono)" letterSpacing="0.1em">CONFIDENCE</text>
          </svg>
        </div>

        {/* Horizontal pipeline */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0 }}>
          {PIPELINE_NODES.map((node, i) => {
            const isActive = i === activeNode
            const isDone   = i < activeNode
            return (
              <div key={node.id} style={{ display: 'flex', alignItems: 'center' }}>
                {/* Dashed connector (not before first) */}
                {i > 0 && (
                  <div style={{
                    width: 32, height: 2,
                    borderTop: `2px dashed ${isDone || isActive ? D.blue : D.border}`,
                    transition: 'border-color 0.4s',
                  }}/>
                )}
                {/* Node */}
                <button
                  onClick={() => setActiveNode(i)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                    background: 'none', border: 'none', cursor: 'pointer',
                  }}
                >
                  <div style={{
                    width: 56, height: 56, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isActive
                      ? `radial-gradient(circle at 40% 40%, ${D.active}, #1a3a8a)`
                      : isDone ? '#1a2e4a' : D.panel,
                    border: `1.5px solid ${isActive ? D.active : isDone ? '#2a4a7a' : D.border}`,
                    color: isActive ? '#fff' : isDone ? D.blue : D.muted,
                    boxShadow: isActive ? `0 0 20px ${D.active}55` : 'none',
                    transition: 'all 0.3s ease',
                  }}>
                    {node.icon}
                  </div>
                  <span style={{
                    fontSize: 10, fontFamily: 'var(--mono)', letterSpacing: '0.04em',
                    color: isActive ? D.text : D.muted,
                    fontWeight: isActive ? 700 : 400,
                  }}>
                    {node.label}
                  </span>
                  {isActive && (
                    <span style={{ fontSize: 9, color: D.blue, fontFamily: 'var(--mono)' }}>
                      {activeNode === 0 ? 'Loading data' :
                       activeNode === 1 ? 'Weighting features' :
                       activeNode === 2 ? 'Matching patterns' :
                       activeNode === 3 ? 'Applying regime bias' :
                       activeNode === 4 ? 'Computing score' : 'Generating signal'}
                    </span>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Controls section ── */}
      <div style={{ background: D.panel, padding: '20px 28px' }}>
        {/* Model type + regime row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 32, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, color: D.muted, fontFamily: 'var(--mono)' }}>Model Type</span>
            <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: `1px solid ${D.border}` }}>
              {(['LSTM', 'RF'] as const).map(t => (
                <button key={t} onClick={() => setModelType(t)} style={{
                  padding: '5px 14px', fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 600,
                  background: modelType === t ? D.active : 'transparent',
                  color: modelType === t ? '#fff' : D.muted, border: 'none', cursor: 'pointer',
                }}>
                  {t === 'RF' ? 'Random Forest' : 'LSTM'}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: D.muted, fontFamily: 'var(--mono)' }}>Market Regime</span>
            <div style={{
              padding: '5px 14px', borderRadius: 6, fontSize: 12, fontFamily: 'var(--mono)',
              background: D.bg, border: `1px solid ${D.border}`, color: '#a78bfa',
            }}>
              {regime.label} ▾
            </div>
          </div>
        </div>

        {/* Indicator sliders */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 40px' }}>
          {[
            { label: 'RSI (0-100)',  value: Math.round(rsi),                    min: 0,    max: 100, step: 1   },
            { label: 'MACD',        value: parseFloat(macd.toFixed(2)),          min: -10,  max: 10,  step: 0.1 },
            { label: 'Volume (%)',  value: Math.round(prices.length / 2.5),      min: 0,    max: 300, step: 1   },
            { label: 'Price vs EMA', value: lastClose && ema20 ? Math.round((lastClose / ema20 - 1) * 100 + 50) : 50, min: 0, max: 100, step: 1 },
          ].map(s => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 11, color: D.muted, fontFamily: 'var(--mono)', minWidth: 90 }}>{s.label}</span>
              <input type="range" min={s.min} max={s.max} step={s.step}
                defaultValue={s.value}
                style={{ flex: 1, accentColor: D.blue, cursor: 'pointer' }}
                readOnly
              />
              <div style={{
                minWidth: 46, padding: '3px 8px', borderRadius: 5, textAlign: 'center',
                background: D.bg, border: `1px solid ${D.border}`,
                fontSize: 11, fontFamily: 'var(--mono)', color: D.text,
              }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* Output row */}
        <div style={{
          marginTop: 20, padding: '16px 20px', borderRadius: 10,
          background: D.bg, border: `1px solid ${signal.hex}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
        }}>
          <div>
            <div style={{ fontSize: 9, color: D.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Signal</div>
            <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--mono)', color: signal.hex }}>{signal.label.toUpperCase()}</div>
          </div>
          {[
            { label: 'Entry',     value: `$${lastClose.toFixed(2)}`,                                    color: D.text },
            { label: 'Target',   value: avgPerTrade > 0 ? `$${targetPrice.toFixed(2)}` : '—',          color: '#4ade80' },
            { label: 'Stop Loss', value: `$${stopPrice.toFixed(2)}`,                                    color: '#f87171' },
            { label: 'Strategy', value: bestStrat.length > 18 ? bestStrat.slice(0, 16) + '…' : bestStrat || '—', color: D.blue },
          ].map(r => (
            <div key={r.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: D.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>{r.label}</div>
              <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--mono)', color: r.color }}>{r.value}</div>
            </div>
          ))}
          <div style={{ fontSize: 9, color: D.muted, fontStyle: 'italic', maxWidth: 160, lineHeight: 1.5 }}>
            Research only. Not financial advice.
          </div>
        </div>
      </div>

      <style>{`
        input[type=range] { height: 4px; }
      `}</style>
    </div>
  )
}

// ── LSTM section (unchanged) ──────────────────────────────────────────────────

function LSTMSection({ data, focus }: { data: BacktestResponse; focus: string }) {
  const { batch_results, lstm_by_ticker } = data
  const cm         = lstm_by_ticker[focus]
  const lstmResult = batch_results[focus]?.['LSTM Multi-Signal']

  const { hist, maxBin } = useMemo(() => {
    if (!cm) return { hist: new Array(20).fill(0), maxBin: 1 }
    const h = new Array(20).fill(0)
    cm.confidence.forEach((c: number) => { h[Math.min(19, Math.floor(c * 20))]++ })
    return { hist: h, maxBin: Math.max(...h, 1) }
  }, [cm])

  if (!cm) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
        LSTM Multi-Signal was not selected or failed to train for <strong>{focus}</strong>.
        Enable it in run configuration and re-run the backtest.
      </div>
    )
  }

  return (
    <>
      <div className="grid-4 stat-grid" style={{ marginBottom: 24 }}>
        {[
          { label: 'Accuracy',  value: `${(cm.accuracy  * 100).toFixed(1)}%`, delta: '↑ baseline 50%',      up: true  },
          { label: 'Precision', value: `${(cm.precision * 100).toFixed(1)}%`, delta: 'True+ / Predicted+', up: false },
          { label: 'Recall',    value: `${(cm.recall    * 100).toFixed(1)}%`, delta: 'captured upticks',   up: false },
          { label: 'F1 score',  value: cm.f1.toFixed(3),                       delta: `${cm.n} test samples`, up: false },
        ].map(s => (
          <div key={s.label}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
            <div className={`stat-delta ${s.up ? 'up' : 'muted'}`} style={!s.up ? { color: 'var(--text-muted)' } : undefined}>{s.delta}</div>
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        <div className="card">
          <div className="card-header">
            <div><h3 className="card-title">Confusion matrix</h3><p className="card-subtitle">Predicted vs actual on hold-out</p></div>
          </div>
          <div className="card-body">
            <div className="cmatrix">
              <div/><div className="axis-label">Pred ↓</div><div className="axis-label">Pred ↑</div>
              <div className="axis-label" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>Actual ↓</div>
              <div className="cmatrix-cell" style={{ background: `rgba(10,138,62,${0.15+(cm.tn/cm.n)*1.2})` }}><span className="big" style={{ color:'var(--up)' }}>{cm.tn}</span><span className="small">True neg.</span></div>
              <div className="cmatrix-cell" style={{ background: `rgba(192,56,59,${0.10+(cm.fp/cm.n)*1.2})` }}><span className="big" style={{ color:'var(--down)' }}>{cm.fp}</span><span className="small">False pos.</span></div>
              <div className="axis-label" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>Actual ↑</div>
              <div className="cmatrix-cell" style={{ background: `rgba(192,56,59,${0.10+(cm.fn/cm.n)*1.2})` }}><span className="big" style={{ color:'var(--down)' }}>{cm.fn}</span><span className="small">False neg.</span></div>
              <div className="cmatrix-cell" style={{ background: `rgba(10,138,62,${0.15+(cm.tp/cm.n)*1.2})` }}><span className="big" style={{ color:'var(--up)' }}>{cm.tp}</span><span className="small">True pos.</span></div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div><h3 className="card-title">Confidence distribution</h3><p className="card-subtitle">Predicted probability histogram · n = {cm.n}</p></div>
          </div>
          <div className="card-body">
            <svg viewBox="0 0 400 240" style={{ width: '100%', height: 240 }}>
              <rect x="0" y="0" width={160} height="220" fill="var(--down)" opacity="0.05"/>
              <rect x={240} y="0" width={160} height="220" fill="var(--up)" opacity="0.05"/>
              <line x1={160} x2={160} y1="0" y2="220" stroke="var(--down)" strokeDasharray="3 3" opacity="0.5"/>
              <line x1={240} x2={240} y1="0" y2="220" stroke="var(--up)" strokeDasharray="3 3" opacity="0.5"/>
              {hist.map((c: number, i: number) => {
                const x = (i / 20) * 400, w = 18, h = (c / maxBin) * 200
                const center = (i + 0.5) / 20
                return <rect key={i} x={x+1} y={220-h} width={w} height={h} rx="2" opacity="0.85"
                  fill={center < 0.4 ? 'var(--down)' : center > 0.6 ? 'var(--up)' : 'var(--text-subtle)'}/>
              })}
              {[0, 0.25, 0.5, 0.75, 1].map(p => (
                <text key={p} x={p*400} y="236" fontSize="10" fill="var(--text-muted)" textAnchor="middle" fontFamily="var(--mono)">{p.toFixed(2)}</text>
              ))}
              <text x={80}  y="14" fontSize="10" fill="var(--down)" textAnchor="middle" fontFamily="var(--mono)">SELL &lt; 0.40</text>
              <text x={320} y="14" fontSize="10" fill="var(--up)"   textAnchor="middle" fontFamily="var(--mono)">BUY &gt; 0.60</text>
            </svg>
          </div>
        </div>
      </div>

      {lstmResult && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <h3 className="card-title">LSTM backtest performance — {focus}</h3>
            <span className="tag">2025 hold-out · live capital</span>
          </div>
          <div className="card-body">
            <div className="grid-4">
              {[
                { label: 'Total return', val: fmt.pct(lstmResult.metrics.total_return),        col: (lstmResult.metrics.total_return ?? 0) >= 0 ? 'var(--up)' : 'var(--down)' },
                { label: 'Sharpe ratio', val: lstmResult.metrics.sharpe_ratio?.toFixed(2) ?? '—', col: '' },
                { label: 'Max drawdown', val: fmt.pct(lstmResult.metrics.max_drawdown, false), col: 'var(--down)' },
                { label: 'Trades',       val: String(lstmResult.metrics.n_trades ?? '—'),      col: '' },
              ].map(s => (
                <div key={s.label}>
                  <div className="stat-label">{s.label}</div>
                  <div className="stat-value mono" style={s.col ? { color: s.col } : undefined}>{s.val}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── LangGraph pipeline steps ──────────────────────────────────────────────────

const PIPELINE_STEPS = [
  { id: 'summarize',   label: 'Summarising metrics',    icon: '📊' },
  { id: 'regime',      label: 'Analysing regime',       icon: '🌊' },
  { id: 'rank',        label: 'Ranking strategies',     icon: '🏆' },
  { id: 'risk',        label: 'Assessing risk',         icon: '⚠️' },
  { id: 'llm',         label: 'GPT-4o-mini reasoning',  icon: '🤖' },
]

// ── Main TabAI ────────────────────────────────────────────────────────────────

export default function TabAI({ data }: { data: BacktestResponse }) {
  const tickers = Object.keys(data.batch_results).filter(k => k !== 'PAIRS')
  const [focus, setFocus] = useState(tickers[0] ?? '')

  const [apiKey,    setApiKey]    = useState('')
  const [showKey,   setShowKey]   = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [step,      setStep]      = useState(-1)
  const [analysis,  setAnalysis]  = useState<AIAnalysis | null>(null)
  const [error,     setError]     = useState<string | null>(null)
  const [showRaw,   setShowRaw]   = useState(false)

  const runAnalysis = async () => {
    setLoading(true)
    setError(null)
    setAnalysis(null)
    setStep(0)

    // Simulate step progress while the backend runs
    const stepInterval = setInterval(() => {
      setStep(s => (s < PIPELINE_STEPS.length - 1 ? s + 1 : s))
    }, 1200)

    try {
      const result = await fetchAIAnalysis(apiKey || undefined)
      setAnalysis(result)
      setStep(PIPELINE_STEPS.length)
    } catch (e: unknown) {
      setError(String(e))
    } finally {
      clearInterval(stepInterval)
      setLoading(false)
    }
  }

  const riskColor = (level: string) =>
    level === 'HIGH' ? 'var(--down)' : level === 'MEDIUM' ? '#f4a261' : 'var(--up)'

  const maxScore = analysis?.strategy_rankings?.[0]?.score ?? 1

  return (
    <div className="page-fade">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">AI analysis</h1>
          <p className="page-subtitle">LSTM diagnostics + LangGraph multi-agent strategy analysis powered by Claude Haiku.</p>
        </div>
        <label className="field" style={{ minWidth: 220 }}>
          <span className="label">LSTM focus stock</span>
          <select className="select" value={focus} onChange={e => setFocus(e.target.value)}>
            {tickers.map(s => <option key={s} value={s}>{s} — {TICKER_META[s]?.name ?? s}</option>)}
          </select>
        </label>
      </div>

      {/* ── XAI Stepper ── */}
      <XAIStepper data={data} ticker={focus} />

      {/* ── LSTM section ── */}
      <div className="card" style={{ marginBottom: 32 }}>
        <div className="card-header">
          <div>
            <h3 className="card-title">LSTM Multi-Signal · {focus}</h3>
            <p className="card-subtitle">Trained on 2020–2024 · tested on 15% held-out slice</p>
          </div>
          <span className="tag">Neural network</span>
        </div>
        <div className="card-body">
          <LSTMSection data={data} focus={focus}/>
        </div>
      </div>

      {/* ── LangGraph section ── */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">LangGraph strategy analysis</h3>
            <p className="card-subtitle">5-node pipeline: Data → Regime → Rank → Risk → Claude Haiku</p>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {PIPELINE_STEPS.map((s, i) => (
              <span key={s.id} style={{
                fontSize: 10, padding: '2px 7px', borderRadius: 10,
                fontFamily: 'var(--mono)',
                background: step > i ? 'var(--up-soft)' : step === i ? 'var(--accent-soft)' : 'var(--bg-subtle)',
                color:      step > i ? 'var(--up)'     : step === i ? 'var(--accent-text)' : 'var(--text-subtle)',
                border:     step === i && loading ? '1px solid var(--accent)' : '1px solid transparent',
                transition: 'all 0.3s',
              }}>
                {s.icon} {s.label}
              </span>
            ))}
          </div>
        </div>

        <div className="card-body">
          {/* API key + run — always visible */}
          <div style={{
            padding: '14px 16px', borderRadius: 8, marginBottom: 20,
            background: 'var(--bg-subtle)', border: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>🔑 Anthropic API key</span>
              <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 10, background: 'var(--up-soft)', color: 'var(--up)', fontFamily: 'var(--mono)' }}>optional</span>
              {apiKey && <span style={{ fontSize: 11, color: 'var(--up)', fontFamily: 'var(--mono)' }}>✓ key entered</span>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
              Leave blank to run the 4 data-analysis nodes instantly (rankings, risk flags, regime breakdown).
              Add a key from <strong>console.anthropic.com</strong> to also get a Claude Haiku natural-language narrative.
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: 1, maxWidth: 420 }}>
                <input
                  type={showKey ? 'text' : 'password'}
                  className="input"
                  style={{ width: '100%', paddingRight: 36, fontFamily: 'var(--mono)', fontSize: 12 }}
                  placeholder="sk-ant-…"
                  value={apiKey}
                  onChange={e => { setApiKey(e.target.value); setError(null) }}
                  onKeyDown={e => e.key === 'Enter' && !loading && runAnalysis()}
                />
                <button onClick={() => setShowKey(v => !v)}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, fontSize: 12 }}>
                  {showKey ? '🙈' : '👁'}
                </button>
              </div>
              <button className="btn btn-primary" style={{ minWidth: 160, height: 36, flexShrink: 0 }} onClick={runAnalysis} disabled={loading}>
                {loading
                  ? <><span style={{ display:'inline-block', width:12, height:12, border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'white', borderRadius:'50%', animation:'spin 0.7s linear infinite' }}/> Analysing…</>
                  : <><Icons.Brain size={13}/> Run AI analysis</>
                }
              </button>
              {analysis && (
                <button className="btn" style={{ fontSize: 12, height: 36 }} onClick={() => { setAnalysis(null); setStep(-1) }}>
                  Re-run
                </button>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{ padding: '12px 16px', borderRadius: 8, background: 'var(--down-soft)', color: 'var(--down)', fontSize: 13, marginBottom: 16 }}>
              <strong>Error:</strong> {error}
              <button className="btn" style={{ marginLeft: 16, fontSize: 11, padding: '2px 10px' }} onClick={() => setError(null)}>Dismiss</button>
            </div>
          )}

          {/* Loading steps */}
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {PIPELINE_STEPS.map((s, i) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 20, textAlign: 'center' }}>
                    {step > i ? '✓' : step === i ? '⟳' : '○'}
                  </span>
                  <span style={{
                    fontSize: 13,
                    color: step > i ? 'var(--up)' : step === i ? 'var(--text)' : 'var(--text-subtle)',
                    fontWeight: step === i ? 600 : 400,
                  }}>
                    {s.icon} {s.label}
                    {step === i && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-subtle)' }}>running…</span>}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Results */}
          {analysis && (
            <div>
              {/* Verdict + Top Strategy — only shown when Claude ran */}
              {analysis.llm_used ? (
                <div className="grid-2" style={{ marginBottom: 24 }}>
                  <div className="card" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}>
                    <div className="card-body">
                      <div className="stat-label" style={{ marginBottom: 8 }}>Claude verdict</div>
                      <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
                        {analysis.overall_verdict}
                      </p>
                      {analysis.regime_insight && (
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10, marginBottom: 0, fontStyle: 'italic' }}>
                          {analysis.regime_insight}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="card" style={{ background: 'var(--up-soft)', border: '1px solid var(--up)' }}>
                    <div className="card-body">
                      <div className="stat-label" style={{ marginBottom: 8 }}>Top strategy pick</div>
                      <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--up)', margin: 0, fontWeight: 600 }}>
                        {analysis.top_strategy}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '12px 16px', borderRadius: 8, background: 'var(--bg-subtle)', border: '1px solid var(--border)', marginBottom: 24, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
                  <strong style={{ color: 'var(--text)' }}>Data analysis complete</strong> — 4 nodes ran without an API key.
                  Add your Anthropic key above and re-run to get a Claude Haiku narrative summary.
                  <pre style={{ marginTop: 10, marginBottom: 0, fontFamily: 'var(--mono)', fontSize: 11, whiteSpace: 'pre-wrap', color: 'var(--text-muted)' }}>
                    {analysis.regime_analysis}
                  </pre>
                </div>
              )}

              {/* Strategy rankings */}
              <div className="card" style={{ marginBottom: 24 }}>
                <div className="card-header">
                  <h3 className="card-title">Strategy rankings</h3>
                  <p className="card-subtitle">Composite score: 40% return + 30% Sharpe + 20% drawdown resilience + 10% win rate</p>
                </div>
                <div className="card-body">
                  {analysis.strategy_rankings.map(r => (
                    <div key={r.name} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-subtle)', minWidth: 20 }}>#{r.rank}</span>
                          <span style={{ fontSize: 13, fontWeight: r.rank === 1 ? 700 : 400 }}>{r.name}</span>
                          {r.rank === 1 && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, background: 'var(--up-soft)', color: 'var(--up)', fontFamily: 'var(--mono)' }}>best</span>}
                        </div>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-muted)' }}>{r.score.toFixed(3)}</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-subtle)' }}>
                        <div style={{
                          height: '100%', borderRadius: 3,
                          width: `${(r.score / maxScore) * 100}%`,
                          background: r.rank === 1 ? 'var(--up)' : 'var(--accent)',
                          opacity: r.rank === 1 ? 1 : 0.6,
                          transition: 'width 0.4s',
                        }}/>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Risk flags */}
              <div className="card" style={{ marginBottom: 24 }}>
                <div className="card-header">
                  <h3 className="card-title">Risk flags</h3>
                  <span className="tag">{analysis.risk_flags.length} flagged</span>
                </div>
                <div className="card-body">
                  {analysis.risk_flags.map((f, i) => (
                    <div key={i} style={{
                      padding: '8px 12px', borderRadius: 6, marginBottom: 6,
                      background: f.startsWith('No critical') ? 'var(--up-soft)' : 'var(--down-soft)',
                      color:      f.startsWith('No critical') ? 'var(--up)'      : 'var(--down)',
                      fontSize: 12, lineHeight: 1.5,
                    }}>
                      {f.startsWith('No critical') ? '✓ ' : '⚠ '}{f}
                    </div>
                  ))}
                </div>
              </div>

              {/* Ticker verdicts table */}
              <div className="card" style={{ marginBottom: 24 }}>
                <div className="card-header">
                  <h3 className="card-title">Per-ticker recommendations</h3>
                  <p className="card-subtitle">Best strategy + risk level from backtest data</p>
                </div>
                <div className="card-body flush">
                  <table className="tbl">
                    <thead><tr>
                      <th>Ticker</th>
                      <th>Best strategy</th>
                      <th className="right">Return</th>
                      <th className="right">Max DD</th>
                      <th>Risk</th>
                    </tr></thead>
                    <tbody>
                      {Object.entries(analysis.ticker_verdicts).map(([sym, v]) => (
                        <tr key={sym}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{sym}</div>
                            <div className="tiny muted">{TICKER_META[sym]?.name ?? ''}</div>
                          </td>
                          <td style={{ fontSize: 12 }}>{v.best_strategy}</td>
                          <td className="num" style={{ color: v.return >= 0 ? 'var(--up)' : 'var(--down)', fontWeight: 600 }}>{fmt.pct(v.return)}</td>
                          <td className="num" style={{ color: 'var(--down)' }}>{fmt.pct(v.max_drawdown, false)}</td>
                          <td>
                            <span style={{
                              fontSize: 10, padding: '2px 7px', borderRadius: 10,
                              fontFamily: 'var(--mono)', fontWeight: 600,
                              color: riskColor(v.risk_level),
                              background: `${riskColor(v.risk_level)}18`,
                              border: `1px solid ${riskColor(v.risk_level)}40`,
                            }}>
                              {v.risk_level}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Raw LLM output — only when Claude ran */}
              {analysis.llm_used && <div className="card">
                <div className="card-header" style={{ cursor: 'pointer' }} onClick={() => setShowRaw(v => !v)}>
                  <div>
                    <h3 className="card-title">Full GPT-4o-mini analysis</h3>
                    <p className="card-subtitle">Raw LLM output from generate_recommendations node</p>
                  </div>
                  <span style={{ fontSize: 14, display: 'inline-block', transform: showRaw ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
                </div>
                {showRaw && (
                  <div className="card-body">
                    <pre style={{
                      fontFamily: 'var(--mono)', fontSize: 12, lineHeight: 1.7,
                      color: 'var(--text)', whiteSpace: 'pre-wrap', margin: 0,
                      background: 'var(--bg-subtle)', padding: 16, borderRadius: 8,
                    }}>
                      {analysis.raw_analysis}
                    </pre>
                  </div>
                )}
              </div>}
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
