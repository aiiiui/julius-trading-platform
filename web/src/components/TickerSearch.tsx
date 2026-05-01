import { useState, useEffect, useRef, useMemo } from 'react'
import { Icons } from './ui'
import { searchStocks } from '../lib/stockMeta'

interface Props {
  value: string
  onChange: (sym: string) => void
  prices?: Record<string, number>
  changes?: Record<string, number>
  placeholder?: string
  width?: number | string
}

export default function TickerSearch({
  value, onChange, prices = {}, changes = {},
  placeholder = 'Search any ticker or name…',
  width = 260,
}: Props) {
  const [query,   setQuery]  = useState(value)
  const [open,    setOpen]   = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const results = useMemo(() => searchStocks(query, 8), [query])

  useEffect(() => { setQuery(value) }, [value])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const select = (sym: string) => { onChange(sym); setQuery(sym); setOpen(false) }

  return (
    <div ref={wrapRef} style={{ position: 'relative', width }}>
      <div style={{ position: 'relative' }}>
        <Icons.Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)', pointerEvents: 'none' }}/>
        <input
          className="input"
          style={{ width: '100%', paddingLeft: 28, fontFamily: 'var(--mono)', fontWeight: 500, fontSize: 13 }}
          value={query}
          placeholder={placeholder}
          onChange={e => { setQuery(e.target.value.toUpperCase()); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => {
            if (e.key === 'Enter' && results.length > 0) select(results[0][0])
            if (e.key === 'Escape') setOpen(false)
          }}
        />
        {query && (
          <button onClick={() => { setQuery(''); setOpen(false) }} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
            <Icons.X size={12}/>
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-lg)', zIndex: 200, overflow: 'hidden' }}>
          {results.map(([sym, info]) => (
            <div key={sym} onMouseDown={() => select(sym)}
              style={{ padding: '7px 12px', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'center', borderBottom: '1px solid var(--border)' }}
              className="ts-row">
              <span style={{ fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 13, minWidth: 48 }}>{sym}</span>
              <span style={{ flex: 1, fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{info.name}</span>
              <span style={{ fontSize: 10, color: 'var(--text-subtle)', whiteSpace: 'nowrap', fontFamily: 'var(--mono)' }}>{info.sector}</span>
              {prices[sym] != null && (
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: (changes[sym] ?? 0) >= 0 ? 'var(--up)' : 'var(--down)', minWidth: 54, textAlign: 'right' }}>
                  ${prices[sym].toFixed(2)}
                </span>
              )}
            </div>
          ))}
          <div style={{ padding: '5px 12px', fontSize: 10, color: 'var(--text-subtle)', background: 'var(--bg-subtle)' }}>
            Any TradingView symbol — LVMH, BTC, 7203.T, SPY…
          </div>
        </div>
      )}
      <style>{`.ts-row:hover { background: var(--bg-hover) !important; }`}</style>
    </div>
  )
}
