"""
AutoDev agent nodes — each receives AutoDevState and returns a partial update dict.
"""
from __future__ import annotations

import os
import re
import subprocess
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

ROOT = Path(__file__).parent.parent.parent   # trading-platform/


# ── Node 1: Analyze codebase ──────────────────────────────────────────────────

def analyze_codebase(state: Dict[str, Any]) -> Dict[str, Any]:
    findings: list = []
    focus = set(state.get("focus_areas", ["typescript", "performance", "dead_code"]))

    # ── TypeScript errors ────────────────────────────────────────────────────
    if "typescript" in focus:
        result = subprocess.run(
            ["node", "node_modules/.bin/tsc", "--noEmit", "--pretty", "false"],
            cwd=ROOT / "web",
            capture_output=True, text=True,
            env={**os.environ, "PATH": f"/Users/ttouch/.nvm/versions/node/v24.15.0/bin:{os.environ.get('PATH','')}"},
        )
        for line in (result.stdout + result.stderr).splitlines():
            m = re.match(r'(.+\.tsx?)\((\d+),\d+\): error (TS\d+): (.+)', line)
            if m:
                findings.append({
                    "category": "typescript",
                    "severity":  "high",
                    "file":      m.group(1),
                    "line":      int(m.group(2)),
                    "description": f"{m.group(3)}: {m.group(4)}",
                })

    # ── Dead imports / unused vars (quick grep) ──────────────────────────────
    if "dead_code" in focus:
        for ext in ["*.ts", "*.tsx", "*.py"]:
            for f in (ROOT / "web/src").rglob(ext) if ext.endswith("x") or ext.endswith("s") else ROOT.rglob(ext):
                if "node_modules" in str(f) or "venv" in str(f):
                    continue
                try:
                    src = f.read_text(encoding="utf-8", errors="ignore")
                except Exception:
                    continue
                # Flag TODO / FIXME / HACK comments
                for i, line in enumerate(src.splitlines(), 1):
                    if re.search(r'\b(TODO|FIXME|HACK|XXX)\b', line):
                        findings.append({
                            "category": "dead_code",
                            "severity":  "low",
                            "file":      str(f.relative_to(ROOT)),
                            "line":      i,
                            "description": f"Unresolved annotation: {line.strip()[:80]}",
                        })

    # ── API endpoint performance (check for missing async / no caching) ──────
    if "performance" in focus:
        api_src = (ROOT / "api.py").read_text(encoding="utf-8")
        # Flag sync endpoints that do heavy I/O without asyncio.to_thread
        for m in re.finditer(r'^def (\w+)\(', api_src, re.MULTILINE):
            fn = m.group(1)
            if fn.startswith(('_', 'test')):
                continue
            findings.append({
                "category": "performance",
                "severity":  "low",
                "file":      "api.py",
                "line":      api_src[:m.start()].count('\n') + 1,
                "description": f"Sync endpoint `{fn}` — verify it uses thread pool for blocking I/O.",
            })

    # ── Large files (may need splitting) ────────────────────────────────────
    if "style" in focus:
        for f in ROOT.rglob("*.py"):
            if "venv" in str(f) or "__pycache__" in str(f):
                continue
            lines = f.read_text(encoding="utf-8", errors="ignore").count('\n')
            if lines > 400:
                findings.append({
                    "category": "style",
                    "severity":  "low",
                    "file":      str(f.relative_to(ROOT)),
                    "line":      None,
                    "description": f"File has {lines} lines — consider splitting into modules.",
                })

    return {"findings": findings, "status": "analyzing"}


# ── Node 2: Plan improvements with Claude ─────────────────────────────────────

