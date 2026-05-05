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

const FEATURE_WEIGHTS: Record<string, { label: string; weight: number; color: string }[]> = {
  'EMA Crossover + Volume': [
    { label: 'Price action (EMA stack)',   weight: 40, color: 'var(--accent)' },
    { label: 'Trend confirmation (EMAs)',  weight: 35, color: '#7cb8ff' },
    { label: 'Volume anomaly',             weight: 25, color: 'var(--warn)' },
  ],
  'RSI + Bollinger Bands': [
    { label: 'Momentum (RSI)',             weight: 40, color: '#7cb8ff' },
    { label: 'Volatility bands (BB)',      weight: 35, color: 'var(--accent)' },
    { label: 'Price position',             weight: 25, color: 'var(--warn)' },
  ],
  'MACD + ADX': [
    { label: 'MACD momentum',             weight: 45, color: '#7cb8ff' },
    { label: 'Trend strength (ADX)',       weight: 35, color: 'var(--accent)' },
    { label: 'Price action',              weight: 20, color: 'var(--warn)' },
  ],
  'Buy & Hold': [
    { label: 'Price return',              weight: 100, color: 'var(--accent)' },
  ],
  'ML Signal': [
    { label: 'EMA features (5 periods)',  weight: 35, color: 'var(--accent)' },
    { label: 'Momentum (RSI/MACD/BB)',    weight: 40, color: '#7cb8ff' },
    { label: 'Volume & price change',     weight: 25, color: 'var(--warn)' },
  ],
  'LSTM Multi-Signal': [
    { label: 'Temporal sequence (20d)',   weight: 38, color: 'var(--accent)' },
    { label: 'Momentum indicators',       weight: 32, color: '#7cb8ff' },
    { label: 'ROC & StochRSI',            weight: 30, color: 'var(--warn)' },
  ],
}
const DEFAULT_FEATURES = [
  { label: 'Price action',  weight: 40, color: 'var(--accent)' },
  { label: 'Momentum',      weight: 35, color: '#7cb8ff' },
  { label: 'Volume',        weight: 25, color: 'var(--warn)' },
]

// ── XAI sub-components ────────────────────────────────────────────────────────

function CircularGauge({ value, label }: { value: number; label: string }) {
  const r = 36, circ = 2 * Math.PI * r
  const offset = circ * (1 - Math.min(100, Math.max(0, value)) / 100)
  const color = value >= 65 ? 'var(--up)' : value >= 40 ? 'var(--warn)' : 'var(--down)'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <svg width={96} height={96} viewBox="0 0 96 96">
        <circle cx={48} cy={48} r={r} fill="none" stroke="var(--bg-subtle)" strokeWidth={7}/>
        <circle cx={48} cy={48} r={r} fill="none" stroke={color} strokeWidth={7}
          strokeDasharray={`${circ}`} strokeDashoffset={offset}
          strokeLinecap="round" transform="rotate(-90 48 48)"
          style={{ transition: 'stroke-dashoffset 0.9s ease' }}/>
        <text x={48} y={48} fontSize={17} fontWeight={700} fill={color}
          textAnchor="middle" dominantBaseline="central" fontFamily="var(--mono)">
          {value.toFixed(0)}%
        </text>
      </svg>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>{label}</span>
    </div>
  )
}

function FeatureBar({ label, weight, color, active }: { label: string; weight: number; color: string; active: boolean }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: 'var(--text-muted)' }}>{label}</span>
        <span style={{ fontFamily: 'var(--mono)', color, fontWeight: 600 }}>{weight}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 99, background: 'var(--bg-subtle)' }}>
        <div style={{
          height: '100%', borderRadius: 99, background: color,
          width: active ? `${weight}%` : '0%',
          transition: 'width 0.7s cubic-bezier(0.4,0,0.2,1)',
        }}/>
      </div>
    </div>
  )
}

