import { useState, useEffect, useRef } from 'react'
import { searchTickers } from '../api'
import type { TickerSuggestion } from '../api'

const TYPE_LABEL: Record<string, string> = {
  EQUITY: 'Stock', ETF: 'ETF', CRYPTOCURRENCY: 'Crypto',
  FUTURE: 'Future', INDEX: 'Index', MUTUALFUND: 'Fund',
}

interface Props {
  tickers: string[]
  onChange: (tickers: string[]) => void
}

export default function TickerTagInput({ tickers, onChange }: Props) {
  const [input,    setInput]    = useState('')
  const [results,  setResults]  = useState<TickerSuggestion[]>([])
  const [open,     setOpen]     = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [focused,  setFocused]  = useState(0)
  const wrapRef  = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Debounced search
  useEffect(() => {
    if (!input.trim()) { setResults([]); setOpen(false); return }
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await searchTickers(input.trim())
        setResults(res)
        setOpen(res.length > 0)
        setFocused(0)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 280)
    return () => clearTimeout(t)
  }, [input])

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const add = (sym: string) => {
    const upper = sym.toUpperCase().trim()
    if (upper && !tickers.includes(upper)) onChange([...tickers, upper])
    setInput('')
    setResults([])
    setOpen(false)
    inputRef.current?.focus()
  }

  const remove = (sym: string) => onChange(tickers.filter(t => t !== sym))

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (open && results.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setFocused(f => Math.min(f + 1, results.length - 1)); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setFocused(f => Math.max(f - 1, 0)); return }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        add(results[focused].symbol)
        return
      }
    }
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      // Bulk paste: split on comma/space and add all
      const syms = input.split(/[\s,]+/).map(s => s.trim()).filter(Boolean)
      if (syms.length) {
        const next = [...new Set([...tickers, ...syms.map(s => s.toUpperCase())])]
        onChange(next)
        setInput('')
        setResults([])
        setOpen(false)
      }
    }
    if (e.key === 'Backspace' && input === '' && tickers.length > 0) {
      onChange(tickers.slice(0, -1))
    }
    if (e.key === 'Escape') { setOpen(false) }
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {/* Tag chips + input in one box */}
      <div
        onClick={() => inputRef.current?.focus()}
        style={{
          display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center',
          padding: '6px 8px', minHeight: 40,
          border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
          background: 'var(--bg)', cursor: 'text',
        }}>
        {tickers.map(t => (
          <span key={t} style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '2px 6px 2px 8px', borderRadius: 4,
            background: 'var(--accent-soft)', color: 'var(--accent-text)',
            border: '1px solid var(--accent)', fontSize: 11,
            fontFamily: 'var(--mono)', fontWeight: 600, lineHeight: 1.6,
          }}>
            {t}
            <button
              onMouseDown={e => { e.preventDefault(); remove(t) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 1px', color: 'inherit', opacity: 0.6, fontSize: 13, lineHeight: 1 }}>
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value.toUpperCase())}
          onKeyDown={onKeyDown}
          onFocus={() => input && setOpen(results.length > 0)}
          placeholder={tickers.length === 0 ? 'Type any ticker — AAPL, BTC-USD, 7203.T…' : ''}
          style={{
            flex: '1 1 120px', minWidth: 100, border: 'none', outline: 'none',
            background: 'transparent', fontFamily: 'var(--mono)', fontWeight: 600,
            fontSize: 12, color: 'var(--text)',
          }}
        />
        {loading && (
          <span style={{ fontSize: 10, color: 'var(--text-subtle)', marginLeft: 4 }}>…</span>
        )}
      </div>

      {/* Dropdown */}
      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 300,
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden',
        }}>
          {results.map((r, i) => (
            <div key={r.symbol}
              onMouseDown={e => { e.preventDefault(); add(r.symbol) }}
              onMouseEnter={() => setFocused(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 12px', cursor: 'pointer',
                background: i === focused ? 'var(--bg-hover)' : 'transparent',
                borderBottom: '1px solid var(--border)',
              }}>
              <span style={{ fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 13, minWidth: 72, color: 'var(--text)' }}>
                {r.symbol}
              </span>
              <span style={{ flex: 1, fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.name}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-subtle)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
                {r.exchange}
              </span>
              {r.type && (
                <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'var(--bg-subtle)', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                  {TYPE_LABEL[r.type] ?? r.type}
                </span>
              )}
            </div>
          ))}
          <div style={{ padding: '4px 12px', fontSize: 10, color: 'var(--text-subtle)', background: 'var(--bg-subtle)' }}>
            ↑↓ navigate · Enter or click to add · Esc close
          </div>
        </div>
      )}
    </div>
  )
}
