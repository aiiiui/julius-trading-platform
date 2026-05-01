from typing import TypedDict, List, Dict, Any


class AgentState(TypedDict):
    # ── Inputs ────────────────────────────────────────────────────────────────
    batch_results: Dict[str, Any]
    regime_labels: List[str]

    # ── Node outputs ──────────────────────────────────────────────────────────
    metrics_summary:   str
    regime_analysis:   str
    strategy_rankings: List[Dict[str, Any]]
    risk_flags:        List[str]

    # ── LLM output ────────────────────────────────────────────────────────────
    overall_verdict: str
    top_strategy:    str
    regime_insight:  str
    ticker_verdicts: Dict[str, Dict[str, Any]]
    raw_analysis:    str
