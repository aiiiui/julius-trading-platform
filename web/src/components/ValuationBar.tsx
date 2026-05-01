import type { FundamentalData } from '../api'

type Label = FundamentalData['valuation_label']

const LABEL_META: Record<Label, { color: string; bg: string; pos: number }> = {
  'Buy Now':    { color: '#16a34a', bg: '#dcfce7', pos: 5  },
  'Good Price': { color: '#65a30d', bg: '#ecfccb', pos: 25 },
  'Fair':       { color: '#ca8a04', bg: '#fef9c3', pos: 50 },
  'High':       { color: '#ea580c', bg: '#ffedd5', pos: 72 },
  'Expensive':  { color: '#dc2626', bg: '#fee2e2', pos: 92 },
  'Unknown':    { color: '#9ca3af', bg: '#f3f4f6', pos: 50 },
}

export default function ValuationBar({ label, score, compact = false }: {
  label: Label
  score: number   // 0–100
  compact?: boolean
}) {
  const meta = LABEL_META[label] ?? LABEL_META['Unknown']

  if (compact) {
    return (
      <span style={{
        display: 'inline-block',
        padding: '2px 7px',
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 600,
        fontFamily: 'var(--mono)',
        background: meta.bg,
        color: meta.color,
        whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
    )
  }

  return (
    <div style={{ minWidth: 120 }}>
      <div style={{
        position: 'relative',
        height: 6,
        borderRadius: 3,
        background: 'linear-gradient(to right, #16a34a, #65a30d, #ca8a04, #ea580c, #dc2626)',
        marginBottom: 4,
      }}>
        {/* Indicator dot */}
        <div style={{
          position: 'absolute',
          left: `${Math.min(96, Math.max(2, score))}%`,
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: meta.color,
          border: '2px solid white',
          boxShadow: '0 0 0 1px ' + meta.color,
        }}/>
      </div>
      <span style={{
        display: 'inline-block',
        padding: '1px 6px',
        borderRadius: 3,
        fontSize: 10,
        fontWeight: 600,
        fontFamily: 'var(--mono)',
        background: meta.bg,
        color: meta.color,
      }}>
        {label}
      </span>
    </div>
  )
}
