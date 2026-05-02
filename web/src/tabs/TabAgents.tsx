import { useState, useEffect } from 'react'
import { Icons } from '../components/ui'
import {
  runAutodev, fetchAutodevProposals, approveAutodev, rejectAutodev,
  runPostTradeAnalysis, fetchPostTradeReports,
} from '../api'
import type { AutoDevProposal, PostTradeReport } from '../api'

// ── Shared helpers ────────────────────────────────────────────────────────────

function GradeTag({ grade }: { grade: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    A: { bg: '#dcfce7', color: '#16a34a' },
    B: { bg: '#ecfccb', color: '#65a30d' },
    C: { bg: '#fef9c3', color: '#ca8a04' },
    D: { bg: '#ffedd5', color: '#ea580c' },
    F: { bg: '#fee2e2', color: '#dc2626' },
  }
  const s = colors[grade] ?? { bg: '#f3f4f6', color: '#6b7280' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 36, height: 36, borderRadius: 6, fontWeight: 800, fontSize: 18,
      fontFamily: 'var(--mono)', background: s.bg, color: s.color,
    }}>{grade}</span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    proposed:  { label: 'Awaiting Approval', color: 'var(--accent)' },
    approved:  { label: 'Approved & Merged', color: 'var(--up)'     },
    rejected:  { label: 'Rejected',           color: 'var(--down)'   },
    analyzing: { label: 'Analyzing…',         color: 'var(--text-muted)' },
    coding:    { label: 'Coding…',            color: 'var(--accent)' },
    testing:   { label: 'Testing…',           color: 'var(--accent)' },
  }
  const s = map[status] ?? { label: status, color: 'var(--text-muted)' }
  return <span style={{ fontSize: 11, fontWeight: 600, color: s.color, fontFamily: 'var(--mono)' }}>{s.label}</span>
}

function MarkdownBlock({ md }: { md: string }) {
  return (
    <pre style={{
      background: 'var(--bg-subtle)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-sm)', padding: '14px 16px',
      fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap',
      wordBreak: 'break-word', color: 'var(--text)', maxHeight: 420, overflowY: 'auto',
      fontFamily: 'var(--mono)',
    }}>
      {md}
    </pre>
  )
}

// ── AutoDev Panel ─────────────────────────────────────────────────────────────

