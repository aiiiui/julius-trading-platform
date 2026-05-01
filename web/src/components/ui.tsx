import { useState, useEffect, useCallback, useMemo } from 'react'
import type { ToastItem } from '../types'

// ── Icon primitive ────────────────────────────────────────────────────────────

interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number
  sw?: number
  d?: string
}

function Icon({ d, size = 16, sw = 1.5, children, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={sw}
         strokeLinecap="round" strokeLinejoin="round" {...rest}>
      {d ? <path d={d} /> : children}
    </svg>
  )
}

export const Icons = {
  Pie:    (p: IconProps) => <Icon {...p}><path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M21 12a9 9 0 0 0-9-9v9z"/></Icon>,
  Scale:  (p: IconProps) => <Icon {...p}><path d="M3 6h18"/><path d="M16 3l2 3"/><path d="M8 3 6 6"/><path d="m3 11 3-5 3 5"/><path d="m15 11 3-5 3 5"/><path d="M3 11a3 3 0 0 0 6 0"/><path d="M15 11a3 3 0 0 0 6 0"/><path d="M12 3v18"/><path d="M8 21h8"/></Icon>,
  Brain:  (p: IconProps) => <Icon {...p}><path d="M12 4.5a2.5 2.5 0 0 0-4.96-.46 2.5 2.5 0 0 0-1.98 3 2.5 2.5 0 0 0-1.32 4.24 2.5 2.5 0 0 0 1.32 4.24 2.5 2.5 0 0 0 1.98 3A2.5 2.5 0 0 0 12 19.5z"/><path d="M12 4.5a2.5 2.5 0 0 1 4.96-.46 2.5 2.5 0 0 1 1.98 3 2.5 2.5 0 0 1 1.32 4.24 2.5 2.5 0 0 1-1.32 4.24 2.5 2.5 0 0 1-1.98 3A2.5 2.5 0 0 1 12 19.5z"/></Icon>,
  Thermo: (p: IconProps) => <Icon {...p}><path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 1 1 4 0Z"/></Icon>,
  Pulse:  (p: IconProps) => <Icon {...p}><path d="M22 12h-4l-3 9-6-18-3 9H2"/></Icon>,
  Search: (p: IconProps) => <Icon {...p}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></Icon>,
  Bell:   (p: IconProps) => <Icon {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></Icon>,
  Settings:(p: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06.06A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9"/></Icon>,
  Sun:    (p: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></Icon>,
  Moon:   (p: IconProps) => <Icon {...p} d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>,
  Up:     (p: IconProps) => <Icon {...p} d="m6 15 6-6 6 6"/>,
  Down:   (p: IconProps) => <Icon {...p} d="m6 9 6 6 6-6"/>,
  ArrowUpRight:   (p: IconProps) => <Icon {...p}><path d="M7 17 17 7"/><path d="M7 7h10v10"/></Icon>,
  ArrowDownRight: (p: IconProps) => <Icon {...p}><path d="M7 7l10 10"/><path d="M17 7v10H7"/></Icon>,
  Refresh: (p: IconProps) => <Icon {...p}><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></Icon>,
  Plus:    (p: IconProps) => <Icon {...p}><path d="M12 5v14M5 12h14"/></Icon>,
  X:       (p: IconProps) => <Icon {...p}><path d="M18 6 6 18M6 6l12 12"/></Icon>,
  Filter:  (p: IconProps) => <Icon {...p}><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/></Icon>,
  Download:(p: IconProps) => <Icon {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></Icon>,
  Play:    (p: IconProps) => <Icon {...p}><polygon points="5 3 19 12 5 21 5 3"/></Icon>,
  Calendar:(p: IconProps) => <Icon {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></Icon>,
  TrendUp: (p: IconProps) => <Icon {...p}><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></Icon>,
  Layers:  (p: IconProps) => <Icon {...p}><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></Icon>,
  Wallet:  (p: IconProps) => <Icon {...p}><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></Icon>,
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

export function Sparkline({ data, width = 80, height = 24, color, fill = true }: {
  data: number[]; width?: number; height?: number; color?: string; fill?: boolean
}) {
  const id = useMemo(() => 'spk' + Math.random().toString(36).slice(2, 8), [])
  if (!data || !data.length) return null
  const min = Math.min(...data), max = Math.max(...data)
  const range = max - min || 1
  const stepX = width / (data.length - 1)
  const pts = data.map((v, i) => `${(i * stepX).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`).join(' ')
  const up = data[data.length - 1] >= data[0]
  const c = color || (up ? 'var(--up)' : 'var(--down)')
  return (
    <svg className="sparkline" width={width} height={height} preserveAspectRatio="none">
      {fill && (
        <>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c} stopOpacity="0.25"/>
              <stop offset="100%" stopColor={c} stopOpacity="0"/>
            </linearGradient>
          </defs>
          <polygon fill={`url(#${id})`} points={`0,${height} ${pts} ${width},${height}`}/>
        </>
      )}
      <polyline fill="none" stroke={c} strokeWidth="1.5" points={pts} strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

// ── Formatters ────────────────────────────────────────────────────────────────

export const fmt = {
  pct:       (v: number | null, signed = true) => v == null || isNaN(v) ? '—' : `${signed && v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`,
  pctDelta:  (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`,
  money:     (v: number | null, decimals = 2) => v == null || isNaN(v) ? '—' : '€' + v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
  num:       (v: number | null, decimals = 2) => v == null || isNaN(v) ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
  int:       (v: number | null) => v == null || isNaN(v) ? '—' : Math.round(v).toLocaleString('en-US'),
  pctSimple: (v: number | null) => v == null || isNaN(v) ? '—' : `${(v * 100).toFixed(0)}%`,
}

// ── Delta pill ────────────────────────────────────────────────────────────────

export function Delta({ value, suffix = '%', size = 'md' }: { value: number | null; suffix?: string; size?: 'md' | 'lg' }) {
  if (value == null || isNaN(value)) return <span className="muted">—</span>
  const up = value >= 0
  return (
    <span className={`pill ${up ? 'up' : 'down'}`} style={size === 'lg' ? { fontSize: 12, padding: '3px 8px' } : undefined}>
      {up ? '↑' : '↓'} {Math.abs(value).toFixed(2)}{suffix}
    </span>
  )
}

// ── Signal pill ───────────────────────────────────────────────────────────────

export function SignalPill({ signal }: { signal: string }) {
  const s = (signal || '').toLowerCase()
  return <span className={`signal-pill ${s}`}>{signal}</span>
}

// ── Toast ─────────────────────────────────────────────────────────────────────

export function useToasts() {
  const [items, setItems] = useState<ToastItem[]>([])
  const push = useCallback((t: Omit<ToastItem, 'id'>) => {
    const id = Math.random().toString(36).slice(2)
    setItems(arr => [...arr, { id, ...t }])
    setTimeout(() => setItems(arr => arr.filter(x => x.id !== id)), 2800)
  }, [])
  const node = (
    <div className="toast-wrap">
      {items.map(t => <div key={t.id} className={`toast ${t.kind || ''}`}>{t.msg}</div>)}
    </div>
  )
  return { push, node }
}

// ── Strategy color palette ────────────────────────────────────────────────────

const PALETTE = ['#0a5c2f', '#3b82f6', '#c47a18', '#8b5cf6', '#0891b2', '#dc2626', '#475569']
export const stratColor = (i: number) => PALETTE[i % PALETTE.length]

// ── Ticker metadata ───────────────────────────────────────────────────────────

export const TICKER_META: Record<string, { name: string; sector: string }> = {
  // Technology
  AAPL: { name: 'Apple Inc.',          sector: 'Technology' },
  MSFT: { name: 'Microsoft Corp.',     sector: 'Technology' },
  NVDA: { name: 'NVIDIA Corp.',        sector: 'Technology' },
  GOOGL: { name: 'Alphabet Inc.',      sector: 'Technology' },
  META: { name: 'Meta Platforms',      sector: 'Technology' },
  AMZN: { name: 'Amazon.com Inc.',     sector: 'Technology' },
  TSLA: { name: 'Tesla Inc.',          sector: 'Technology' },
  AMD:  { name: 'AMD',                 sector: 'Technology' },
  INTC: { name: 'Intel Corp.',         sector: 'Technology' },
  QCOM: { name: 'Qualcomm Inc.',       sector: 'Technology' },
  CSCO: { name: 'Cisco Systems',       sector: 'Technology' },
  ADBE: { name: 'Adobe Inc.',          sector: 'Technology' },
  NFLX: { name: 'Netflix Inc.',        sector: 'Technology' },
  CRM:  { name: 'Salesforce Inc.',     sector: 'Technology' },
  ORCL: { name: 'Oracle Corp.',        sector: 'Technology' },
  UBER: { name: 'Uber Technologies',   sector: 'Technology' },
  ABNB: { name: 'Airbnb Inc.',         sector: 'Technology' },
  COIN: { name: 'Coinbase Global',     sector: 'Technology' },
  SNOW: { name: 'Snowflake Inc.',      sector: 'Technology' },
  PLTR: { name: 'Palantir Tech.',      sector: 'Technology' },
  PYPL: { name: 'PayPal Holdings',     sector: 'Technology' },
  // Financials
  JPM:  { name: 'JPMorgan Chase',      sector: 'Financials' },
  BAC:  { name: 'Bank of America',     sector: 'Financials' },
  GS:   { name: 'Goldman Sachs',       sector: 'Financials' },
  MS:   { name: 'Morgan Stanley',      sector: 'Financials' },
  BLK:  { name: 'BlackRock',           sector: 'Financials' },
  V:    { name: 'Visa Inc.',           sector: 'Financials' },
  MA:   { name: 'Mastercard',          sector: 'Financials' },
  AXP:  { name: 'American Express',    sector: 'Financials' },
  WFC:  { name: 'Wells Fargo',         sector: 'Financials' },
  C:    { name: 'Citigroup Inc.',      sector: 'Financials' },
  SCHW: { name: 'Charles Schwab',      sector: 'Financials' },
  // Energy
  XOM:  { name: 'Exxon Mobil',         sector: 'Energy' },
  CVX:  { name: 'Chevron Corp.',       sector: 'Energy' },
  COP:  { name: 'ConocoPhillips',      sector: 'Energy' },
  SLB:  { name: 'Schlumberger',        sector: 'Energy' },
  PSX:  { name: 'Phillips 66',         sector: 'Energy' },
  EOG:  { name: 'EOG Resources',       sector: 'Energy' },
  OXY:  { name: 'Occidental Pet.',     sector: 'Energy' },
  MPC:  { name: 'Marathon Petroleum',  sector: 'Energy' },
  // Healthcare
  JNJ:  { name: 'Johnson & Johnson',   sector: 'Healthcare' },
  UNH:  { name: 'UnitedHealth Group',  sector: 'Healthcare' },
  PFE:  { name: 'Pfizer Inc.',         sector: 'Healthcare' },
  ABBV: { name: 'AbbVie Inc.',         sector: 'Healthcare' },
  MRK:  { name: 'Merck & Co.',         sector: 'Healthcare' },
  LLY:  { name: 'Eli Lilly & Co.',     sector: 'Healthcare' },
  ABT:  { name: 'Abbott Labs',         sector: 'Healthcare' },
  TMO:  { name: 'Thermo Fisher',       sector: 'Healthcare' },
  BMY:  { name: 'Bristol-Myers Squibb',sector: 'Healthcare' },
  // Consumer
  PG:   { name: 'Procter & Gamble',    sector: 'Consumer' },
  KO:   { name: 'Coca-Cola Co.',       sector: 'Consumer' },
  PEP:  { name: 'PepsiCo Inc.',        sector: 'Consumer' },
  WMT:  { name: 'Walmart Inc.',        sector: 'Consumer' },
  COST: { name: 'Costco Wholesale',    sector: 'Consumer' },
  HD:   { name: 'Home Depot',          sector: 'Consumer' },
  MCD:  { name: "McDonald's Corp.",    sector: 'Consumer' },
  NKE:  { name: 'Nike Inc.',           sector: 'Consumer' },
  SBUX: { name: 'Starbucks Corp.',     sector: 'Consumer' },
  // Industrials
  BA:   { name: 'Boeing Co.',          sector: 'Industrials' },
  CAT:  { name: 'Caterpillar Inc.',    sector: 'Industrials' },
  GE:   { name: 'GE Aerospace',        sector: 'Industrials' },
  HON:  { name: 'Honeywell Intl.',     sector: 'Industrials' },
  RTX:  { name: 'RTX Corp.',           sector: 'Industrials' },
  UPS:  { name: 'United Parcel Svc.',  sector: 'Industrials' },
  // Utilities
  NEE:  { name: 'NextEra Energy',      sector: 'Utilities' },
  DUK:  { name: 'Duke Energy',         sector: 'Utilities' },
  SO:   { name: 'Southern Company',    sector: 'Utilities' },
}

// ── useInterval ───────────────────────────────────────────────────────────────

export function useInterval(fn: () => void, delay: number | null) {
  useEffect(() => {
    if (delay === null) return
    const id = setInterval(fn, delay)
    return () => clearInterval(id)
  }, [fn, delay])
}
