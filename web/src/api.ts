import type {
  BacktestResponse, LivePricesResponse, IndexData,
  LiveSignal, Portfolio, Candle, RunSettings,
} from './types'

const BASE = '/api'

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

// ── Meta ──────────────────────────────────────────────────────────────────────

export async function fetchStrategies(): Promise<string[]> {
  const data = await get<{ strategies: string[] }>('/strategies')
  return data.strategies
}

export async function fetchTickers(): Promise<{ tickers: string[]; universe: Record<string, string[]> }> {
  return get('/tickers')
}

// ── Backtest ──────────────────────────────────────────────────────────────────

export async function runBacktest(s: RunSettings): Promise<BacktestResponse> {
  return post('/run_backtest', {
    tickers:      s.tickers,
    start:        s.start,
    end:          s.end,
    initial_cash: s.initial_cash,
    tc_pct:       s.tc_pct,
    strategies:   s.strategies,
    use_pairs:    s.use_pairs,
  })
}

export async function fetchRegimeTable(ticker: string): Promise<Record<string, unknown>[]> {
  return get(`/regime_table/${ticker}`)
}

// ── Live data ─────────────────────────────────────────────────────────────────

export async function fetchLivePrices(tickers: string[]): Promise<LivePricesResponse> {
  return get(`/live_prices?tickers=${tickers.join(',')}`)
}

export async function fetchIndices(): Promise<IndexData[]> {
  const data = await get<{ indices: IndexData[] }>('/indices')
  return data.indices
}

export async function fetchOHLCV(ticker: string, n = 80): Promise<{ candles: Candle[]; live_price: number }> {
  return get(`/ohlcv/${ticker}?n=${n}`)
}

export interface TickerSuggestion {
  symbol: string
  name: string
  exchange: string
  type: string
}

export async function searchTickers(q: string): Promise<TickerSuggestion[]> {
  if (!q) return []
  const data = await get<{ results: TickerSuggestion[] }>(`/search_tickers?q=${encodeURIComponent(q)}`)
  return data.results ?? []
}

// ── Signals ───────────────────────────────────────────────────────────────────

export async function fetchLiveSignals(
  tickers: string[],
  strategies: string[],
  params?: { rsi_period?: number; ema_fast?: number; ema_slow?: number },
): Promise<LiveSignal[]> {
  const data = await post<{ signals: LiveSignal[] }>('/live_signals', { tickers, strategies, params: params ?? {} })
  return data.signals
}

// ── AI Analysis ──────────────────────────────────────────────────────────────

export interface AIAnalysis {
  llm_used:          boolean
  overall_verdict:   string
  top_strategy:      string
  regime_insight:    string
  strategy_rankings: { name: string; score: number; rank: number }[]
  risk_flags:        string[]
  ticker_verdicts:   Record<string, { best_strategy: string; return: number; max_drawdown: number; risk_level: string }>
  raw_analysis:      string
  metrics_summary:   string
  regime_analysis:   string
}

export async function fetchAIAnalysis(openai_api_key?: string): Promise<AIAnalysis> {
  return post('/ai_analysis', { openai_api_key: openai_api_key ?? null })
}

// ── Portfolio ─────────────────────────────────────────────────────────────────

export async function fetchPortfolio(): Promise<Portfolio | null> {
  const data = await get<{ portfolio: Portfolio | null }>('/portfolio')
  return data.portfolio
}

export async function initPortfolio(cash: number, tcPct: number): Promise<Portfolio> {
  const data = await post<{ portfolio: Portfolio }>('/portfolio/init', { cash, tc_pct: tcPct })
  return data.portfolio
}

export async function placeOrder(sym: string, action: string, qty: number): Promise<{ portfolio: Portfolio; msg: string; price: number }> {
  return post('/portfolio/order', { sym, action, qty })
}

export async function resetPortfolio(): Promise<void> {
  await post('/portfolio/reset', {})
}

// ── Fundamentals ──────────────────────────────────────────────────────────────

