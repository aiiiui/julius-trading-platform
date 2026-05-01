import { useState, useEffect, useMemo } from 'react'
import { fetchOHLCV } from '../api'
import type { Candle } from '../types'

const W = 880, H = 360, PAD = { l: 64, r: 20, t: 16, b: 28 }
const innerW = W - PAD.l - PAD.r
const innerH = H - PAD.t - PAD.b

export default function CandleChart({ symbol, livePrice }: { symbol: string; livePrice: number | undefined }) {
  const [candles, setCandles] = useState<Candle[]>([])

  useEffect(() => {
    fetchOHLCV(symbol, 80).then(d => setCandles(d.candles)).catch(() => {})
  }, [symbol])

  const { minV, maxV } = useMemo(() => {
    if (!candles.length) return { minV: 0, maxV: 1 }
    const all = candles.flatMap(c => [c.high, c.low])
    if (livePrice) all.push(livePrice)
    return { minV: Math.min(...all) * 0.998, maxV: Math.max(...all) * 1.002 }
  }, [candles, livePrice])

  const range = maxV - minV || 1
  const N = candles.length || 1
  const yFor = (v: number) => PAD.t + innerH - ((v - minV) / range) * innerH
  const xFor = (i: number) => PAD.l + ((i + 0.5) / N) * innerW
  const candleW = (innerW / N) * 0.7
  const yTicks = 6

  if (!candles.length) {
    return (
      <div style={{ height: H, display: 'grid', placeItems: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
        Loading chart…
      </div>
    )
  }

  const live = livePrice ?? candles[candles.length - 1]?.close

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block' }}>
      {/* grid lines */}
      {Array.from({ length: yTicks }, (_, i) => {
        const v = minV + range * (i / (yTicks - 1))
        const y = yFor(v)
        return (
          <g key={i}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} stroke="var(--border)" strokeDasharray="2 4" opacity="0.7"/>
            <text x={PAD.l - 8} y={y + 4} fontSize="11" fill="var(--text-muted)" textAnchor="end" fontFamily="var(--mono)">
              €{v.toFixed(0)}
            </text>
          </g>
        )
      })}

      {/* candles */}
      {candles.map((c, i) => {
        const isUp   = c.close >= c.open
        const x      = xFor(i)
        const yH = yFor(c.high), yL = yFor(c.low)
        const top = Math.min(yFor(c.open), yFor(c.close))
        const bot = Math.max(yFor(c.open), yFor(c.close))
        const col = isUp ? 'var(--up)' : 'var(--down)'
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={yH} y2={yL} stroke={col} strokeWidth="1"/>
            <rect x={x - candleW / 2} y={top} width={candleW} height={Math.max(bot - top, 1)}
                  fill={col} opacity={isUp ? 0.85 : 0.95}/>
          </g>
        )
      })}

      {/* live price line */}
      {live && (() => {
        const y = yFor(live)
        return (
          <g>
            <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y}
                  stroke="var(--accent)" strokeWidth="1" strokeDasharray="4 4" opacity="0.8"/>
            <rect x={W - PAD.r - 64} y={y - 9} width={62} height={18} rx="3" fill="var(--accent)"/>
            <text x={W - PAD.r - 33} y={y + 4} fontSize="11" fill="white"
                  textAnchor="middle" fontFamily="var(--mono)" fontWeight="600">
              €{live.toFixed(2)}
            </text>
          </g>
        )
      })()}

      {/* x-axis labels */}
      {([0, 0.25, 0.5, 0.75, 1] as const).map((p, i) => {
        const x = PAD.l + p * innerW
        const days = Math.round((1 - p) * N)
        return (
          <text key={i} x={x} y={H - 8} fontSize="11" fill="var(--text-muted)"
                textAnchor="middle" fontFamily="var(--mono)">
            {days === 0 ? 'Now' : `-${days}d`}
          </text>
        )
      })}
    </svg>
  )
}
