// Stock classification database + suggestion engine

export type McapTier = 'mega' | 'large' | 'mid'
export type VolTier  = 'high' | 'medium' | 'low'

export interface StockInfo {
  name:      string
  sector:    string
  industry:  string
  mcap:      McapTier
  vol:       VolTier
  defensive: boolean
  exchange:  string
}

export const STOCK_DB: Record<string, StockInfo> = {
  // ── Technology ────────────────────────────────────────────────────────────
  AAPL: { name:'Apple Inc.',          sector:'Technology',   industry:'Consumer Electronics',  mcap:'mega',  vol:'low',    defensive:false, exchange:'NASDAQ' },
  MSFT: { name:'Microsoft Corp.',     sector:'Technology',   industry:'Software',              mcap:'mega',  vol:'low',    defensive:false, exchange:'NASDAQ' },
  NVDA: { name:'NVIDIA Corp.',        sector:'Technology',   industry:'Semiconductors',        mcap:'mega',  vol:'high',   defensive:false, exchange:'NASDAQ' },
  GOOGL:{ name:'Alphabet Inc.',       sector:'Technology',   industry:'Internet Services',     mcap:'mega',  vol:'medium', defensive:false, exchange:'NASDAQ' },
  META: { name:'Meta Platforms',      sector:'Technology',   industry:'Social Media',          mcap:'mega',  vol:'medium', defensive:false, exchange:'NASDAQ' },
  AMZN: { name:'Amazon.com Inc.',     sector:'Technology',   industry:'E-Commerce/Cloud',      mcap:'mega',  vol:'medium', defensive:false, exchange:'NASDAQ' },
  TSLA: { name:'Tesla Inc.',          sector:'Technology',   industry:'Electric Vehicles',     mcap:'mega',  vol:'high',   defensive:false, exchange:'NASDAQ' },
  AMD:  { name:'Advanced Micro Devices',sector:'Technology', industry:'Semiconductors',        mcap:'large', vol:'high',   defensive:false, exchange:'NASDAQ' },
  INTC: { name:'Intel Corp.',         sector:'Technology',   industry:'Semiconductors',        mcap:'large', vol:'medium', defensive:false, exchange:'NASDAQ' },
  QCOM: { name:'Qualcomm Inc.',       sector:'Technology',   industry:'Semiconductors',        mcap:'large', vol:'medium', defensive:false, exchange:'NASDAQ' },
  CSCO: { name:'Cisco Systems',       sector:'Technology',   industry:'Networking',            mcap:'large', vol:'low',    defensive:false, exchange:'NASDAQ' },
  ADBE: { name:'Adobe Inc.',          sector:'Technology',   industry:'Design Software',       mcap:'large', vol:'medium', defensive:false, exchange:'NASDAQ' },
  NFLX: { name:'Netflix Inc.',        sector:'Technology',   industry:'Streaming',             mcap:'large', vol:'medium', defensive:false, exchange:'NASDAQ' },
  CRM:  { name:'Salesforce Inc.',     sector:'Technology',   industry:'CRM Software',          mcap:'large', vol:'medium', defensive:false, exchange:'NASDAQ' },
  ORCL: { name:'Oracle Corp.',        sector:'Technology',   industry:'Enterprise Software',   mcap:'large', vol:'low',    defensive:false, exchange:'NASDAQ' },
  UBER: { name:'Uber Technologies',   sector:'Technology',   industry:'Ride-Hailing',          mcap:'mid',   vol:'high',   defensive:false, exchange:'NYSE'   },
  ABNB: { name:'Airbnb Inc.',         sector:'Technology',   industry:'Travel Tech',           mcap:'mid',   vol:'high',   defensive:false, exchange:'NASDAQ' },
  COIN: { name:'Coinbase Global',     sector:'Technology',   industry:'Crypto Exchange',       mcap:'mid',   vol:'high',   defensive:false, exchange:'NASDAQ' },
  SNOW: { name:'Snowflake Inc.',      sector:'Technology',   industry:'Cloud Data',            mcap:'mid',   vol:'high',   defensive:false, exchange:'NYSE'   },
  PLTR: { name:'Palantir Tech.',      sector:'Technology',   industry:'AI / Data Analytics',   mcap:'mid',   vol:'high',   defensive:false, exchange:'NYSE'   },
  PYPL: { name:'PayPal Holdings',     sector:'Technology',   industry:'Fintech Payments',      mcap:'large', vol:'high',   defensive:false, exchange:'NASDAQ' },
  // ── Financials ────────────────────────────────────────────────────────────
  JPM:  { name:'JPMorgan Chase',      sector:'Financials',   industry:'Diversified Banking',   mcap:'mega',  vol:'medium', defensive:false, exchange:'NYSE'   },
  BAC:  { name:'Bank of America',     sector:'Financials',   industry:'Diversified Banking',   mcap:'mega',  vol:'medium', defensive:false, exchange:'NYSE'   },
  GS:   { name:'Goldman Sachs',       sector:'Financials',   industry:'Investment Banking',    mcap:'large', vol:'high',   defensive:false, exchange:'NYSE'   },
  MS:   { name:'Morgan Stanley',      sector:'Financials',   industry:'Investment Banking',    mcap:'large', vol:'high',   defensive:false, exchange:'NYSE'   },
  BLK:  { name:'BlackRock',           sector:'Financials',   industry:'Asset Management',      mcap:'large', vol:'medium', defensive:false, exchange:'NYSE'   },
  V:    { name:'Visa Inc.',           sector:'Financials',   industry:'Payment Networks',      mcap:'mega',  vol:'low',    defensive:false, exchange:'NYSE'   },
  MA:   { name:'Mastercard',          sector:'Financials',   industry:'Payment Networks',      mcap:'mega',  vol:'low',    defensive:false, exchange:'NYSE'   },
  AXP:  { name:'American Express',    sector:'Financials',   industry:'Payment Networks',      mcap:'large', vol:'medium', defensive:false, exchange:'NYSE'   },
  WFC:  { name:'Wells Fargo',         sector:'Financials',   industry:'Diversified Banking',   mcap:'large', vol:'medium', defensive:false, exchange:'NYSE'   },
  C:    { name:'Citigroup Inc.',      sector:'Financials',   industry:'Diversified Banking',   mcap:'large', vol:'medium', defensive:false, exchange:'NYSE'   },
  SCHW: { name:'Charles Schwab',      sector:'Financials',   industry:'Brokerage',             mcap:'large', vol:'high',   defensive:false, exchange:'NYSE'   },
  // ── Energy ───────────────────────────────────────────────────────────────
  XOM:  { name:'Exxon Mobil',         sector:'Energy',       industry:'Integrated Oil & Gas',  mcap:'mega',  vol:'medium', defensive:false, exchange:'NYSE'   },
  CVX:  { name:'Chevron Corp.',       sector:'Energy',       industry:'Integrated Oil & Gas',  mcap:'mega',  vol:'medium', defensive:false, exchange:'NYSE'   },
  COP:  { name:'ConocoPhillips',      sector:'Energy',       industry:'E&P',                   mcap:'large', vol:'medium', defensive:false, exchange:'NYSE'   },
  SLB:  { name:'Schlumberger',        sector:'Energy',       industry:'Oilfield Services',     mcap:'large', vol:'high',   defensive:false, exchange:'NYSE'   },
  PSX:  { name:'Phillips 66',         sector:'Energy',       industry:'Refining',              mcap:'large', vol:'medium', defensive:false, exchange:'NYSE'   },
  EOG:  { name:'EOG Resources',       sector:'Energy',       industry:'E&P',                   mcap:'large', vol:'medium', defensive:false, exchange:'NYSE'   },
  OXY:  { name:'Occidental Pet.',     sector:'Energy',       industry:'E&P',                   mcap:'large', vol:'high',   defensive:false, exchange:'NYSE'   },
  MPC:  { name:'Marathon Petroleum',  sector:'Energy',       industry:'Refining',              mcap:'large', vol:'medium', defensive:false, exchange:'NYSE'   },
  // ── Healthcare ────────────────────────────────────────────────────────────
  JNJ:  { name:'Johnson & Johnson',   sector:'Healthcare',   industry:'Pharma / Consumer',     mcap:'mega',  vol:'low',    defensive:true,  exchange:'NYSE'   },
  UNH:  { name:'UnitedHealth Group',  sector:'Healthcare',   industry:'Managed Care',          mcap:'mega',  vol:'medium', defensive:true,  exchange:'NYSE'   },
  PFE:  { name:'Pfizer Inc.',         sector:'Healthcare',   industry:'Pharmaceuticals',       mcap:'large', vol:'low',    defensive:true,  exchange:'NYSE'   },
  ABBV: { name:'AbbVie Inc.',         sector:'Healthcare',   industry:'Pharmaceuticals',       mcap:'large', vol:'low',    defensive:true,  exchange:'NYSE'   },
  MRK:  { name:'Merck & Co.',         sector:'Healthcare',   industry:'Pharmaceuticals',       mcap:'large', vol:'low',    defensive:true,  exchange:'NYSE'   },
  LLY:  { name:'Eli Lilly & Co.',     sector:'Healthcare',   industry:'Pharmaceuticals',       mcap:'mega',  vol:'high',   defensive:true,  exchange:'NYSE'   },
  ABT:  { name:'Abbott Labs',         sector:'Healthcare',   industry:'Medical Devices',       mcap:'large', vol:'low',    defensive:true,  exchange:'NYSE'   },
  TMO:  { name:'Thermo Fisher',       sector:'Healthcare',   industry:'Life Sciences',         mcap:'large', vol:'medium', defensive:true,  exchange:'NYSE'   },
  BMY:  { name:'Bristol-Myers Squibb',sector:'Healthcare',   industry:'Pharmaceuticals',       mcap:'large', vol:'low',    defensive:true,  exchange:'NYSE'   },
  // ── Consumer ─────────────────────────────────────────────────────────────
  PG:   { name:'Procter & Gamble',    sector:'Consumer',     industry:'Consumer Staples',      mcap:'mega',  vol:'low',    defensive:true,  exchange:'NYSE'   },
  KO:   { name:'Coca-Cola Co.',       sector:'Consumer',     industry:'Beverages',             mcap:'mega',  vol:'low',    defensive:true,  exchange:'NYSE'   },
  PEP:  { name:'PepsiCo Inc.',        sector:'Consumer',     industry:'Beverages',             mcap:'mega',  vol:'low',    defensive:true,  exchange:'NASDAQ' },
  WMT:  { name:'Walmart Inc.',        sector:'Consumer',     industry:'Retail',                mcap:'mega',  vol:'low',    defensive:true,  exchange:'NYSE'   },
  COST: { name:'Costco Wholesale',    sector:'Consumer',     industry:'Retail',                mcap:'mega',  vol:'low',    defensive:true,  exchange:'NASDAQ' },
  HD:   { name:'Home Depot',          sector:'Consumer',     industry:'Home Improvement',      mcap:'mega',  vol:'medium', defensive:false, exchange:'NYSE'   },
  MCD:  { name:"McDonald's Corp.",    sector:'Consumer',     industry:'Fast Food',             mcap:'large', vol:'low',    defensive:true,  exchange:'NYSE'   },
  NKE:  { name:'Nike Inc.',           sector:'Consumer',     industry:'Apparel',               mcap:'large', vol:'medium', defensive:false, exchange:'NYSE'   },
  SBUX: { name:'Starbucks Corp.',     sector:'Consumer',     industry:'Restaurants',           mcap:'large', vol:'medium', defensive:false, exchange:'NASDAQ' },
  // ── Industrials ──────────────────────────────────────────────────────────
  BA:   { name:'Boeing Co.',          sector:'Industrials',  industry:'Aerospace & Defense',   mcap:'large', vol:'high',   defensive:false, exchange:'NYSE'   },
  CAT:  { name:'Caterpillar Inc.',    sector:'Industrials',  industry:'Heavy Machinery',       mcap:'large', vol:'medium', defensive:false, exchange:'NYSE'   },
  GE:   { name:'GE Aerospace',        sector:'Industrials',  industry:'Aerospace & Defense',   mcap:'large', vol:'medium', defensive:false, exchange:'NYSE'   },
  HON:  { name:'Honeywell Intl.',     sector:'Industrials',  industry:'Conglomerate',          mcap:'large', vol:'medium', defensive:false, exchange:'NASDAQ' },
  RTX:  { name:'RTX Corp.',           sector:'Industrials',  industry:'Aerospace & Defense',   mcap:'large', vol:'medium', defensive:false, exchange:'NYSE'   },
  UPS:  { name:'United Parcel Svc.',  sector:'Industrials',  industry:'Logistics',             mcap:'large', vol:'medium', defensive:false, exchange:'NYSE'   },
  // ── Utilities ─────────────────────────────────────────────────────────────
  NEE:  { name:'NextEra Energy',      sector:'Utilities',    industry:'Electric Utilities',    mcap:'large', vol:'low',    defensive:true,  exchange:'NYSE'   },
  DUK:  { name:'Duke Energy',         sector:'Utilities',    industry:'Electric Utilities',    mcap:'large', vol:'low',    defensive:true,  exchange:'NYSE'   },
  SO:   { name:'Southern Company',    sector:'Utilities',    industry:'Electric Utilities',    mcap:'large', vol:'low',    defensive:true,  exchange:'NYSE'   },
}