export interface FundamentalData {
  ticker:          string
  sector:          string
  industry:        string
  pe:              number | null
  forward_pe:      number | null
  pb:              number | null
  peg:             number | null
  ev_ebitda:       number | null
  ps:              number | null
  eps:             number | null
  div_yield:       number | null
  beta:            number | null
  short_float:     number | null
  market_cap:      number | null
  analyst_target:  number | null
  upside_pct:      number | null
  valuation_label: 'Buy Now' | 'Good Price' | 'Fair' | 'High' | 'Expensive' | 'Unknown'
  valuation_score: number   // 0 = cheap, 100 = expensive
}

export async function fetchFundamentals(tickers: string[]): Promise<FundamentalData[]> {
  const data = await get<{ fundamentals: FundamentalData[] }>(`/fundamentals?tickers=${tickers.join(',')}`)
  return data.fundamentals
}

// ── News & Sentiment ──────────────────────────────────────────────────────────

export interface NewsItem {
  title:        string
  summary:      string
  source:       string
  url:          string
  published:    number
  ticker:       string | null
  sentiment:    { compound: number; label: 'positive' | 'negative' | 'neutral'; pos: number; neg: number }
  credibility:  number
  impact_score: number
}

export interface SentimentSummary {
  label:    'Bullish' | 'Bearish' | 'Neutral'
  score:    number
  positive: number
  negative: number
  neutral:  number
}

export async function fetchNews(tickers: string[], limit = 30): Promise<{ news: NewsItem[]; sentiment_summary: SentimentSummary }> {
  return get(`/news?tickers=${tickers.join(',')}&limit=${limit}`)
}

// ── AutoDev Agent ─────────────────────────────────────────────────────────────

export interface AutoDevResult {
  run_id:        string
  status:        string
  branch:        string
  n_findings:    number
  n_changes:     number
  test_passed:   boolean
  proposal_path: string
  report_md:     string
}

export interface AutoDevProposal {
  run_id:    string
  filename:  string
  status:    string
  branch:    string
  created:   number
  report_md: string
}

export async function runAutodev(focus?: string[]): Promise<AutoDevResult> {
  return post('/autodev/run', focus ?? ['typescript', 'dead_code', 'performance'])
}

export async function fetchAutodevProposals(): Promise<AutoDevProposal[]> {
  const data = await get<{ proposals: AutoDevProposal[] }>('/autodev/proposals')
  return data.proposals
}

export async function approveAutodev(runId: string): Promise<{ ok: boolean; message: string }> {
  return post(`/autodev/approve/${runId}`, {})
}

export async function rejectAutodev(runId: string): Promise<{ ok: boolean }> {
  return post(`/autodev/reject/${runId}`, {})
}

// ── Post-Trade Coach ──────────────────────────────────────────────────────────

export interface TradeAudit {
  trade_id:          number
  date:              string
  sym:               string
  action:            string
  price:             number
  qty:               number
  pnl:               number | null
  strategy_signal:   string
  signal_confidence: number
  regime:            string
  verdict:           string
  notes:             string
}

export interface LossTrade {
  sym:        string
  entry_date: string
  exit_date:  string
  pnl:        number
  pnl_pct:    number
  root_cause: string
  explanation: string
}

export interface PatternFlaw {
  pattern:           string
  occurrences:       number
  tickers_affected:  string[]
  avg_loss:          number
  recommendation:    string
}

export interface PostTradeReport {
  overall_grade:   string
  trade_audits:    TradeAudit[]
  losing_trades:   LossTrade[]
  drift_flags:     { parameter: string; backtest_value: number; live_value: number; deviation_pct: number; impact: string }[]
  pattern_flaws:   PatternFlaw[]
  lessons_learned: string
  recommendations: string[]
  report_md:       string
  report_path:     string
}

export async function runPostTradeAnalysis(): Promise<PostTradeReport> {
  return post('/postrade/analyze', {})
}

export async function fetchPostTradeReports(): Promise<{ filename: string; created: number; report_md: string }[]> {
  const data = await get<{ reports: { filename: string; created: number; report_md: string }[] }>('/postrade/reports')
  return data.reports
}
