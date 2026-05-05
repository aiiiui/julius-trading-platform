// ── Backtest ──────────────────────────────────────────────────────────────────

export interface StrategyMetrics {
  total_return: number | null
  cagr: number | null
  sharpe_ratio: number | null
  max_drawdown: number | null
  calmar_ratio: number | null
  win_rate: number | null
  n_trades: number | null
  avg_trade_duration: number | null
}

export interface StrategyResult {
  metrics: StrategyMetrics
  value_series: number[]
  value_dates: string[]
  trades: Record<string, unknown>[]
}

export type TickerResults = Record<string, StrategyResult>
export type BatchResults  = Record<string, TickerResults>

export interface LstmData {
  actuals: number[]
  preds: number[]
  confidence: number[]
  buy_threshold: number
  sell_threshold: number
  tp: number; tn: number; fp: number; fn: number; n: number
  accuracy: number; precision: number; recall: number; f1: number
}

export interface BacktestResponse {
  batch_results: BatchResults
  price_data: Record<string, { series: number[]; dates: string[] }>
  lstm_by_ticker: Record<string, LstmData>
  regime_labels: string[]
  regime_dates: string[]
}

// ── Live data ─────────────────────────────────────────────────────────────────

export interface LivePricesResponse {
  prices:  Record<string, number | null>
  spark:   Record<string, number[]>
  changes: Record<string, number>
}

export interface IndexData {
  sym: string
  name: string
  value: number | null
  change: number
}

export interface Candle {
  open: number; high: number; low: number; close: number
}

// ── Signals ───────────────────────────────────────────────────────────────────

export interface LiveSignal {
  ticker: string
  strategy: string
  signal: 'BUY' | 'SELL' | 'HOLD' | 'N/A'
  confidence: number
}

// ── Portfolio ─────────────────────────────────────────────────────────────────

export interface Position {
  qty: number
  entry: number
  entryDate: string
}

export interface Trade {
  date: string
  sym: string
  action: 'BUY' | 'SELL'
  qty: number
  price: number
  pnl: number | null
}

export interface Portfolio {
  cash: number
  initial_cash: number
  tc_pct: number
  positions: Record<string, Position>
  trades: Trade[]
}

// ── UI ────────────────────────────────────────────────────────────────────────

export interface RunSettings {
  tickers: string[]
  start: string
  end: string
  initial_cash: number
  tc_pct: number
  strategies: string[]
  use_pairs: boolean
}

export type Theme  = 'light' | 'dark'
export type Accent = 'green' | 'blue' | 'amber'
export interface Tweaks { theme: Theme; accent: Accent }

export interface ToastItem { id: string; msg: string; kind?: 'success' | 'error' | '' }
