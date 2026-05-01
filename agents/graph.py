from langgraph.graph import StateGraph, END

from .state import AgentState
from .nodes import (
    summarize_metrics,
    analyze_regime,
    rank_strategies,
    assess_risk,
    generate_recommendations,
)

_compiled_full  = None
_compiled_local = None


def build_graph(include_llm: bool = True):
    g = StateGraph(AgentState)

    g.add_node("summarize_metrics", summarize_metrics)
    g.add_node("analyze_regime",    analyze_regime)
    g.add_node("rank_strategies",   rank_strategies)
    g.add_node("assess_risk",       assess_risk)

    g.set_entry_point("summarize_metrics")
    g.add_edge("summarize_metrics", "analyze_regime")
    g.add_edge("analyze_regime",    "rank_strategies")
    g.add_edge("rank_strategies",   "assess_risk")

    if include_llm:
        g.add_node("generate_recommendations", generate_recommendations)
        g.add_edge("assess_risk", "generate_recommendations")
        g.add_edge("generate_recommendations", END)
    else:
        g.add_edge("assess_risk", END)

    return g.compile()


def get_graph(include_llm: bool = True):
    global _compiled_full, _compiled_local
    if include_llm:
        if _compiled_full is None:
            _compiled_full = build_graph(include_llm=True)
        return _compiled_full
    else:
        if _compiled_local is None:
            _compiled_local = build_graph(include_llm=False)
        return _compiled_local
