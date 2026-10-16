import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Check, GitBranch, Plus, ShieldCheck, X } from "lucide-react";
import { contextAPI, continuityAPI } from "../services/api";
import Modal from "./Modal";
import toast from "react-hot-toast";

export default function AnswerTools({ message, chatId, projectId }) {
  const [panel, setPanel] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [data, setData] = useState(null), [quote, setQuote] = useState(""), [groups, setGroups] = useState([[], [], []]), [independent, setIndependent] = useState(false), [third, setThird] = useState(false), [supportVersion, setSupportVersion] = useState(0);
  const [title, setTitle] = useState(""), [notes, setNotes] = useState(""), [due, setDue] = useState("");
  async function inspect() {
    setPanel("support"); setBusy(true); setError(""); setData(null); setQuote(""); setGroups([[], [], []]); setThird(false); setSupportVersion(0); setIndependent(false);
    try { const { data } = await contextAPI.answer(chatId, message.id); setData(data); }
    catch (err) { setError(err.response?.data?.detail || "This answer's evidence could not load."); }
    finally { setBusy(false); }
  }
  function select(group, id) { setGroups(values => values.map((value, index) => index === group ? value.includes(id) ? value.filter(key => key !== id) : [...value, id] : value)); }
  async function saveSupport(event) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const sets = groups.slice(0, third ? 3 : independent ? 2 : 1).map(group => group.map(id => { const item = data.available_evidence.find(value => value.id === id); return { id, version: item.version }; }));
      await contextAPI.support({ chat_id: chatId, message_id: message.id, quote, answer_fingerprint: data.answer_fingerprint, support_sets: sets, expected_version: supportVersion });
      setPanel(null); toast.success("Owner-confirmed claim support saved.");
    } catch (err) { setError(err.response?.data?.detail || "Support could not be saved. Reload the evidence and retry."); }
    finally { setBusy(false); }
  }
  async function saveTask(event) {
    event.preventDefault(); setBusy(true); setError("");
    try { await continuityAPI.create({ title: title.trim(), notes, project_id: projectId || null, source_chat_id: chatId, source_message_id: message.id, due_at: due ? new Date(due).toISOString() : null }); setPanel(null); setTitle(""); setNotes(""); setDue(""); toast.success("Commitment saved with its source evidence."); }
    catch (err) { setError(err.response?.data?.detail || "The commitment could not be saved."); }
    finally { setBusy(false); }
  }
  function edit(claim) { setQuote(claim.quote); setSupportVersion(claim.version); setGroups([0,1,2].map(index => (claim.support_sets[index] || []).map(ref => ref.id).filter(id => data.available_evidence.some(item => item.id === id)))); setIndependent(claim.support_sets.length > 1); setThird(claim.support_sets.length > 2); }
  return <div className="ns-answer-tools"><button onClick={inspect}><GitBranch size={13} />Track claim support</button><button onClick={() => { setError(""); setPanel("task"); }}><Plus size={13} />Keep a next step</button>
    {message.context_reviews?.map(review => <aside className="ns-answer-review" key={review.change_id}><ShieldCheck size={16} /><div><strong>{review.state === "current" ? "Current evidence · reviewed by you" : "Reviewed source is no longer eligible"}</strong>{review.evidence.map(item => <p key={item.id}>{item.fact}<small>Memory version {item.version}</small></p>)}{!review.evidence.length && <p>Review the answer before relying on it. Its original text remains historical.</p>}<Link to={`/context-lab?change=${review.change_id}`}>Inspect the context change<ArrowUpRight size={12} /></Link></div></aside>)}
    {panel && <Modal titleId="answer-tools-title" className="ns-answer-tool-modal" onClose={() => { if (!busy) setPanel(null); }}><header><span className="ns-eyebrow">FROM EVIDENCE TO NEXT STEP</span><button aria-label="Close answer tools" disabled={busy} onClick={() => setPanel(null)}><X size={18} /></button></header><h2 id="answer-tools-title">{panel === "support" ? "Track an exact claim." : "Make the next step explicit."}</h2>
      {error && <div className="ns-lab-warning" role="alert">{error}<Link to="/context-lab">Review context changes<ArrowUpRight size={12} /></Link></div>}
      {panel === "support" ? <>{busy && !data && <p role="status">Loading eligible evidence…</p>}{data && <form onSubmit={saveSupport}><p className="ns-lab-explainer">You confirm the supporting evidence. Each group needs all its checked memories; an independent group is an alternative. This does not prove the model's reasoning.</p><label htmlFor="claim-quote">Exact words from this answer</label><textarea id="claim-quote" minLength={2} maxLength={600} required rows={3} value={quote} disabled={busy} onChange={event => { setQuote(event.target.value); setSupportVersion(0); }} placeholder="Paste the exact claim you want to track." />{data.claims.length > 0 && <div className="ns-support-existing"><strong>Already tracked</strong>{data.claims.map(claim => <button key={claim.id} type="button" disabled={busy} onClick={() => edit(claim)}>Edit support: {claim.quote}</button>)}</div>}
        {[0, ...(independent ? [1] : []), ...(third ? [2] : [])].map(group => <fieldset key={group} disabled={busy}><legend>{group === 0 ? "Primary support group" : group === 1 ? "Independent alternative support" : "Second alternative support"}</legend><div className="ns-support-choices">{data.available_evidence.map(item => <label key={item.id}><input type="checkbox" checked={groups[group].includes(item.id)} onChange={() => select(group, item.id)} /><span>{item.fact}<small>Current eligible memory · version {item.version}</small></span></label>)}{!data.available_evidence.length && <p>No current eligible memories. Save or confirm evidence in Memory Studio first.</p>}</div></fieldset>)}
        {data.has_more_evidence && <p className="ns-lab-explainer">Showing the first 100 eligible memories. Add focused evidence in Memory Studio if the source is missing.</p>}<label className="ns-support-alternative"><input type="checkbox" disabled={busy} checked={independent} onChange={event => { setIndependent(event.target.checked); if (!event.target.checked) setThird(false); }} />Add an independent support group</label>{independent && <label className="ns-support-alternative"><input type="checkbox" disabled={busy} checked={third} onChange={event => setThird(event.target.checked)} />Add a second alternative group</label>}<button className="ns-primary" disabled={busy || !groups[0].length || groups[0].length > 4 || (independent && (!groups[1].length || groups[1].length > 4)) || (third && (!groups[2].length || groups[2].length > 4))}>Confirm this support<Check size={15} /></button></form>}</> : <form onSubmit={saveTask}><p className="ns-lab-explainer">Write a commitment you want to keep. Its source answer and eligible memory versions stay linked for later impact review.</p><label htmlFor="answer-task-title">Commitment title</label><input id="answer-task-title" required minLength={2} maxLength={200} value={title} disabled={busy} onChange={event => setTitle(event.target.value)} /><label htmlFor="answer-task-notes">Notes</label><textarea id="answer-task-notes" rows={3} maxLength={2000} value={notes} disabled={busy} onChange={event => setNotes(event.target.value)} /><label htmlFor="answer-task-due">Due time · device time · optional</label><input id="answer-task-due" type="datetime-local" value={due} disabled={busy} onChange={event => setDue(event.target.value)} /><button className="ns-primary" disabled={busy}>Save commitment<Check size={15} /></button><Link to="/continuity">Open Continuity<ArrowUpRight size={13} /></Link></form>}
    </Modal>}
  </div>;
}
