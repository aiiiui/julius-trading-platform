import { useState, useMemo } from 'react'
import { Icons, fmt, TICKER_META } from '../components/ui'
import { fetchAIAnalysis } from '../api'
import type { AIAnalysis } from '../api'
import type { BacktestResponse } from '../types'

// ── LSTM section (unchanged) ──────────────────────────────────────────────────

function LSTMSection({ data, focus }: { data: BacktestResponse; focus: string }) {
  const { batch_results, lstm_by_ticker } = data
  const cm         = lstm_by_ticker[focus]
  const lstmResult = batch_results[focus]?.['LSTM Multi-Signal']

  const { hist, maxBin } = useMemo(() => {
    if (!cm) return { hist: new Array(20).fill(0), maxBin: 1 }
    const h = new Array(20).fill(0)
    cm.confidence.forEach((c: number) => { h[Math.min(19, Math.floor(c * 20))]++ })
    return { hist: h, maxBin: Math.max(...h, 1) }
  }, [cm])

  if (!cm) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
        LSTM Multi-Signal was not selected or failed to train for <strong>{focus}</strong>.
        Enable it in run configuration and re-run the backtest.
      </div>
    )
  }

  return (
    <>
      <div className="grid-4 stat-grid" style={{ marginBottom: 24 }}>
        {[
          { label: 'Accuracy',  value: `${(cm.accuracy  * 100).toFixed(1)}%`, delta: '↑ baseline 50%',      up: true  },
          { label: 'Precision', value: `${(cm.precision * 100).toFixed(1)}%`, delta: 'True+ / Predicted+', up: false },
          { label: 'Recall',    value: `${(cm.recall    * 100).toFixed(1)}%`, delta: 'captured upticks',   up: false },
          { label: 'F1 score',  value: cm.f1.toFixed(3),                       delta: `${cm.n} test samples`, up: false },
        ].map(s => (
          <div key={s.label}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
            <div className={`stat-delta ${s.up ? 'up' : 'muted'}`} style={!s.up ? { color: 'var(--text-muted)' } : undefined}>{s.delta}</div>
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        <div className="card">
          <div className="card-header">
            <div><h3 className="card-title">Confusion matrix</h3><p className="card-subtitle">Predicted vs actual on hold-out</p></div>
          </div>
          <div className="card-body">
            <div className="cmatrix">
              <div/><div className="axis-label">Pred ↓</div><div className="axis-label">Pred ↑</div>
              <div className="axis-label" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>Actual ↓</div>
              <div className="cmatrix-cell" style={{ background: `rgba(10,138,62,${0.15+(cm.tn/cm.n)*1.2})` }}><span className="big" style={{ color:'var(--up)' }}>{cm.tn}</span><span className="small">True neg.</span></div>
              <div className="cmatrix-cell" style={{ background: `rgba(192,56,59,${0.10+(cm.fp/cm.n)*1.2})` }}><span className="big" style={{ color:'var(--down)' }}>{cm.fp}</span><span className="small">False pos.</span></div>
              <div className="axis-label" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>Actual ↑</div>
              <div className="cmatrix-cell" style={{ background: `rgba(192,56,59,${0.10+(cm.fn/cm.n)*1.2})` }}><span className="big" style={{ color:'var(--down)' }}>{cm.fn}</span><span className="small">False neg.</span></div>
              <div className="cmatrix-cell" style={{ background: `rgba(10,138,62,${0.15+(cm.tp/cm.n)*1.2})` }}><span className="big" style={{ color:'var(--up)' }}>{cm.tp}</span><span className="small">True pos.</span></div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div><h3 className="card-title">Confidence distribution</h3><p className="card-subtitle">Predicted probability histogram · n = {cm.n}</p></div>
          </div>
          <div className="card-body">
            <svg viewBox="0 0 400 240" style={{ width: '100%', height: 240 }}>
              <rect x="0" y="0" width={160} height="220" fill="var(--down)" opacity="0.05"/>
              <rect x={240} y="0" width={160} height="220" fill="var(--up)" opacity="0.05"/>
              <line x1={160} x2={160} y1="0" y2="220" stroke="var(--down)" strokeDasharray="3 3" opacity="0.5"/>
              <line x1={240} x2={240} y1="0" y2="220" stroke="var(--up)" strokeDasharray="3 3" opacity="0.5"/>
              {hist.map((c: number, i: number) => {
                const x = (i / 20) * 400, w = 18, h = (c / maxBin) * 200
                const center = (i + 0.5) / 20
                return <rect key={i} x={x+1} y={220-h} width={w} height={h} rx="2" opacity="0.85"
                  fill={center < 0.4 ? 'var(--down)' : center > 0.6 ? 'var(--up)' : 'var(--text-subtle)'}/>
              })}
              {[0, 0.25, 0.5, 0.75, 1].map(p => (
                <text key={p} x={p*400} y="236" fontSize="10" fill="var(--text-muted)" textAnchor="middle" fontFamily="var(--mono)">{p.toFixed(2)}</text>
              ))}
              <text x={80}  y="14" fontSize="10" fill="var(--down)" textAnchor="middle" fontFamily="var(--mono)">SELL &lt; 0.40</text>
              <text x={320} y="14" fontSize="10" fill="var(--up)"   textAnchor="middle" fontFamily="var(--mono)">BUY &gt; 0.60</text>
            </svg>
          </div>
        </div>
      </div>

      {lstmResult && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <h3 className="card-title">LSTM backtest performance — {focus}</h3>
            <span className="tag">2025 hold-out · live capital</span>
          </div>
          <div className="card-body">
            <div className="grid-4">
              {[
                { label: 'Total return', val: fmt.pct(lstmResult.metrics.total_return),        col: (lstmResult.metrics.total_return ?? 0) >= 0 ? 'var(--up)' : 'var(--down)' },
                { label: 'Sharpe ratio', val: lstmResult.metrics.sharpe_ratio?.toFixed(2) ?? '—', col: '' },
                { label: 'Max drawdown', val: fmt.pct(lstmResult.metrics.max_drawdown, false), col: 'var(--down)' },
                { label: 'Trades',       val: String(lstmResult.metrics.n_trades ?? '—'),      col: '' },
              ].map(s => (
                <div key={s.label}>
                  <div className="stat-label">{s.label}</div>
                  <div className="stat-value mono" style={s.col ? { color: s.col } : undefined}>{s.val}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── LangGraph pipeline steps ──────────────────────────────────────────────────

const PIPELINE_STEPS = [
  { id: 'summarize',   label: 'Summarising metrics',    icon: '📊' },
  { id: 'regime',      label: 'Analysing regime',       icon: '🌊' },
  { id: 'rank',        label: 'Ranking strategies',     icon: '🏆' },
  { id: 'risk',        label: 'Assessing risk',         icon: '⚠️' },
  { id: 'llm',         label: 'GPT-4o-mini reasoning',  icon: '🤖' },
]

// ── Main TabAI ────────────────────────────────────────────────────────────────

export default function TabAI({ data }: { data: BacktestResponse }) {
  const tickers = Object.keys(data.batch_results).filter(k => k !== 'PAIRS')
  const [focus, setFocus] = useState(tickers[0] ?? '')

  const [apiKey,    setApiKey]    = useState('')
  const [showKey,   setShowKey]   = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [step,      setStep]      = useState(-1)
  const [analysis,  setAnalysis]  = useState<AIAnalysis | null>(null)
  const [error,     setError]     = useState<string | null>(null)
  const [showRaw,   setShowRaw]   = useState(false)

  const runAnalysis = async () => {
    setLoading(true)
    setError(null)
    setAnalysis(null)
    setStep(0)

    // Simulate step progress while the backend runs
    const stepInterval = setInterval(() => {
      setStep(s => (s < PIPELINE_STEPS.length - 1 ? s + 1 : s))
    }, 1200)

    try {
      const result = await fetchAIAnalysis(apiKey || undefined)
      setAnalysis(result)
      setStep(PIPELINE_STEPS.length)
    } catch (e: unknown) {
      setError(String(e))
    } finally {
      clearInterval(stepInterval)
      setLoading(false)
    }
  }

  const riskColor = (level: string) =>
    level === 'HIGH' ? 'var(--down)' : level === 'MEDIUM' ? '#f4a261' : 'var(--up)'

  const maxScore = analysis?.strategy_rankings?.[0]?.score ?? 1

  return (
    <div className="page-fade">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">AI analysis</h1>
          <p className="page-subtitle">LSTM diagnostics + LangGraph multi-agent strategy analysis powered by Claude Haiku.</p>
        </div>
        <label className="field" style={{ minWidth: 220 }}>
          <span className="label">LSTM focus stock</span>
          <select className="select" value={focus} onChange={e => setFocus(e.target.value)}>
            {tickers.map(s => <option key={s} value={s}>{s} — {TICKER_META[s]?.name ?? s}</option>)}
          </select>
        </label>
      </div>

      {/* ── LSTM section ── */}
      <div className="card" style={{ marginBottom: 32 }}>
        <div className="card-header">
          <div>
            <h3 className="card-title">LSTM Multi-Signal · {focus}</h3>
            <p className="card-subtitle">Trained on 2020–2024 · tested on 15% held-out slice</p>
          </div>
          <span className="tag">Neural network</span>
        </div>
        <div className="card-body">
          <LSTMSection data={data} focus={focus}/>
        </div>
      </div>

      {/* ── LangGraph section ── */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">LangGraph strategy analysis</h3>
            <p className="card-subtitle">5-node pipeline: Data → Regime → Rank → Risk → Claude Haiku</p>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {PIPELINE_STEPS.map((s, i) => (
              <span key={s.id} style={{
                fontSize: 10, padding: '2px 7px', borderRadius: 10,
                fontFamily: 'var(--mono)',
                background: step > i ? 'var(--up-soft)' : step === i ? 'var(--accent-soft)' : 'var(--bg-subtle)',
                color:      step > i ? 'var(--up)'     : step === i ? 'var(--accent-text)' : 'var(--text-subtle)',
                border:     step === i && loading ? '1px solid var(--accent)' : '1px solid transparent',
                transition: 'all 0.3s',
              }}>
                {s.icon} {s.label}
              </span>
            ))}
          </div>
        </div>

        <div className="card-body">
          {/* API key + run — always visible */}
          <div style={{
            padding: '14px 16px', borderRadius: 8, marginBottom: 20,
            background: 'var(--bg-subtle)', border: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>🔑 Anthropic API key</span>
              <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 10, background: 'var(--up-soft)', color: 'var(--up)', fontFamily: 'var(--mono)' }}>optional</span>
              {apiKey && <span style={{ fontSize: 11, color: 'var(--up)', fontFamily: 'var(--mono)' }}>✓ key entered</span>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
              Leave blank to run the 4 data-analysis nodes instantly (rankings, risk flags, regime breakdown).
              Add a key from <strong>console.anthropic.com</strong> to also get a Claude Haiku natural-language narrative.
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: 1, maxWidth: 420 }}>
                <input
                  type={showKey ? 'text' : 'password'}
                  className="input"
                  style={{ width: '100%', paddingRight: 36, fontFamily: 'var(--mono)', fontSize: 12 }}
                  placeholder="sk-ant-…"
                  value={apiKey}
                  onChange={e => { setApiKey(e.target.value); setError(null) }}
                  onKeyDown={e => e.key === 'Enter' && !loading && runAnalysis()}
                />
                <button onClick={() => setShowKey(v => !v)}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, fontSize: 12 }}>
                  {showKey ? '🙈' : '👁'}
                </button>
              </div>
              <button className="btn btn-primary" style={{ minWidth: 160, height: 36, flexShrink: 0 }} onClick={runAnalysis} disabled={loading}>
                {loading
                  ? <><span style={{ display:'inline-block', width:12, height:12, border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'white', borderRadius:'50%', animation:'spin 0.7s linear infinite' }}/> Analysing…</>
                  : <><Icons.Brain size={13}/> Run AI analysis</>
                }
              </button>
              {analysis && (
                <button className="btn" style={{ fontSize: 12, height: 36 }} onClick={() => { setAnalysis(null); setStep(-1) }}>
                  Re-run
                </button>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{ padding: '12px 16px', borderRadius: 8, background: 'var(--down-soft)', color: 'var(--down)', fontSize: 13, marginBottom: 16 }}>
              <strong>Error:</strong> {error}
              <button className="btn" style={{ marginLeft: 16, fontSize: 11, padding: '2px 10px' }} onClick={() => setError(null)}>Dismiss</button>
            </div>
          )}

          {/* Loading steps */}
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {PIPELINE_STEPS.map((s, i) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 20, textAlign: 'center' }}>
                    {step > i ? '✓' : step === i ? '⟳' : '○'}
                  </span>
                  <span style={{
                    fontSize: 13,
                    color: step > i ? 'var(--up)' : step === i ? 'var(--text)' : 'var(--text-subtle)',
                    fontWeight: step === i ? 600 : 400,
                  }}>
                    {s.icon} {s.label}
                    {step === i && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-subtle)' }}>running…</span>}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Results */}
          {analysis && (
            <div>
              {/* Verdict + Top Strategy — only shown when Claude ran */}
              {analysis.llm_used ? (
                <div className="grid-2" style={{ marginBottom: 24 }}>
                  <div className="card" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}>
                    <div className="card-body">
                      <div className="stat-label" style={{ marginBottom: 8 }}>Claude verdict</div>
                      <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
                        {analysis.overall_verdict}
                      </p>
                      {analysis.regime_insight && (
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10, marginBottom: 0, fontStyle: 'italic' }}>
                          {analysis.regime_insight}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="card" style={{ background: 'var(--up-soft)', border: '1px solid var(--up)' }}>
                    <div className="card-body">
                      <div className="stat-label" style={{ marginBottom: 8 }}>Top strategy pick</div>
                      <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--up)', margin: 0, fontWeight: 600 }}>
                        {analysis.top_strategy}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '12px 16px', borderRadius: 8, background: 'var(--bg-subtle)', border: '1px solid var(--border)', marginBottom: 24, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
                  <strong style={{ color: 'var(--text)' }}>Data analysis complete</strong> — 4 nodes ran without an API key.
                  Add your Anthropic key above and re-run to get a Claude Haiku narrative summary.
                  <pre style={{ marginTop: 10, marginBottom: 0, fontFamily: 'var(--mono)', fontSize: 11, whiteSpace: 'pre-wrap', color: 'var(--text-muted)' }}>
                    {analysis.regime_analysis}
                  </pre>
                </div>
              )}

              {/* Strategy rankings */}
              <div className="card" style={{ marginBottom: 24 }}>
                <div className="card-header">
                  <h3 className="card-title">Strategy rankings</h3>
                  <p className="card-subtitle">Composite score: 40% return + 30% Sharpe + 20% drawdown resilience + 10% win rate</p>
                </div>
                <div className="card-body">
                  {analysis.strategy_rankings.map(r => (
                    <div key={r.name} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-subtle)', minWidth: 20 }}>#{r.rank}</span>
                          <span style={{ fontSize: 13, fontWeight: r.rank === 1 ? 700 : 400 }}>{r.name}</span>
                          {r.rank === 1 && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, background: 'var(--up-soft)', color: 'var(--up)', fontFamily: 'var(--mono)' }}>best</span>}
                        </div>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-muted)' }}>{r.score.toFixed(3)}</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-subtle)' }}>
                        <div style={{
                          height: '100%', borderRadius: 3,
                          width: `${(r.score / maxScore) * 100}%`,
                          background: r.rank === 1 ? 'var(--up)' : 'var(--accent)',
                          opacity: r.rank === 1 ? 1 : 0.6,
                          transition: 'width 0.4s',
                        }}/>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Risk flags */}
              <div className="card" style={{ marginBottom: 24 }}>
                <div className="card-header">
                  <h3 className="card-title">Risk flags</h3>
                  <span className="tag">{analysis.risk_flags.length} flagged</span>
                </div>
                <div className="card-body">
                  {analysis.risk_flags.map((f, i) => (
                    <div key={i} style={{
                      padding: '8px 12px', borderRadius: 6, marginBottom: 6,
                      background: f.startsWith('No critical') ? 'var(--up-soft)' : 'var(--down-soft)',
                      color:      f.startsWith('No critical') ? 'var(--up)'      : 'var(--down)',
                      fontSize: 12, lineHeight: 1.5,
                    }}>
                      {f.startsWith('No critical') ? '✓ ' : '⚠ '}{f}
                    </div>
                  ))}
                </div>
              </div>

              {/* Ticker verdicts table */}
              <div className="card" style={{ marginBottom: 24 }}>
                <div className="card-header">
                  <h3 className="card-title">Per-ticker recommendations</h3>
                  <p className="card-subtitle">Best strategy + risk level from backtest data</p>
                </div>
                <div className="card-body flush">
                  <table className="tbl">
                    <thead><tr>
                      <th>Ticker</th>
                      <th>Best strategy</th>
                      <th className="right">Return</th>
                      <th className="right">Max DD</th>
                      <th>Risk</th>
                    </tr></thead>
                    <tbody>
                      {Object.entries(analysis.ticker_verdicts).map(([sym, v]) => (
                        <tr key={sym}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{sym}</div>
                            <div className="tiny muted">{TICKER_META[sym]?.name ?? ''}</div>
                          </td>
                          <td style={{ fontSize: 12 }}>{v.best_strategy}</td>
                          <td className="num" style={{ color: v.return >= 0 ? 'var(--up)' : 'var(--down)', fontWeight: 600 }}>{fmt.pct(v.return)}</td>
                          <td className="num" style={{ color: 'var(--down)' }}>{fmt.pct(v.max_drawdown, false)}</td>
                          <td>
                            <span style={{
                              fontSize: 10, padding: '2px 7px', borderRadius: 10,
                              fontFamily: 'var(--mono)', fontWeight: 600,
                              color: riskColor(v.risk_level),
                              background: `${riskColor(v.risk_level)}18`,
                              border: `1px solid ${riskColor(v.risk_level)}40`,
                            }}>
                              {v.risk_level}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Raw LLM output — only when Claude ran */}
              {analysis.llm_used && <div className="card">
                <div className="card-header" style={{ cursor: 'pointer' }} onClick={() => setShowRaw(v => !v)}>
                  <div>
                    <h3 className="card-title">Full GPT-4o-mini analysis</h3>
                    <p className="card-subtitle">Raw LLM output from generate_recommendations node</p>
                  </div>
                  <span style={{ fontSize: 14, display: 'inline-block', transform: showRaw ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
                </div>
                {showRaw && (
                  <div className="card-body">
                    <pre style={{
                      fontFamily: 'var(--mono)', fontSize: 12, lineHeight: 1.7,
                      color: 'var(--text)', whiteSpace: 'pre-wrap', margin: 0,
                      background: 'var(--bg-subtle)', padding: 16, borderRadius: 8,
                    }}>
                      {analysis.raw_analysis}
                    </pre>
                  </div>
                )}
              </div>}
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