def plan_changes(state: Dict[str, Any]) -> Dict[str, Any]:
    findings = state.get("findings", [])
    if not findings:
        return {"plan": "No findings — codebase looks clean.", "status": "planning"}

    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        # Deterministic plan without LLM
        lines = ["## AutoDev Plan (no LLM key — rule-based)\n"]
        for f in findings[:10]:
            lines.append(f"- **[{f['severity'].upper()}]** `{f['file']}` L{f.get('line','?')}: {f['description']}")
        return {"plan": "\n".join(lines), "status": "planning"}

    from langchain_anthropic import ChatAnthropic
    from langchain_core.messages import SystemMessage, HumanMessage

    llm = ChatAnthropic(model="claude-haiku-4-5-20251001", temperature=0.2, max_tokens=1500)

    findings_text = "\n".join(
        f"[{f['severity'].upper()}] {f['file']} L{f.get('line','?')}: {f['description']}"
        for f in findings[:15]
    )

    resp = llm.invoke([
        SystemMessage(content=(
            "You are an automated code-improvement agent for a Python/FastAPI + React/TypeScript trading platform. "
            "Given a list of code findings, produce a concise, prioritised action plan. "
            "Focus on the highest-impact, lowest-risk changes first. "
            "Output a markdown numbered list. Each item: file path, what to change, why, estimated risk (Low/Med/High)."
        )),
        HumanMessage(content=f"Findings:\n{findings_text}\n\nWrite the improvement plan now."),
    ])
    return {"plan": resp.content, "status": "planning"}


# ── Node 3: Apply changes on a git branch ────────────────────────────────────

def apply_changes(state: Dict[str, Any]) -> Dict[str, Any]:
    run_id   = state.get("run_id", str(uuid.uuid4())[:8])
    branch   = f"autodev/{datetime.now().strftime('%Y%m%d')}-{run_id}"
    changes_applied: list = []

    try:
        subprocess.run(["git", "checkout", "-b", branch], cwd=ROOT, check=True,
                       capture_output=True)
    except subprocess.CalledProcessError as e:
        return {"error": f"Could not create branch: {e.stderr.decode()}", "branch_name": branch}

    findings = state.get("findings", [])

    # ── Auto-fix 1: remove trailing whitespace from Python files ────────────
    fixed_files = set()
    for f in findings:
        if f["category"] in ("dead_code", "style") and f["file"].endswith(".py"):
            path = ROOT / f["file"]
            if path.exists() and path not in fixed_files:
                src = path.read_text(encoding="utf-8")
                cleaned = "\n".join(line.rstrip() for line in src.splitlines())
                if cleaned != src.rstrip():
                    path.write_text(cleaned + "\n", encoding="utf-8")
                    fixed_files.add(path)
                    changes_applied.append({
                        "file": f["file"],
                        "description": "Removed trailing whitespace",
                        "before": "(whitespace)",
                        "after": "(clean)",
                    })

    # ── Auto-fix 2: add missing newline at end of Python files ──────────────
    for py_file in ROOT.rglob("*.py"):
        if "venv" in str(py_file) or "__pycache__" in str(py_file):
            continue
        try:
            content = py_file.read_text(encoding="utf-8")
            if content and not content.endswith("\n"):
                py_file.write_text(content + "\n", encoding="utf-8")
                rel = str(py_file.relative_to(ROOT))
                changes_applied.append({
                    "file": rel,
                    "description": "Added missing newline at end of file",
                    "before": "...<no newline>",
                    "after":  "...<newline>",
                })
        except Exception:
            continue

    if changes_applied:
        subprocess.run(["git", "add", "-A"], cwd=ROOT, capture_output=True)
        subprocess.run(
            ["git", "commit", "-m", f"autodev: code quality fixes ({len(changes_applied)} files)\n\n[AutoDev run {run_id}]"],
            cwd=ROOT, capture_output=True,
        )

    return {
        "branch_name":     branch,
        "changes_applied": changes_applied,
        "status":          "coding",
    }


# ── Node 4: Run tests ─────────────────────────────────────────────────────────