// Deterministic Fisher-Yates based on a numeric seed
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr]
  let s = seed
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    const j = Math.abs(s) % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function symbolSeed(sym: string): number {
  return sym.split('').reduce((a, c, i) => a + c.charCodeAt(0) * (i + 1), 0)
}

export interface SuggestionSet {
  sector:    string[]
  mcap:      string[]
  highVol:   string[]
  lowVol:    string[]
  defensive: string[]
}

export function getSuggestions(symbol: string): SuggestionSet {
  const info = STOCK_DB[symbol]
  const all  = Object.keys(STOCK_DB).filter(s => s !== symbol)
  const seed = symbolSeed(symbol)

  return {
    sector:    seededShuffle(all.filter(s => STOCK_DB[s]?.sector   === info?.sector), seed).slice(0, 6),
    mcap:      seededShuffle(all.filter(s => STOCK_DB[s]?.mcap    === info?.mcap && STOCK_DB[s]?.sector !== info?.sector), seed + 1).slice(0, 6),
    highVol:   seededShuffle(all.filter(s => STOCK_DB[s]?.vol     === 'high'), seed + 2).slice(0, 6),
    lowVol:    seededShuffle(all.filter(s => STOCK_DB[s]?.vol     === 'low'),  seed + 3).slice(0, 6),
    defensive: seededShuffle(all.filter(s => STOCK_DB[s]?.defensive === true), seed + 4).slice(0, 6),
  }
}

export function searchStocks(query: string, limit = 8): [string, StockInfo][] {
  if (!query) return []
  const q = query.toUpperCase()
  return Object.entries(STOCK_DB)
    .filter(([sym, info]) =>
      sym.startsWith(q) ||
      sym.includes(q) ||
      info.name.toUpperCase().includes(q) ||
      info.industry.toUpperCase().includes(q)
    )
    .sort(([a], [b]) => {
      const aStarts = a.startsWith(q) ? 0 : 1
      const bStarts = b.startsWith(q) ? 0 : 1
      return aStarts - bStarts || a.localeCompare(b)
    })
    .slice(0, limit)
}
