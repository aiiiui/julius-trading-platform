from typing import TypedDict, List, Dict, Any, Optional


class TradeAudit(TypedDict):
    trade_id: int
    date: str
    sym: str
    action: str                 # BUY | SELL
    price: float
    qty: int
    pnl: Optional[float]        # None for open trades
    strategy_signal: str        # signal that was active at trade time
    signal_confidence: float
    regime: str                 # calm | volatile
    verdict: str                # 'sound' | 'deviation' | 'early' | 'late' | 'no_signal'
    notes: str


class LossTrade(TypedDict):
    sym: str
    entry_date: str
    exit_date: str
    pnl: float
    pnl_pct: float
    root_cause: str             # e.g. 'poor_entry' | 'regime_change' | 'stop_ignored' | 'indicator_lag'
    explanation: str


class DriftFlag(TypedDict):
    parameter: str              # e.g. 'ema_fast', 'rsi_period'
    backtest_value: Any
    live_value: Any
    deviation_pct: float
    impact: str                 # 'low' | 'medium' | 'high'


class PatternFlaw(TypedDict):
    pattern: str
    occurrences: int
    tickers_affected: List[str]
    avg_loss: float
    recommendation: str


class PostTradeState(TypedDict):
    # Input
    trades: List[Dict[str, Any]]
    backtest_params: Dict[str, Any]
    regime_labels: List[str]

    # Analysis outputs
    trade_audits: List[TradeAudit]
    losing_trades: List[LossTrade]
    drift_flags: List[DriftFlag]
    pattern_flaws: List[PatternFlaw]

    # LLM-generated content
    lessons_learned: str
    recommendations: List[str]
    overall_grade: str          # 'A' through 'F'

    # Output
    report_md: str
    report_path: str
    error: str