def run_tests(state: Dict[str, Any]) -> Dict[str, Any]:
    output_parts: list[str] = []
    passed = True

    # TypeScript compilation check
    result = subprocess.run(
        ["node", "node_modules/.bin/tsc", "--noEmit"],
        cwd=ROOT / "web", capture_output=True, text=True,
        env={**os.environ, "PATH": f"/Users/ttouch/.nvm/versions/node/v24.15.0/bin:{os.environ.get('PATH','')}"},
        timeout=60,
    )
    ts_ok = result.returncode == 0
    output_parts.append(f"TypeScript: {'✓ PASS' if ts_ok else '✗ FAIL'}\n{result.stdout[:400]}")
    if not ts_ok:
        passed = False

    # Python import check (fast)
    result = subprocess.run(
        [str(ROOT / "venv/bin/python3"), "-c", "import api; print('imports ok')"],
        cwd=ROOT, capture_output=True, text=True, timeout=30,
    )
    py_ok = result.returncode == 0
    output_parts.append(f"Python imports: {'✓ PASS' if py_ok else '✗ FAIL'}\n{(result.stdout + result.stderr)[:200]}")
    if not py_ok:
        passed = False

    return {
        "test_output": "\n\n".join(output_parts),
        "test_passed": passed,
        "status":      "testing",
    }


# ── Node 5: Generate proposal report ─────────────────────────────────────────

def generate_report(state: Dict[str, Any]) -> Dict[str, Any]:
    run_id   = state.get("run_id", "unknown")
    branch   = state.get("branch_name", "autodev/unknown")
    findings = state.get("findings", [])
    changes  = state.get("changes_applied", [])
    plan     = state.get("plan", "")
    tests    = state.get("test_output", "")
    passed   = state.get("test_passed", False)
    now      = datetime.now().strftime("%Y-%m-%d %H:%M")
    error    = state.get("error", "")

    severity_counts = {"high": 0, "medium": 0, "low": 0}
    for f in findings:
        severity_counts[f.get("severity", "low")] += 1

    lines = [
        f"# AutoDev Proposal — {now}",
        f"**Run ID:** `{run_id}`  |  **Branch:** `{branch}`",
        f"**Status:** {'✅ Tests passed — ready to approve' if passed else '⚠️ Tests failed — review before approving'}",
        "",
        "## Findings Summary",
        f"- 🔴 High: {severity_counts['high']}",
        f"- 🟡 Medium: {severity_counts['medium']}",
        f"- 🟢 Low: {severity_counts['low']}",
        "",
        "## Improvement Plan",
        plan,
        "",
        "## Changes Applied",
    ]

    if changes:
        for c in changes:
            lines.append(f"- `{c['file']}`: {c['description']}")
    else:
        lines.append("_No automated fixes applied — plan requires manual review._")

    lines += [
        "",
        "## Test Results",
        f"```\n{tests}\n```",
        "",
        "## How to Approve",
        f"Run: `python approve.py {run_id}` — or click **Approve** in the Agents tab.",
        "",
        "## Risk Assessment",
        "- All changes are on an isolated branch, not merged to main",
        "- TypeScript compilation verified before proposal",
        "- Approve only after reviewing the diff: `git diff main.." + branch + "`",
    ]

    if error:
        lines += ["", "## Errors", f"```\n{error}\n```"]

    report_md = "\n".join(lines)
    proposal_path = str(ROOT / "proposals" / f"{run_id}.md")
    Path(proposal_path).write_text(report_md, encoding="utf-8")

    return {
        "report_md":     report_md,
        "proposal_path": proposal_path,
        "status":        "proposed",
    }


# ── Node 6: Merge (called only after human approval) ─────────────────────────

def merge_branch(state: Dict[str, Any]) -> Dict[str, Any]:
    branch = state.get("branch_name", "")
    if not branch:
        return {"error": "No branch to merge", "status": "rejected"}

    try:
        subprocess.run(["git", "checkout", "main"], cwd=ROOT, check=True, capture_output=True)
        subprocess.run(["git", "merge", "--no-ff", branch, "-m",
                        f"Merge AutoDev proposal: {branch}"], cwd=ROOT, check=True, capture_output=True)
        subprocess.run(["git", "branch", "-d", branch], cwd=ROOT, capture_output=True)
        return {"status": "approved"}
    except subprocess.CalledProcessError as e:
        return {"error": e.stderr.decode(), "status": "rejected"}
