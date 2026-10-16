import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, ArrowUpRight, Check, GitBranch, Search, ShieldCheck, RefreshCw, Sparkles, MessageSquare, ListChecks } from "lucide-react";
import WorkspaceShell from "../components/WorkspaceShell";
import { contextAPI, memoryAPI } from "../services/api";
import api from "../services/api";
import toast from "react-hot-toast";

const labels = { review: "Needs review", possible: "Possible impact", supported: "Independent support", reviewed: "Evidence reviewed" };
const reasons = { included: "Included", outside_scope: "Outside this scope", inactive: "Inactive", expired: "Expired", unconfirmed: "Awaiting confirmation", memory_paused: "Memory paused", not_relevant: "No ranked match", budget_or_limit: "Budget or result limit" };
const tabs = [["impact", "Impact replay", GitBranch], ["audit", "Recall decisions", Search], ["clarify", "Clarify a decision", MessageSquare]];
const format = value => new Date(/[Z+]\d*:?\d*$/.test(value) ? value : value + "Z").toLocaleString();

function ImpactList({ report, busy, onReplay, onMore }) {
  return <section className="ns-lab-report" aria-label="Recorded change impact"><div className="ns-lab-counts">{Object.entries(labels).map(([key, title]) => <div key={key}><strong>{report.counts?.[key] || 0}</strong><span>{title}</span></div>)}</div>
    <p className="ns-lab-explainer">Recorded context suggests which items to inspect. Confirmed support applies only to the exact claims you tracked; other dependencies may be unknown.</p>
    {!report.scan_complete && <p className="ns-lab-warning" role="status">This workspace exceeds the bounded scan. Additional affected items may exist.</p>}
    <div className="ns-lab-targets">{report.items.map(item => <article key={item.kind + item.id} data-motion-card><header><span>{item.kind === "answer" ? <MessageSquare size={15} /> : <ListChecks size={15} />}{item.kind === "answer" ? "Conversation answer" : "Commitment"}</span><span className={`ns-lab-state ${item.classification}`}>{labels[item.classification]}</span></header><h2>{item.title}</h2><p>{item.excerpt}</p>
      {item.claims?.map(claim => <blockquote key={claim.id}>“{claim.quote}”<small>{claim.independent_support_survives ? "A complete alternative support group still holds." : "A confirmed support group changed."}</small></blockquote>)}
      <footer><Link to={item.href}>Open original<ArrowUpRight size={13} /></Link>{onReplay && <button className="ns-secondary" disabled={busy} onClick={() => onReplay(item)}>Replay current evidence<ArrowRight size={14} /></button>}</footer></article>)}</div>
    {!report.items.length && <div className="ns-lab-empty"><ShieldCheck size={26} /><h2>No recorded downstream references.</h2><p>This does not prove there are no dependencies. Future answers can record evidence and you can track exact claim support.</p><Link to="/chat">Open conversations<ArrowUpRight size={14} /></Link></div>}
    {report.has_more && <button disabled={busy} className="ns-secondary" onClick={onMore}>Load more recorded impact</button>}
  </section>;
}