function AutoDevPanel({ pushToast }: { pushToast: (t: { msg: string; kind?: '' | 'success' | 'error' }) => void }) {
  const [running,   setRunning]   = useState(false)
  const [proposals, setProposals] = useState<AutoDevProposal[]>([])
  const [expanded,  setExpanded]  = useState<string | null>(null)
  const [focus,     setFocus]     = useState({ typescript: true, dead_code: true, performance: false, style: false })
  const [actioning, setActioning] = useState<string | null>(null)

  const loadProposals = () =>
    fetchAutodevProposals().then(setProposals).catch(() => {})

  useEffect(() => { loadProposals() }, [])

  const triggerRun = async () => {
    setRunning(true)
    try {
      const areas = Object.entries(focus).filter(([, v]) => v).map(([k]) => k)
      const res = await runAutodev(areas)
      pushToast({ kind: 'success', msg: `AutoDev run complete — ${res.n_findings} findings, ${res.n_changes} changes applied.` })
      loadProposals()
    } catch (e: unknown) {
      pushToast({ kind: 'error', msg: String(e) })
    } finally { setRunning(false) }
  }

  const approve = async (runId: string) => {
    setActioning(runId)
    try {
      const res = await approveAutodev(runId)
      pushToast({ kind: 'success', msg: res.message })
      loadProposals()
    } catch (e: unknown) {
      pushToast({ kind: 'error', msg: String(e) })
    } finally { setActioning(null) }
  }

  const reject = async (runId: string) => {
    setActioning(runId)
    try {
      await rejectAutodev(runId)
      pushToast({ msg: 'Proposal rejected — branch deleted.' })
      loadProposals()
    } catch (e: unknown) {
      pushToast({ kind: 'error', msg: String(e) })
    } finally { setActioning(null) }
  }

  const pendingCount = proposals.filter(p => p.status === 'proposed').length

  return (
    <div>
      {/* Header */}
      <div className="card-header" style={{ marginBottom: 0 }}>
        <div>
          <h3 className="card-title">AutoDev Bot</h3>
          <p className="card-subtitle">
            Scans codebase · creates git branch · proposes changes · waits for your approval
            {pendingCount > 0 && <span style={{ color: 'var(--accent)', fontWeight: 600 }}> · {pendingCount} pending</span>}
          </p>
        </div>
        <button className="btn btn-primary" onClick={triggerRun} disabled={running}>
          {running
            ? <><span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span> Analyzing…</>
            : <><Icons.Refresh size={13}/> Run AutoDev</>}
        </button>
      </div>

      {/* Focus area toggles */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>Scan focus</span>
        {Object.entries(focus).map(([key, on]) => (
          <button key={key} onClick={() => setFocus(f => ({ ...f, [key]: !f[key as keyof typeof f] }))}
            style={{
              padding: '3px 11px', fontSize: 12, borderRadius: 4, cursor: 'pointer', fontFamily: 'var(--mono)',
              fontWeight: 500, transition: 'all 0.12s',
              border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
              background: on ? 'var(--accent)' : 'var(--bg-elevated)',
              color:      on ? 'white'         : 'var(--text-muted)',
            }}>
            {key.replace('_', ' ')}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-subtle)' }}>
          Changes land on a git branch — never directly on main
        </span>
      </div>

      {/* Pipeline visualization */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 0, alignItems: 'center', background: 'var(--bg-subtle)', overflowX: 'auto' }}>
        {[
          { icon: '🔍', label: 'Analyze',  desc: 'TS errors, dead code, perf' },
          { icon: '🧠', label: 'Plan',     desc: 'Claude prioritizes fixes'    },
          { icon: '✏️',  label: 'Code',    desc: 'Edits on isolated branch'    },
          { icon: '✅', label: 'Test',     desc: 'tsc + Python imports'        },
          { icon: '📋', label: 'Propose',  desc: 'Report written to proposals/'},
          { icon: '👤', label: 'You',      desc: 'Approve or reject below'     },
          { icon: '🚀', label: 'Merge',    desc: 'Branch merged into main'     },
        ].map((step, i, arr) => (
          <div key={step.label} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <div style={{ textAlign: 'center', minWidth: 72 }}>
              <div style={{ fontSize: 18 }}>{step.icon}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>{step.label}</div>
              <div style={{ fontSize: 9, color: 'var(--text-subtle)', lineHeight: 1.3, maxWidth: 68 }}>{step.desc}</div>
            </div>
            {i < arr.length - 1 && (
              <div style={{ width: 24, height: 1, background: 'var(--border)', margin: '0 2px', flexShrink: 0 }}/>
            )}
          </div>
        ))}
      </div>

      {/* Proposals list */}
      <div style={{ maxHeight: 500, overflowY: 'auto' }}>
        {proposals.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No proposals yet. Click <strong>Run AutoDev</strong> to start the first analysis.
          </div>
        ) : proposals.map(p => (
          <div key={p.run_id} style={{ borderBottom: '1px solid var(--border)' }}>
            <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
              onClick={() => setExpanded(expanded === p.run_id ? null : p.run_id)}>
              <div style={{ flex: 1 }}>
                <div className="row" style={{ gap: 10, marginBottom: 3 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13 }}>#{p.run_id}</span>
                  <StatusBadge status={p.status}/>
                  {p.branch && <span style={{ fontSize: 11, color: 'var(--text-subtle)', fontFamily: 'var(--mono)' }}>{p.branch}</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {new Date(p.created * 1000).toLocaleString()}
                </div>
              </div>
              {p.status === 'proposed' && (
                <div className="row" style={{ gap: 8 }} onClick={e => e.stopPropagation()}>
                  <button className="btn btn-sm btn-buy" disabled={actioning === p.run_id}
                    onClick={() => approve(p.run_id)}>
                    {actioning === p.run_id ? '…' : '✓ Approve & Merge'}
                  </button>
                  <button className="btn btn-sm btn-sell" disabled={actioning === p.run_id}
                    onClick={() => reject(p.run_id)}>
                    ✕ Reject
                  </button>
                </div>
              )}
              <span style={{ color: 'var(--text-subtle)', fontSize: 14 }}>{expanded === p.run_id ? '▲' : '▼'}</span>
            </div>
            {expanded === p.run_id && (
              <div style={{ padding: '0 20px 16px' }}>
                <MarkdownBlock md={p.report_md}/>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Post-Trade Coach Panel ────────────────────────────────────────────────────

function PostTradePanel({ pushToast }: { pushToast: (t: { msg: string; kind?: '' | 'success' | 'error' }) => void }) {
  const [running,  setRunning]  = useState(false)
  const [report,   setReport]   = useState<PostTradeReport | null>(null)
  const [history,  setHistory]  = useState<{ filename: string; created: number; report_md: string }[]>([])
  const [histOpen, setHistOpen] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'audit'|'losses'|'patterns'|'report'>('audit')

  useEffect(() => {
    fetchPostTradeReports().then(setHistory).catch(() => {})
  }, [])

  const analyze = async () => {
    setRunning(true)
    try {
      const res = await runPostTradeAnalysis()
      setReport(res)
      fetchPostTradeReports().then(setHistory).catch(() => {})
      pushToast({ kind: 'success', msg: `Analysis complete — Grade ${res.overall_grade}` })
    } catch (e: unknown) {
      pushToast({ kind: 'error', msg: String(e) })
    } finally { setRunning(false) }
  }

  const verdictColor = (v: string) =>
    v === 'sound' ? 'var(--up)' : v === 'deviation' ? 'var(--down)' : 'var(--text-muted)'

  const rootCauseIcon: Record<string, string> = {
    regime_change: '🌪',
    poor_entry:    '⏰',
    stop_ignored:  '🚫',
    indicator_lag: '📡',
    no_signal:     '❓',
  }

  return (
    <div>
      <div className="card-header">
        <div>
          <h3 className="card-title">Trading Coach</h3>
          <p className="card-subtitle">Audits every decision · diagnoses losses · detects strategy drift · generates Lessons Learned</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {report && <GradeTag grade={report.overall_grade}/>}
          <button className="btn btn-primary" onClick={analyze} disabled={running}>
            {running
              ? <><span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span> Analyzing…</>
              : <><Icons.Filter size={13}/> Analyze Trades</>}
          </button>
        </div>
      </div>

      {/* Pipeline */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 0, alignItems: 'center', background: 'var(--bg-subtle)', overflowX: 'auto' }}>
        {[
          { icon: '📂', label: 'Load',     desc: 'Trade history + regime' },
          { icon: '⚖️',  label: 'Audit',   desc: 'Signal vs execution'    },
          { icon: '🩺', label: 'Autopsy',  desc: 'Root-cause each loss'   },
          { icon: '📡', label: 'Drift',    desc: 'Backtest vs live params' },
          { icon: '🔎', label: 'Patterns', desc: 'Recurring flaws'         },
          { icon: '📝', label: 'Report',   desc: 'Lessons Learned + grade' },
        ].map((step, i, arr) => (
          <div key={step.label} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <div style={{ textAlign: 'center', minWidth: 72 }}>
              <div style={{ fontSize: 18 }}>{step.icon}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>{step.label}</div>
              <div style={{ fontSize: 9, color: 'var(--text-subtle)', lineHeight: 1.3, maxWidth: 68 }}>{step.desc}</div>
            </div>
            {i < arr.length - 1 && <div style={{ width: 24, height: 1, background: 'var(--border)', margin: '0 2px' }}/>}
          </div>
        ))}
      </div>

      {!report ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          Click <strong>Analyze Trades</strong> to run the trading coach on your paper portfolio history.
          <br/><span style={{ fontSize: 11, marginTop: 8, display: 'block' }}>Requires at least one executed paper trade.</span>
        </div>
      ) : (
        <>
          {/* Sub-tabs */}
          <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)', display: 'flex', gap: 6 }}>
            {(['audit','losses','patterns','report'] as const).map(t => (
              <button key={t} className={`subtab ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}
                style={{ position: 'relative' }}>
                {t === 'audit'    && 'Decision Audit'}
                {t === 'losses'   && <>Loss Autopsy {report.losing_trades.length > 0 && <span style={{ marginLeft: 4, background: 'var(--down)', color: 'white', borderRadius: 10, padding: '0 5px', fontSize: 10 }}>{report.losing_trades.length}</span>}</>}
                {t === 'patterns' && <>Pattern Flaws {report.pattern_flaws.length > 0 && <span style={{ marginLeft: 4, background: 'var(--accent)', color: 'white', borderRadius: 10, padding: '0 5px', fontSize: 10 }}>{report.pattern_flaws.length}</span>}</>}
                {t === 'report'   && 'Lessons Learned'}
              </button>
            ))}
          </div>

          {/* Decision audit table */}
          {activeTab === 'audit' && (
            <div style={{ maxHeight: 420, overflowY: 'auto' }}>
              <table className="tbl">
                <thead><tr>
                  <th>Date</th><th>Sym</th><th>Action</th>
                  <th className="right">Price</th><th className="right">P&L</th>
                  <th>Regime</th><th>Verdict</th><th>Notes</th>
                </tr></thead>
                <tbody>
                  {report.trade_audits.length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24 }} className="muted">No trades to audit.</td></tr>
                  ) : report.trade_audits.map((a, i) => (
                    <tr key={i}>
                      <td className="mono tiny">{a.date}</td>
                      <td style={{ fontWeight: 600 }}>{a.sym}</td>
                      <td><span className={`pill ${a.action === 'BUY' ? 'up' : 'down'}`}>{a.action}</span></td>
                      <td className="num">€{a.price.toFixed(2)}</td>
                      <td className="num" style={{ color: a.pnl == null ? 'var(--text-muted)' : a.pnl >= 0 ? 'var(--up)' : 'var(--down)' }}>
                        {a.pnl == null ? '—' : `${a.pnl >= 0 ? '+' : ''}€${Math.abs(a.pnl).toFixed(0)}`}
                      </td>
                      <td><span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: a.regime === 'volatile' ? 'var(--down-soft)' : 'var(--up-soft)', color: a.regime === 'volatile' ? 'var(--down)' : 'var(--up)', fontFamily: 'var(--mono)', fontWeight: 600 }}>{a.regime}</span></td>
                      <td><span style={{ fontSize: 11, fontWeight: 600, color: verdictColor(a.verdict), fontFamily: 'var(--mono)' }}>{a.verdict}</span></td>
                      <td style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 260 }}>{a.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Loss autopsy */}
          {activeTab === 'losses' && (
            <div style={{ padding: 20 }}>
              {report.losing_trades.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 24, color: 'var(--up)', fontWeight: 600 }}>No losing closed trades — great work!</div>
              ) : report.losing_trades.map((l, i) => (
                <div key={i} style={{ padding: '16px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: 12, background: 'var(--bg-elevated)' }}>
                  <div className="row" style={{ gap: 12, marginBottom: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, fontFamily: 'var(--mono)' }}>{l.sym}</span>
                    <span style={{ fontSize: 20 }}>{rootCauseIcon[l.root_cause] ?? '⚠️'}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{l.entry_date} → {l.exit_date}</span>
                    <span style={{ marginLeft: 'auto', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--down)' }}>
                      {l.pnl >= 0 ? '+' : ''}€{l.pnl.toFixed(0)} ({l.pnl_pct.toFixed(1)}%)
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: 'var(--down-soft)', color: 'var(--down)', fontWeight: 600, fontFamily: 'var(--mono)' }}>
                      {l.root_cause.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>{l.explanation}</div>
                </div>
              ))}
            </div>
          )}

          {/* Pattern flaws */}
          {activeTab === 'patterns' && (
            <div style={{ padding: 20 }}>
              {report.pattern_flaws.length === 0 && report.drift_flags.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 24, color: 'var(--up)', fontWeight: 600 }}>No systematic patterns detected — strategy is consistent.</div>
              ) : (
                <>
                  {report.pattern_flaws.map((f, i) => (
                    <div key={i} style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: 12, background: 'var(--bg-elevated)', borderLeft: '3px solid var(--down)' }}>
                      <div className="row" style={{ gap: 10, marginBottom: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{f.pattern}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{f.occurrences}x across {f.tickers_affected.join(', ')}</span>
                        <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', color: 'var(--down)', fontWeight: 600 }}>avg €{f.avg_loss.toFixed(0)}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500 }}>→ {f.recommendation}</div>
                    </div>
                  ))}
                  {report.drift_flags.map((d, i) => (
                    <div key={`d${i}`} style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: 12, background: 'var(--bg-elevated)', borderLeft: '3px solid var(--accent)' }}>
                      <div className="row" style={{ gap: 10, marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>Strategy Drift: {d.parameter}</span>
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: d.impact === 'high' ? 'var(--down-soft)' : 'var(--accent-soft)', color: d.impact === 'high' ? 'var(--down)' : 'var(--accent)', fontWeight: 600 }}>{d.impact.toUpperCase()}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        Backtest: <strong>{d.backtest_value}</strong> → Live: <strong>{d.live_value}</strong> ({d.deviation_pct}% deviation)
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* Lessons Learned + recommendations */}
          {activeTab === 'report' && (
            <div style={{ padding: 20 }}>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--text)' }}>Lessons Learned</div>
                <MarkdownBlock md={report.lessons_learned || 'No lessons generated.'}/>
              </div>
              {report.recommendations.length > 0 && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Action Items</div>
                  {report.recommendations.map((r, i) => (
                    <div key={i} style={{ padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', marginBottom: 8, background: 'var(--bg-elevated)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>{i + 1}.</span>
                      <span style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>{r}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Report history */}
      {history.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 20px' }}>
          <div style={{ fontSize: 12, color: 'var(--text-subtle)', fontWeight: 500, marginBottom: 8 }}>Previous reports</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {history.slice(0, 5).map(h => (
              <button key={h.filename} className="btn btn-ghost btn-sm"
                onClick={() => setHistOpen(histOpen === h.filename ? null : h.filename)}>
                {new Date(h.created * 1000).toLocaleDateString()}
              </button>
            ))}
          </div>
          {histOpen && (
            <div style={{ marginTop: 10 }}>
              <MarkdownBlock md={history.find(h => h.filename === histOpen)?.report_md ?? ''}/>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export default function TabAgents({
  pushToast,
}: {
  pushToast: (t: { msg: string; kind?: '' | 'success' | 'error' }) => void
}) {
  const [panel, setPanel] = useState<'autodev' | 'coach'>('autodev')

  return (
    <div className="page-fade">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid var(--border)' }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>Agents</h1>
          <p className="page-subtitle">Autonomous bots that improve the platform and coach your trading — you stay in control.</p>
        </div>
        <div className="subtabs">
          <button className={`subtab ${panel === 'autodev' ? 'active' : ''}`} onClick={() => setPanel('autodev')}>
            🤖 AutoDev Bot
          </button>
          <button className={`subtab ${panel === 'coach' ? 'active' : ''}`} onClick={() => setPanel('coach')}>
            🎓 Trading Coach
          </button>
        </div>
      </div>

      <div className="card">
        {panel === 'autodev'
          ? <AutoDevPanel pushToast={pushToast}/>
          : <PostTradePanel pushToast={pushToast}/>
        }
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
