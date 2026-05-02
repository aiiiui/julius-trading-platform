from langgraph.graph import StateGraph, END
from .state import AutoDevState
from .nodes import analyze_codebase, plan_changes, apply_changes, run_tests, generate_report


def build_autodev_graph():
    g = StateGraph(AutoDevState)

    g.add_node("analyze_codebase", analyze_codebase)
    g.add_node("plan_changes",     plan_changes)
    g.add_node("apply_changes",    apply_changes)
    g.add_node("run_tests",        run_tests)
    g.add_node("generate_report",  generate_report)

    g.set_entry_point("analyze_codebase")
    g.add_edge("analyze_codebase", "plan_changes")
    g.add_edge("plan_changes",     "apply_changes")
    g.add_edge("apply_changes",    "run_tests")
    g.add_edge("run_tests",        "generate_report")
    g.add_edge("generate_report",  END)

    return g.compile()


_graph = None

def get_autodev_graph():
    global _graph
    if _graph is None:
        _graph = build_autodev_graph()
    return _graph
