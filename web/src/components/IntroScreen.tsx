import { useEffect, useState } from 'react'

export default function IntroScreen({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<'in' | 'hold' | 'out'>('in')

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('hold'), 100)
    const t2 = setTimeout(() => setPhase('out'), 2800)
    const t3 = setTimeout(() => onDone(), 3500)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [onDone])

  const skip = () => {
    setPhase('out')
    setTimeout(onDone, 600)
  }

  const visible = phase !== 'in'
  const leaving = phase === 'out'

  return (
    <div
      onClick={skip}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: '#07100d',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
        opacity: leaving ? 0 : 1,
        transform: leaving ? 'scale(1.05)' : 'scale(1)',
        transition: leaving ? 'opacity 0.7s ease, transform 0.7s ease' : 'none',
        userSelect: 'none',
      }}
    >
      {/* Ambient glow */}
      <div style={{
        position: 'absolute', width: 500, height: 500,
        background: 'radial-gradient(circle, rgba(95,212,138,0.07) 0%, transparent 70%)',
        borderRadius: '50%', pointerEvents: 'none',
        opacity: visible ? 1 : 0,
        transition: 'opacity 1.2s ease',
      }} />

      {/* Brand mark */}
      <div style={{
        width: 88, height: 88, borderRadius: 22,
        background: 'linear-gradient(145deg, #1e6040 0%, #0f3525 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 46, fontFamily: 'var(--serif)', fontStyle: 'italic',
        color: '#7ee5a3',
        marginBottom: 28,
        boxShadow: '0 0 80px rgba(95,212,138,0.2), inset 0 1px 0 rgba(255,255,255,0.08)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'scale(1) translateY(0)' : 'scale(0.3) translateY(20px)',
        transition: 'opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1)',
      }}>
        J
      </div>

      {/* Name */}
      <div style={{
        fontFamily: 'var(--serif)', fontStyle: 'italic',
        fontSize: 52, color: '#f1f0e9',
        letterSpacing: '-0.5px', marginBottom: 12,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(16px)',
        transition: 'opacity 0.6s ease 0.25s, transform 0.6s ease 0.25s',
      }}>
        Julius
      </div>

      {/* Tagline */}
      <div style={{
        fontSize: 11, color: '#5fd48a',
        letterSpacing: '0.22em', textTransform: 'uppercase',
        fontFamily: 'var(--mono)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.6s ease 0.55s',
      }}>
        Algorithmic Trading Research
      </div>

      {/* Divider */}
      <div style={{
        width: visible ? 60 : 0, height: 1,
        background: 'rgba(95,212,138,0.25)',
        marginTop: 32, marginBottom: 32,
        transition: 'width 0.8s cubic-bezier(0.16,1,0.3,1) 0.5s',
      }} />

      {/* Stats row */}
      <div style={{
        display: 'flex', gap: 40,
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.6s ease 0.75s',
      }}>
        {[
          { label: 'Strategies', value: '8+' },
          { label: 'Data source', value: 'yFinance' },
          { label: 'AI engine', value: 'LangGraph' },
        ].map(({ label, value }) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontFamily: 'var(--mono)', fontWeight: 600, color: '#f1f0e9', marginBottom: 4 }}>
              {value}
            </div>
            <div style={{ fontSize: 10, color: '#4a6458', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Skip hint */}
      <div style={{
        position: 'absolute', bottom: 28,
        fontSize: 11, color: '#2a3d33',
        fontFamily: 'var(--mono)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.6s ease 1.2s',
      }}>
        click anywhere to continue
      </div>
    </div>
  )
}
