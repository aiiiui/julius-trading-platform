import { useEffect, useState } from 'react'

interface Progress {
  running: boolean
  pct: number
  step: number
  total: number
  msg: string
  eta_sec: number | null
}

const BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api'

function fmtEta(sec: number | null): string {
  if (sec === null || sec < 0) return 'calculating…'
  if (sec < 5)  return 'almost done'
  if (sec < 60) return `~${sec}s remaining`
  return `~${Math.ceil(sec / 60)}m remaining`
}

export default function BacktestProgress({
  tickers,
  strategies,
}: {
  tickers: string[]
  strategies: string[]
}) {
  const [prog, setProg] = useState<Progress>({
    running: true, pct: 0, step: 0, total: 0, msg: 'Initializing…', eta_sec: null,
  })

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const r = await fetch(`${BASE}/backtest_progress`)
        if (r.ok) setProg(await r.json())
      } catch {}
    }, 500)
    return () => clearInterval(id)
  }, [])

  const pct = Math.min(100, Math.max(0, prog.pct))

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: 480, padding: '40px 24px',
    }}>
      <div className="card" style={{ maxWidth: 580, width: '100%', padding: 40 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 32 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 11,
            background: 'var(--accent-soft)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <SpinnerRing color="var(--accent)" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 2 }}>Running Backtest</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {tickers.length} tickers × {strategies.length} strategies
            </div>
          </div>
          <div style={{
            fontFamily: 'var(--mono)', fontSize: 32, fontWeight: 700,
            color: 'var(--accent)', letterSpacing: '-1px',
            minWidth: 72, textAlign: 'right',
          }}>
            {pct.toFixed(0)}%
          </div>
        </div>

        {/* Progress bar */}
        <div style={{
          height: 8, borderRadius: 99, background: 'var(--bg-subtle)',
          marginBottom: 8, overflow: 'hidden', position: 'relative',
        }}>
          <div style={{
            position: 'absolute', inset: 0, right: `${100 - pct}%`,
            background: 'var(--accent)',
            borderRadius: 99,
            transition: 'right 0.5s cubic-bezier(0.4,0,0.2,1)',
          }} />
          {/* Shimmer effect */}
          {pct < 100 && (
            <div style={{
              position: 'absolute', top: 0, bottom: 0,
              left: `${Math.max(0, pct - 8)}%`, width: '8%',
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
              animation: 'shimmer 1.2s ease-in-out infinite',
            }} />
          )}
        </div>

        {/* Step + ETA row */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          fontSize: 11, color: 'var(--text-subtle)',
          fontFamily: 'var(--mono)', marginBottom: 28,
        }}>
          <span>{prog.step > 0 ? `Step ${prog.step} / ${prog.total}` : 'Starting…'}</span>
          <span>{fmtEta(prog.eta_sec)}</span>
        </div>

        {/* Current message */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '11px 14px', borderRadius: 8,
          background: 'var(--bg-subtle)', border: '1px solid var(--border)',
          fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--mono)',
          marginBottom: 28, minHeight: 42,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: pct >= 100 ? 'var(--up)' : 'var(--accent)',
            animation: pct < 100 ? 'blink 1.4s ease-in-out infinite' : 'none',
          }} />
          {prog.msg || 'Initializing…'}
        </div>

        {/* Ticker chips */}
        <div>
          <div style={{
            fontSize: 10, color: 'var(--text-subtle)',
            textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10,
          }}>
            Tickers
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {tickers.map((t, i) => {
              const tickerStep = i + 2
              const done    = prog.step > tickerStep
              const current = prog.msg.includes(t)
              return (
                <span key={t} style={{
                  padding: '3px 10px', borderRadius: 5,
                  fontSize: 11, fontFamily: 'var(--mono)',
                  background: done ? 'var(--up-soft)' : current ? 'var(--accent-soft)' : 'var(--bg-subtle)',
                  color:      done ? 'var(--up)'      : current ? 'var(--accent)'      : 'var(--text-subtle)',
                  border:     `1px solid ${done ? 'transparent' : current ? 'var(--accent-soft)' : 'var(--border)'}`,
                  transition: 'all 0.3s ease',
                }}>
                  {done ? '✓ ' : current ? '› ' : ''}{t}
                </span>
              )
            })}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes blink   { 0%,100%{opacity:1} 50%{opacity:0.2} }
        @keyframes shimmer { 0%{opacity:0} 50%{opacity:1} 100%{opacity:0} }
      `}</style>
    </div>
  )
}

function SpinnerRing({ color }: { color: string }) {
  return (
    <div style={{
      width: 20, height: 20, borderRadius: '50%',
      border: `2.5px solid transparent`,
      borderTopColor: color,
      borderRightColor: color,
      animation: 'spin 0.7s linear infinite',
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
