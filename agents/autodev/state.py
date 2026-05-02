from typing import TypedDict, List, Dict, Any, Optional


class Finding(TypedDict):
    category: str   # 'typescript' | 'performance' | 'dead_code' | 'api' | 'style'
    severity: str   # 'high' | 'medium' | 'low'
    file: str
    description: str
    line: Optional[int]


class Change(TypedDict):
    file: str
    description: str
    before: str     # short excerpt of old code
    after: str      # short excerpt of new code


class AutoDevState(TypedDict):
    # Inputs
    run_id: str
    focus_areas: List[str]          # e.g. ['typescript', 'performance', 'dead_code']

    # Analysis
    findings: List[Finding]
    plan: str                        # Claude's written plan

    # Execution
    branch_name: str
    changes_applied: List[Change]
    test_output: str
    test_passed: bool

    # Output
    proposal_path: str
    report_md: str
    status: str                      # 'analyzing'|'planning'|'coding'|'testing'|'proposed'|'approved'|'rejected'
    error: str
