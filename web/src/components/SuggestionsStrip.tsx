import { useState, useMemo } from 'react'
import { Sparkline } from './ui'
import { getSuggestions, STOCK_DB } from '../lib/stockMeta'

const TABS = [
  { key: 'sector',    label: 'Sector Peers',    icon: '🏭', desc: 'Same industry group'    },
  { key: 'mcap',      label: 'Market Cap',       icon: '📊', desc: 'Similar size companies'  },
  { key: 'highVol',   label: 'High Volatility',  icon: '⚡', desc: 'High-beta active movers' },
  { key: 'lowVol',    label: 'Low Volatility',   icon: '🛡', desc: 'Stable, steady movers'   },
  { key: 'defensive', label: 'Defensive',        icon: '🏰', desc: 'Crisis-resilient names'   },
] as const

type Tab = typeof TABS[number]['key']

interface Props {
  symbol: string
  onSelect: (sym: string) => void
  prices?:  Record<string, number>
  changes?: Record<string, number>
  spark?:   Record<string, number[]>
}

export default function SuggestionsStrip({
  symbol, onSelect,
  prices = {}, changes = {}, spark = {},
}: Props) {
  const [tab, setTab] = useState<Tab>('sector')
  const suggestions   = useMemo(() => getSuggestions(symbol), [symbol])
  const list          = suggestions[tab] ?? []
  const activeTab     = TABS.find(t => t.key === tab)!

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div className="card-header">
        <div>
          <h3 className="card-title">Smart suggestions · {symbol}</h3>
          <p className="card-subtitle">{activeTab.icon} {activeTab.desc} — click any card to switch analysis focus</p>
        </div>
        <div className="subtabs" style={{ flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t.key} className={`subtab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ padding: '16px 20px', overflowX: 'auto' }}>
        <div style={{ display: 'flex', gap: 12 }}>
          {list.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '12px 0' }}>No suggestions for this category.</div>
          ) : list.map(sym => {
            const info  = STOCK_DB[sym]
            const price = prices[sym]
            const chg   = changes[sym]
            const p     = spark[sym]
            return (
              <div key={sym} onClick={() => onSelect(sym)}
                style={{
                  minWidth: 156, padding: '12px 14px',
                  border: `1px solid ${sym === symbol ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius)', cursor: 'pointer',
                  background: 'var(--bg-elevated)', flexShrink: 0,
                  transition: 'all 0.15s',
                }}
                className="ss-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 14 }}>{sym}</span>
                  {chg != null && (
                    <span style={{ fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 600, color: chg >= 0 ? 'var(--up)' : 'var(--down)' }}>
                      {chg >= 0 ? '+' : ''}{chg.toFixed(2)}%
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {info?.name}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <div>
                    {price != null ? (
                      <div className="mono" style={{ fontSize: 13, marginBottom: 3 }}>${price.toFixed(2)}</div>
                    ) : (
                      <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginBottom: 3 }}>{info?.industry ?? ''}</div>
                    )}
                    <div style={{ display: 'flex', gap: 3 }}>
                      {info?.vol && (
                        <span style={{
                          fontSize: 9, padding: '1px 5px', borderRadius: 3, fontFamily: 'var(--mono)', fontWeight: 500,
                          background: info.vol === 'high' ? 'var(--down-soft)' : info.vol === 'low' ? 'var(--up-soft)' : 'var(--bg-subtle)',
                          color:      info.vol === 'high' ? 'var(--down)'      : info.vol === 'low' ? 'var(--up)'      : 'var(--text-muted)',
                        }}>{info.vol} vol</span>
                      )}
                      {info?.defensive && (
                        <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, fontFamily: 'var(--mono)', fontWeight: 500, background: 'var(--accent-soft)', color: 'var(--accent-text)' }}>defensive</span>
                      )}
                    </div>
                  </div>
                  {p && p.length > 0 && <Sparkline data={p.slice(-20)} width={48} height={26}/>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <style>{`.ss-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); border-color: var(--border-strong) !important; }`}</style>
    </div>
  )
}