export default function ContextLabPage() {
  const [params, setParams] = useSearchParams();
  const tab = tabs.some(([key]) => key === params.get("tab")) ? params.get("tab") : "impact";
  const [memories, setMemories] = useState([]), [projects, setProjects] = useState([]), [changes, setChanges] = useState([]);
  const [memoryId, setMemoryId] = useState(params.get("memory") || ""), [action, setAction] = useState("correct"), [fact, setFact] = useState("");
  const [preview, setPreview] = useState(null), [report, setReport] = useState(null), [activeChange, setActiveChange] = useState("");
  const [replay, setReplay] = useState(null), [taskTitle, setTaskTitle] = useState(""), [taskNotes, setTaskNotes] = useState("");
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [query, setQuery] = useState(""), [scope, setScope] = useState(""), [budget, setBudget] = useState(6000), [audit, setAudit] = useState(null);
  const [decisionQuery, setDecisionQuery] = useState(""), [decision, setDecision] = useState(null), [choices, setChoices] = useState([]);
  const [changesMore, setChangesMore] = useState(false), [changeCursor, setChangeCursor] = useState(0);
  const request = useRef(0), replayHeading = useRef(null);
  const selected = memories.find(memory => memory.id === memoryId);
  const changeBody = () => ({ memory_id: memoryId, expected_version: selected?.version, action, fact: action === "correct" ? fact.trim() : null });
  function resetPreview() { setPreview(null); setReplay(null); }
  async function load() {
    setLoading(true);
    try {
      const [m, c, p] = await Promise.all([memoryAPI.getAll({ limit: 200 }), contextAPI.changes(), api.get("/projects/")]);
      let values = m.data.memories;
      const desired = params.get("memory");
      if (desired && !values.some(item => item.id === desired)) {
        try { const { data } = await memoryAPI.getOne(desired); values = [data.memory, ...values]; } catch { /* unavailable deep link stays visibly unselected */ }
      }
      setMemories(values); setChanges(c.data.changes); setChangesMore(!!c.data.has_more); setChangeCursor(c.data.next_offset ?? c.data.changes.length); setProjects(p.data.projects); setError("");
    } catch { setError("We couldn't load Context Lab. Check the workspace connection, then retry."); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); return () => { request.current += 1; }; }, []);
  useEffect(() => {
    const id = params.get("change");
    if (id) openChange(id);
  }, [params.get("change")]);
  async function run(operation) {
    setBusy(true); setError(""); const ticket = ++request.current;
    try { await operation(ticket); }
    catch (err) {
      if (ticket === request.current) {
        setError(typeof err.response?.data?.detail === "string" ? err.response.data.detail : "That action couldn't complete. Please retry.");
        if ([401, 404, 409].includes(err.response?.status)) { setReplay(null); setPreview(null); }
      }
    } finally { if (ticket === request.current) setBusy(false); }
  }
  async function openChange(id) {
    await run(async ticket => { const { data } = await contextAPI.impact(id); if (ticket !== request.current) return; setActiveChange(id); setReport(data); setPreview(null); setReplay(null); });
  }
  async function inspect(event) {
    event.preventDefault(); await run(async ticket => { const { data } = await contextAPI.preview(changeBody()); if (ticket !== request.current) return; setPreview(data); setReport(null); setActiveChange(""); setReplay(null); });
  }
  async function commit() {
    if (!preview) return;
    await run(async ticket => {
      const { data } = await contextAPI.commit({ ...changeBody(), expected_context_revision: preview.context_revision, preview_token: preview.preview_token });
      if (ticket !== request.current) return;
      setPreview(null); setFact("");
      const impact = await contextAPI.impact(data.change_id); if (ticket !== request.current) return;
      setReport(impact.data); setActiveChange(data.change_id);
      if (data.memory) setMemories(items => items.map(item => item.id === data.memory.id ? data.memory : item));
      else { setMemories(items => items.filter(item => item.id !== memoryId)); setMemoryId(""); }
      const history = await contextAPI.changes(); if (ticket !== request.current) return;
      setChanges(history.data.changes); setChangesMore(!!history.data.has_more); setChangeCursor(history.data.next_offset ?? history.data.changes.length); toast.success("Memory updated. Review the recorded impact below.");
    });
  }
  async function prepare(item) {
    await run(async ticket => { const { data } = await contextAPI.replay({ change_id: activeChange, target_kind: item.kind, target_id: item.id }); if (ticket !== request.current) return; setReplay(data); setTaskTitle(data.task?.title || ""); setTaskNotes(data.task?.notes || ""); requestAnimationFrame(() => replayHeading.current?.focus()); });
  }
  async function apply(event) {
    event.preventDefault(); if (!replay) return;
    await run(async ticket => { await contextAPI.apply(replay.id, replay.target_kind === "task" ? { title: taskTitle.trim(), notes: taskNotes } : {}); if (ticket !== request.current) return; setReplay(null); const { data } = await contextAPI.impact(activeChange); if (ticket === request.current) { setReport(data); toast.success("Reviewed update applied."); } });
  }
  async function more() {
    await run(async ticket => {
      const current = preview || report, offset = current.items.length;
      const { data } = preview ? await contextAPI.preview(changeBody(), { offset }) : await contextAPI.impact(activeChange, { offset });
      if (ticket !== request.current) return;
      if (data.context_revision !== current.context_revision) {
        setPreview(null); setReport(null); setError("Context changed while loading the report. Preview or open the change again."); return;
      }
      const updated = { ...data, items: [...current.items, ...data.items] };
      preview ? setPreview(updated) : setReport(updated);
    });
  }
  async function runAudit(event) { event.preventDefault(); await run(async ticket => { const { data } = await contextAPI.audit({ query: query.trim(), project_id: scope || null, budget: Number(budget) }); if (ticket === request.current) setAudit(data); }); }
  async function clarify(event, nextChoices = choices) { event?.preventDefault(); await run(async ticket => { const { data } = await contextAPI.clarify({ query: decisionQuery.trim(), project_id: scope || null, choices: nextChoices }); if (ticket === request.current) { setDecision(data); setChoices(nextChoices); } }); }

  return <WorkspaceShell eyebrow="CONTEXT LAB · EXPERIMENTAL WORKFLOWS" title="Keep your context current." description="Inspect what a memory change touches, replay eligible evidence, and approve the next step. Your original conversations stay historical." action={<Link className="ns-secondary" to="/memory">Memory Studio<ArrowUpRight size={14} /></Link>}>
    <div className="ns-lab-workflow" aria-label="Context review workflow">{["Inspect evidence", "Preview change", "Replay current context", "Approve a review"].map((text, index) => <span key={text}><i>0{index + 1}</i>{text}{index < 3 && <ArrowRight size={13} />}</span>)}</div>
    <div className="ns-section-tabs" role="tablist" aria-label="Context tools" onKeyDown={event => {
      if (busy || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault(); const index = tabs.findIndex(([key]) => key === tab);
      const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      setParams({ tab: tabs[next][0] }); requestAnimationFrame(() => document.getElementById(`lab-tab-${tabs[next][0]}`)?.focus());
    }}>{tabs.map(([key, title, Icon]) => <button role="tab" tabIndex={tab === key ? 0 : -1} disabled={busy} aria-selected={tab === key} id={`lab-tab-${key}`} aria-controls={`lab-panel-${key}`} key={key} className={tab === key ? "active" : ""} onClick={() => { setParams({ tab: key }); setError(""); }}><Icon size={15} />{title}</button>)}</div>
    {error && <div className="ns-lab-warning" role="alert"><p>{error}</p><button disabled={busy} onClick={load}>Retry workspace connection</button><Link to="/auth-setup">Check sign-in setup<ArrowUpRight size={13} /></Link></div>}
    {loading && <p role="status" className="ns-muted">Loading your context tools…</p>}
    {tab === "impact" && <div role="tabpanel" id="lab-panel-impact" aria-labelledby="lab-tab-impact">
      <div className="ns-lab-columns"><section className="ns-panel"><span className="ns-eyebrow">01 / PROPOSE A CHANGE</span><h2>What changed?</h2><form onSubmit={inspect}><label htmlFor="lab-memory">Remembered fact</label><select id="lab-memory" value={memoryId} disabled={busy} onChange={event => { setMemoryId(event.target.value); setFact(""); resetPreview(); }}><option value="">Choose a memory</option>{memories.map(memory => <option key={memory.id} value={memory.id}>{memory.fact.slice(0, 100)} · v{memory.version}</option>)}</select>{selected && <blockquote>{selected.fact}<small>Current version {selected.version} · {selected.project_id ? "Project context" : "Personal context"}</small></blockquote>}
        <fieldset disabled={busy} className="ns-lab-radio"><legend>Change type</legend><label><input disabled={busy} type="radio" name="change-type" checked={action === "correct"} onChange={() => { setAction("correct"); resetPreview(); }} />Correct</label><label><input disabled={busy} type="radio" name="change-type" checked={action === "revoke"} onChange={() => { setAction("revoke"); resetPreview(); }} />Remove</label></fieldset>
        {action === "correct" ? <><label htmlFor="lab-fact">Corrected fact</label><textarea id="lab-fact" rows={3} minLength={2} maxLength={1000} required disabled={busy} value={fact} onChange={event => { setFact(event.target.value); resetPreview(); }} placeholder="Write the current fact in your own words." /></> : <p className="ns-lab-explainer">Removal deletes this fact and its revisions. A reference-only change record remains for impact review. Existing conversations and commitments are separate records; Clear all memories also removes the review records.</p>}
        <button className="ns-primary" disabled={busy || !selected || (action === "correct" && (fact.trim().length < 2 || fact.trim() === selected.fact))}>{busy ? "Working…" : "Preview recorded impact"}<GitBranch size={15} /></button></form>
        {!memories.length && !loading && <p className="ns-lab-explainer">Start by saving a fact in <Link to="/memory">Memory Studio</Link> or a <Link to="/chat">conversation</Link>.</p>}
      </section><section className="ns-panel"><span className="ns-eyebrow">OR / REVISIT A CHANGE</span><h2>Recent memory changes</h2><p className="ns-lab-explainer">Manual corrections, removals and stable-slot updates appear here. Replay applies a separate reviewed update.</p><div className="ns-lab-history">{changes.map(change => <button disabled={busy} key={change.id} className={activeChange === change.id ? "selected" : ""} onClick={() => openChange(change.id)}><span><strong>{change.action === "revoked" ? "Memory removed" : `Version ${change.before_version} → ${change.after_version}`}</strong><small>{change.current_fact || "Evidence no longer eligible"}</small></span><ArrowUpRight size={15} /></button>)}</div>{!changes.length && <p className="ns-muted">Changes will appear after your first correction.</p>}{changesMore && <button className="ns-text-button" disabled={busy} onClick={() => run(async ticket => { const { data } = await contextAPI.changes({ offset: changeCursor }); if (ticket === request.current) { setChanges(items => [...new Map([...items, ...data.changes].map(item => [item.id, item])).values()]); setChangesMore(!!data.has_more); setChangeCursor(data.next_offset ?? changeCursor + data.changes.length); } })}>Load earlier changes</button>}</section></div>
      {preview && <section className="ns-lab-preview"><header><span className="ns-eyebrow">02 / REVIEW BEFORE APPLYING</span><h2>{action === "correct" ? "Preview this correction." : "Preview this removal."}</h2><p>{preview.proposed_fact || "This fact and its revisions will be removed."}</p></header><ImpactList report={preview} busy={busy} onMore={more} /><button className={action === "revoke" ? "ns-danger" : "ns-primary"} disabled={busy} onClick={commit}>{action === "revoke" ? "Remove this memory" : "Apply this correction"}<Check size={15} /></button></section>}
      {report && <><div className="ns-lab-section-heading"><span className="ns-eyebrow">02 / RECORDED DOWNSTREAM IMPACT</span><h2>Choose what needs a closer look.</h2></div><ImpactList report={report} busy={busy} onReplay={prepare} onMore={more} /></>}
      {replay && <section className="ns-lab-replay ns-panel"><span className="ns-eyebrow">03 / CURRENT EVIDENCE REPLAY</span><h2 ref={replayHeading} tabIndex={-1}>Review before applying.</h2><p>{replay.proposal}</p><small>Review expires {format(replay.expires_at)}. Changes to evidence or permissions require a fresh replay.</small><div className="ns-lab-evidence">{replay.evidence.map(item => <blockquote key={item.id}>{item.fact}<small>Current eligible evidence · v{item.version}</small></blockquote>)}{!replay.evidence.length && <p className="ns-lab-warning">No linked memory is currently eligible. An answer review will show an evidence-unavailable notice.</p>}</div><form onSubmit={apply}>{replay.target_kind === "task" && <><label htmlFor="repair-title">Reviewed commitment title</label><input disabled={busy} id="repair-title" required minLength={2} maxLength={200} value={taskTitle} onChange={event => setTaskTitle(event.target.value)} /><label htmlFor="repair-notes">Reviewed notes</label><textarea disabled={busy} id="repair-notes" maxLength={2000} rows={3} value={taskNotes} onChange={event => setTaskNotes(event.target.value)} /></>}<button className="ns-primary" disabled={busy}>{replay.target_kind === "answer" ? "Approve evidence note" : "Apply reviewed commitment"}<Check size={15} /></button><button className="ns-secondary" type="button" disabled={busy} onClick={() => setReplay(null)}>Dismiss</button></form></section>}
    </div>}
    {tab === "audit" && <section role="tabpanel" id="lab-panel-audit" aria-labelledby="lab-tab-audit" className="ns-lab-audit"><div className="ns-panel"><span className="ns-eyebrow">WHY CONTEXT WAS CHOSEN</span><h2>A receipt for recall decisions.</h2><p className="ns-lab-explainer">Inspect eligible memory matches and the context budget. Ineligible sources are counted with their text and identifiers withheld.</p><form onSubmit={runAudit}><label htmlFor="audit-query">Recall question</label><textarea disabled={busy} id="audit-query" rows={3} required minLength={2} maxLength={2000} value={query} onChange={event => { setQuery(event.target.value); setAudit(null); }} /><label htmlFor="audit-scope">Context scope</label><select disabled={busy} id="audit-scope" value={scope} onChange={event => { setScope(event.target.value); setAudit(null); setDecision(null); setChoices([]); }}><option value="">Personal context</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name} + personal</option>)}</select><label htmlFor="audit-budget">Context budget · characters</label><input disabled={busy} id="audit-budget" type="number" min={200} max={16000} step={100} required value={budget} onChange={event => { setBudget(event.target.value); setAudit(null); }} /><button className="ns-primary" disabled={busy || query.trim().length < 2}>Inspect recall<Search size={15} /></button></form></div>{audit && <div className="ns-lab-audit-result" aria-live="polite"><div className="ns-lab-counts">{Object.entries(audit.counts).map(([key, value]) => <div key={key}><strong>{value}</strong><span>{reasons[key]}</span></div>)}</div><p className="ns-lab-explainer">{audit.disabled ? "Memory is paused; no fact text is shown." : `${audit.context_chars} / ${audit.budget} characters · ${audit.retrieval_mode} retrieval`}</p>{audit.details_complete === false && <p className="ns-lab-warning">Detailed rows are limited to 200 eligible facts; the counts cover the full owner scan.</p>}{audit.decisions.map(item => <article key={item.id} className="ns-lab-audit-row"><span className={`ns-lab-state ${item.decision === "included" ? "supported" : "possible"}`}>{reasons[item.decision]}</span><p>{item.fact}</p><Link to={`/memory?memory=${item.id}`}>Inspect v{item.version}<ArrowUpRight size={13} /></Link></article>)}</div>}</section>}
    {tab === "clarify" && <section role="tabpanel" id="lab-panel-clarify" aria-labelledby="lab-tab-clarify" className="ns-lab-decision ns-panel"><span className="ns-eyebrow">ASK WHEN CONTEXT CHANGES THE DECISION</span><h2>Clarify once. Keep moving.</h2><p className="ns-lab-explainer">This check flags explicit contradictions or different values of one stable context slot. It is a bounded heuristic, not a detector of every possible conflict. The same check runs before decision-oriented chat answers.</p><form onSubmit={clarify}><label htmlFor="decision-query">Decision question</label><textarea disabled={busy} id="decision-query" rows={3} required minLength={2} maxLength={2000} value={decisionQuery} onChange={event => { setDecisionQuery(event.target.value); setDecision(null); setChoices([]); }} placeholder="Which backend should I use for the project?" /><label htmlFor="decision-scope">Decision context</label><select disabled={busy} id="decision-scope" value={scope} onChange={event => { setScope(event.target.value); setDecision(null); setChoices([]); }}><option value="">Personal context</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name} + personal</option>)}</select><button className="ns-primary" disabled={busy || decisionQuery.trim().length < 2}>Check decision context<Sparkles size={15} /></button></form>{decision && <div className="ns-lab-clarification" aria-live="polite">{decision.needs_clarification ? <><h3>{decision.question}</h3><p>{decision.reason}</p>{decision.alternatives.map(item => <button key={item.id} disabled={busy || choices.length >= 8} onClick={() => clarify(null, [...choices, { id: item.id, version: item.version }])}><span>{item.fact}<small>{item.scope} · version {item.version} · for this check only</small></span><ArrowRight size={16} /></button>)}</> : <><Check size={24} /><h3>{choices.length ? "Your context choice is clear." : "No decision conflict detected."}</h3><p>{choices.length ? "The selected context will guide this check. Your saved facts have not been edited." : "No eligible explicit contradiction or stable-slot conflict matched this question. Other ambiguities may still exist."}</p><Link to="/chat">Continue in conversations<ArrowUpRight size={14} /></Link></>}</div>}</section>}
  </WorkspaceShell>;
}
