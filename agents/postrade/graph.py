from langgraph.graph import StateGraph, END
from .state import PostTradeState
from .nodes import (
    load_trades, audit_decisions, loss_autopsy,
    detect_drift, recognize_patterns, generate_report,
)


def build_postrade_graph():
    g = StateGraph(PostTradeState)

    g.add_node("load_trades",        load_trades)
    g.add_node("audit_decisions",    audit_decisions)
    g.add_node("loss_autopsy",       loss_autopsy)
    g.add_node("detect_drift",       detect_drift)
    g.add_node("recognize_patterns", recognize_patterns)
    g.add_node("generate_report",    generate_report)

    g.set_entry_point("load_trades")
    g.add_edge("load_trades",        "audit_decisions")
    g.add_edge("audit_decisions",    "loss_autopsy")
    g.add_edge("loss_autopsy",       "detect_drift")
    g.add_edge("detect_drift",       "recognize_patterns")
    g.add_edge("recognize_patterns", "generate_report")
    g.add_edge("generate_report",    END)

    return g.compile()


_graph = None

def get_postrade_graph():
    global _graph
    if _graph is None:
        _graph = build_postrade_graph()
    return _graph