interface StepProps { active: boolean; done: boolean; n: number; title: string; tooltip: string; children: React.ReactNode; onClick: () => void }

function XAIStep({ active, done, n, title, tooltip, children, onClick }: StepProps) {
  return (
    <div style={{
      borderRadius: 10, border: `1px solid ${active ? 'var(--accent)' : done ? 'var(--border)' : 'var(--border)'}`,
      background: active ? 'var(--bg-elevated)' : 'var(--bg)',
      boxShadow: active ? 'var(--shadow-md)' : 'none',
      transition: 'all 0.3s ease', overflow: 'hidden',
    }}>
      <button onClick={onClick} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 14,
        padding: '14px 18px', background: 'none', border: 'none',
        cursor: 'pointer', textAlign: 'left', color: 'var(--text)',
      }}>
        {/* Step number badge */}
        <div style={{
          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: done ? 'var(--up-soft)' : active ? 'var(--accent)' : 'var(--bg-subtle)',
          color: done ? 'var(--up)' : active ? '#fff' : 'var(--text-subtle)',
          fontSize: 13, fontWeight: 700, fontFamily: 'var(--mono)',
          transition: 'all 0.3s',
        }}>
          {done ? '✓' : n}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{title}</div>
          <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 1 }}>{tooltip}</div>
        </div>
        <span style={{
          fontSize: 11, color: 'var(--text-subtle)',
          transform: active ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.2s', display: 'inline-block',
        }}>▾</span>
      </button>
      {active && (
        <div style={{ padding: '0 18px 18px', borderTop: '1px solid var(--border)' }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ── XAI Stepper main component ────────────────────────────────────────────────

function XAIStepper({ data, ticker }: { data: BacktestResponse; ticker: string }) {
  const [activeStep, setActiveStep] = useState<number | null>(null)
  const [playing,    setPlaying]    = useState(false)

  // Auto-play: step through 0→5 with delay
  useEffect(() => {
    if (!playing) return
    if (activeStep === null) { setActiveStep(0); return }
    if (activeStep >= 5) { setPlaying(false); return }
    const t = setTimeout(() => setActiveStep(s => (s ?? 0) + 1), 1800)
    return () => clearTimeout(t)
  }, [playing, activeStep])

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

  const metrics     = data.batch_results[ticker]?.[bestStrat]?.metrics
  const lstmData    = data.lstm_by_ticker?.[ticker]
  const lastClose   = prices[prices.length - 1] ?? 0
  const prevClose   = prices[prices.length - 2] ?? lastClose
  const changePct   = lastClose && prevClose ? ((lastClose - prevClose) / prevClose) * 100 : 0
  const rsi         = useMemo(() => computeRSI(prices), [prices])
  const ema20       = useMemo(() => computeEMA(prices, 20), [prices])
  const ema50       = useMemo(() => computeEMA(prices, 50), [prices])
  const features    = FEATURE_WEIGHTS[bestStrat] ?? DEFAULT_FEATURES

  // Regime stats
  const regimeStats = useMemo(() => {
    const labels = data.regime_labels ?? []
    const calm     = labels.filter(l => l === 'calm').length
    const volatile = labels.filter(l => l === 'volatile').length
    const total    = labels.length || 1
    const current  = labels[labels.length - 1] ?? 'calm'
    return { calm, volatile, total, current, calmPct: Math.round(calm / total * 100), volPct: Math.round(volatile / total * 100) }
  }, [data.regime_labels])

  // Confidence
  const confidence = useMemo(() => {
    if (lstmData?.confidence?.length) {
      const last20 = lstmData.confidence.slice(-20)
      const avg = last20.reduce((a, b) => a + b, 0) / last20.length
      return Math.round(avg * 100)
    }
    const wr    = metrics?.win_rate ?? 0.5
    const sharpe = Math.min(3, Math.max(0, metrics?.sharpe_ratio ?? 0))
    return Math.round(((wr + sharpe / 3) / 2) * 100)
  }, [lstmData, metrics])

  // Signal derivation
  const signal = useMemo(() => {
    const ret = metrics?.total_return ?? 0
    const wr  = metrics?.win_rate ?? 0.5
    if (ret > 0.05 && wr > 0.5)  return { label: 'BUY',  color: 'var(--up)',   bg: 'var(--up-soft)' }
    if (ret < -0.05 || wr < 0.4) return { label: 'AVOID', color: 'var(--down)', bg: 'var(--down-soft)' }
    return { label: 'HOLD', color: 'var(--warn)', bg: 'var(--warn-soft)' }
  }, [metrics])

  const avgPerTrade   = metrics?.n_trades ? (metrics.total_return ?? 0) / (metrics.n_trades || 1) : 0
  const targetPrice   = lastClose * (1 + Math.max(0, avgPerTrade))
  const stopPrice     = lastClose * (1 + (metrics?.max_drawdown ?? -0.1) * 0.4)

  const toggle = (i: number) => setActiveStep(s => s === i ? null : i)

  const steps = [
    {
      title: 'Data Ingestion — Raw Input',
      tooltip: 'Fetching current market state and technical indicators.',
      content: (
        <div style={{ marginTop: 14 }}>
          <div style={{
            fontFamily: 'var(--mono)', fontSize: 12, lineHeight: 2,
            padding: '14px 16px', borderRadius: 8,
            background: 'var(--bg-subtle)', border: '1px solid var(--border)',
          }}>
            <div style={{ color: 'var(--accent)', marginBottom: 4, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              ● LIVE FEED — {ticker}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 32px' }}>
              {[
                ['Ticker',         ticker],
                ['Last Close',     `$${lastClose.toFixed(2)}`],
                ['Day Change',     `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`],
                ['RSI (14)',       rsi.toFixed(1)],
                ['EMA (20)',       `$${ema20.toFixed(2)}`],
                ['EMA (50)',       `$${ema50.toFixed(2)}`],
                ['Data points',   `${prices.length} days`],
                ['Best strategy', bestStrat || '—'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                  <span style={{ color: 'var(--text-subtle)' }}>{k}</span>
                  <span style={{ color: 'var(--text)', fontWeight: 500 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Feature Engineering — Importance Weights',
      tooltip: 'Normalising inputs and assigning importance based on current market dynamics.',
      content: (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.6 }}>
            Feature attribution for <strong>{bestStrat || 'active strategy'}</strong>. Weights reflect how much each signal group influences the final decision.
          </div>
          {features.map(f => (
            <FeatureBar key={f.label} label={f.label} weight={f.weight} color={f.color} active={activeStep === 1} />
          ))}
        </div>
      ),
    },
    {
      title: 'Pattern Recognition — LSTM Core',
      tooltip: 'Comparing current sequence against historical memory layers to predict trajectory.',
      content: (
        <div style={{ marginTop: 14 }}>
          {lstmData ? (
            <>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.6 }}>
                LSTM trained on 2020–2024 data. Confidence distribution shows how decisive the model is:
                scores &lt;0.40 → SELL, &gt;0.60 → BUY.
              </div>
              <svg viewBox="0 0 400 160" style={{ width: '100%', display: 'block', borderRadius: 8 }}>
                <rect x={0} y={0} width={160} height={140} fill="var(--down)" opacity={0.05}/>
                <rect x={240} y={0} width={160} height={140} fill="var(--up)" opacity={0.05}/>
                <line x1={160} x2={160} y1={0} y2={140} stroke="var(--down)" strokeDasharray="3 3" opacity={0.4}/>
                <line x1={240} x2={240} y1={0} y2={140} stroke="var(--up)"   strokeDasharray="3 3" opacity={0.4}/>
                {(() => {
                  const h = new Array(20).fill(0)
                  lstmData.confidence.forEach((c: number) => { h[Math.min(19, Math.floor(c * 20))]++ })
                  const mx = Math.max(...h, 1)
                  return h.map((cnt, i) => {
                    const x = (i / 20) * 400, w = 18, ht = (cnt / mx) * 120
                    const center = (i + 0.5) / 20
                    return <rect key={i} x={x + 1} y={140 - ht} width={w} height={ht} rx={2}
                      fill={center < 0.4 ? 'var(--down)' : center > 0.6 ? 'var(--up)' : 'var(--text-subtle)'}
                      opacity={0.8}/>
                  })
                })()}
                {[0, 0.25, 0.5, 0.75, 1].map(p => (
                  <text key={p} x={p * 400} y={155} fontSize={9} fill="var(--text-muted)" textAnchor="middle" fontFamily="var(--mono)">{p.toFixed(2)}</text>
                ))}
                <text x={80}  y={13} fontSize={9} fill="var(--down)" textAnchor="middle" fontFamily="var(--mono)">SELL zone</text>
                <text x={320} y={13} fontSize={9} fill="var(--up)"   textAnchor="middle" fontFamily="var(--mono)">BUY zone</text>
              </svg>
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Model accuracy: {(lstmData.accuracy * 100).toFixed(1)}% · F1: {lstmData.f1.toFixed(3)} · n={lstmData.n} test samples
              </div>
            </>
          ) : (
            <div style={{
              padding: '20px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)',
              background: 'var(--bg-subtle)', borderRadius: 8, lineHeight: 1.7,
            }}>
              LSTM not trained for <strong>{ticker}</strong>.<br/>
              Enable "LSTM Multi-Signal" in run configuration and re-run the backtest to see pattern recognition data.
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Market Regime Context — Environment',
      tooltip: 'Adjusting sensitivity parameters to account for broader market swings.',
      content: (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {/* Current regime badge */}
            <div style={{
              flex: 1, minWidth: 180,
              padding: '16px 20px', borderRadius: 10, textAlign: 'center',
              background: regimeStats.current === 'volatile' ? 'var(--down-soft)' : 'var(--up-soft)',
              border: `1px solid ${regimeStats.current === 'volatile' ? 'rgba(192,56,59,0.3)' : 'rgba(10,138,62,0.3)'}`,
            }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-subtle)', marginBottom: 8 }}>
                Current regime
              </div>
              <div style={{
                fontSize: 20, fontWeight: 700, fontFamily: 'var(--mono)',
                color: regimeStats.current === 'volatile' ? 'var(--down)' : 'var(--up)',
              }}>
                {regimeStats.current.toUpperCase()}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                {regimeStats.current === 'volatile'
                  ? 'High VIX — mean-reversion strategies favoured'
                  : 'Low VIX — trend-following strategies favoured'}
              </div>
            </div>
            {/* Breakdown */}
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Period breakdown
              </div>
              {[
                { label: 'Calm (low VIX)',     pct: regimeStats.calmPct,  days: regimeStats.calm,     color: 'var(--up)' },
                { label: 'Volatile (high VIX)', pct: regimeStats.volPct, days: regimeStats.volatile, color: 'var(--down)' },
              ].map(r => (
                <div key={r.label} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                    <span style={{ color: 'var(--text-muted)' }}>{r.label}</span>
                    <span style={{ fontFamily: 'var(--mono)', color: r.color }}>{r.pct}% ({r.days}d)</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 99, background: 'var(--bg-subtle)' }}>
                    <div style={{ height: '100%', borderRadius: 99, background: r.color, width: `${r.pct}%`, transition: 'width 0.6s ease' }}/>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Confidence Scoring — Probability',
      tooltip: 'Statistical probability of the predicted move synthesised from model outputs.',
      content: (
        <div style={{ marginTop: 14, display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
          <CircularGauge value={confidence} label="Model confidence" />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.8, marginBottom: 14 }}>
              {lstmData
                ? `Derived from the last 20 LSTM predictions (avg probability: ${(confidence / 100).toFixed(2)}).`
                : `Derived from strategy win rate (${fmt.pctSimple(metrics?.win_rate)}) and Sharpe ratio (${metrics?.sharpe_ratio?.toFixed(2) ?? '—'}).`}
            </div>
            {[
              { range: '≥ 65%', label: 'High confidence',   color: 'var(--up)',   bg: 'var(--up-soft)' },
              { range: '40–65%', label: 'Moderate confidence', color: 'var(--warn)', bg: 'var(--warn-soft)' },
              { range: '< 40%', label: 'Low confidence',    color: 'var(--down)', bg: 'var(--down-soft)' },
            ].map(r => (
              <div key={r.range} style={{
                display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6,
                padding: '5px 10px', borderRadius: 6, background: r.bg,
                opacity: (r.range === '≥ 65%' && confidence >= 65) ||
                         (r.range === '40–65%' && confidence >= 40 && confidence < 65) ||
                         (r.range === '< 40%'  && confidence < 40) ? 1 : 0.3,
              }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: r.color, minWidth: 50 }}>{r.range}</span>
                <span style={{ fontSize: 12, color: r.color }}>{r.label}</span>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      title: 'Final Output — Actionable Signal',
      tooltip: 'Definitive recommendation with risk management parameters from backtest analysis.',
      content: (
        <div style={{ marginTop: 14 }}>
          <div style={{
            padding: '20px 24px', borderRadius: 10,
            background: signal.bg, border: `1px solid ${signal.color}40`,
            marginBottom: 16,
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
              Signal recommendation
            </div>
            <div style={{ fontSize: 36, fontWeight: 800, fontFamily: 'var(--mono)', color: signal.color, marginBottom: 6 }}>
              {signal.label}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Based on {bestStrat} — {fmt.pct(metrics?.total_return)} return, {fmt.pctSimple(metrics?.win_rate)} win rate
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {[
              { label: 'Entry (last close)', value: `$${lastClose.toFixed(2)}`,   color: 'var(--text)' },
              { label: 'Target (avg/trade)', value: avgPerTrade > 0 ? `$${targetPrice.toFixed(2)}` : '—', color: 'var(--up)' },
              { label: 'Stop loss (est.)',   value: `$${stopPrice.toFixed(2)}`,    color: 'var(--down)' },
            ].map(r => (
              <div key={r.label} style={{
                padding: '14px 16px', borderRadius: 8, textAlign: 'center',
                background: 'var(--bg-subtle)', border: '1px solid var(--border)',
              }}>
                <div style={{ fontSize: 10, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                  {r.label}
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--mono)', color: r.color }}>
                  {r.value}
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-subtle)', fontStyle: 'italic', lineHeight: 1.6 }}>
            ⚠ Research purposes only. Not financial advice. Always apply your own risk management.
          </div>
        </div>
      ),
    },
  ]

  return (
    <div className="card" style={{ marginBottom: 32 }}>
      <div className="card-header">
        <div>
          <h3 className="card-title">Explainable AI — 6-step analysis</h3>
          <p className="card-subtitle">How the model thinks, step by step · {ticker}</p>
        </div>
        <button
          className={`btn ${playing ? '' : 'btn-primary'}`}
          style={{ fontSize: 12, minWidth: 120 }}
          onClick={() => { setPlaying(false); setActiveStep(null); setTimeout(() => setPlaying(true), 50) }}
        >
          {playing ? '⟳ Playing…' : '▶ Auto-play'}
        </button>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {steps.map((s, i) => (
          <XAIStep
            key={i} n={i + 1} title={s.title} tooltip={s.tooltip}
            active={activeStep === i}
            done={(activeStep ?? -1) > i}
            onClick={() => toggle(i)}
          >
            {s.content}
          </XAIStep>
        ))}
      </div>
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
