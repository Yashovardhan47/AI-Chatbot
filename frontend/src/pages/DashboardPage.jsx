import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowUpRight, ArrowUp, Brain, BookOpen, CalendarCheck, MessageSquare, Inbox, ShieldCheck, Plus, ArrowRight, Sparkles, Folder, Check, Circle } from "lucide-react";
import WorkspaceShell from "../components/WorkspaceShell";
import useAuthStore from "../context/authStore";
import useChatStore from "../context/chatStore";
import { continuityAPI, workspaceAPI } from "../services/api";

export default function HomePage() {
  const { user } = useAuthStore();
  const { chats, fetchChats, newChat } = useChatStore();
  const [overview, setOverview] = useState(null), [review, setReview] = useState(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [draft, setDraft] = useState(""), [scope, setScope] = useState("");
  const [starting, setStarting] = useState(false), [completing, setCompleting] = useState("");
  const navigate = useNavigate();
  const load = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled([continuityAPI.overview(), workspaceAPI.review()]);
    if (results[0].status === "fulfilled") setOverview(results[0].value.data);
    if (results[1].status === "fulfilled") setReview(results[1].value.data.total);
    setError(results.some(result => result.status === "rejected") ? "Some workspace information could not load. Your saved data is still on the server." : "");
    setLoading(false);
  }, []);
  useEffect(() => { fetchChats(); load(); }, [fetchChats, load]);
  async function start(event) {
    event?.preventDefault(); if (starting) return;
    setStarting(true); setError("");
    try { const chat = await newChat(scope || null); navigate(`/chat/${chat.id}`, { state: { draft: draft.trim() } }); }
    catch { setError("Your conversation could not open. Retry when the workspace is connected."); }
    finally { setStarting(false); }
  }
  async function complete(task) {
    setCompleting(task.id);
    try { await continuityAPI.update(task.id, { status: "done", expected_version: task.version }); await load(); }
    catch { setError("This commitment may have changed. Refresh your home before trying again."); }
    finally { setCompleting(""); }
  }
  const counts = overview?.counts || {};
  const first = user?.name?.split(" ")[0] || "there";
  return <WorkspaceShell eyebrow="YOUR CONTEXT, READY TO CONTINUE" title={`A little further, ${first}.`} description={user?.preferences?.workspace_goal || "Bring your next idea. We'll keep the thread together."}
    action={<Link to="/security" className="ns-home-security"><ShieldCheck size={15} />Account security<ArrowUpRight size={13} /></Link>}>
    {error && <div role="alert" className="ns-inline-error">{error}<button onClick={load}>Refresh</button></div>}
    <div className="ns-home-layout">
      <div className="ns-home-main">
        <section className="ns-ask-card"><div className="ns-ask-heading"><span className="ns-spark"><Sparkles size={20} /></span><span>ONE THOUGHT LEADS TO ANOTHER</span><span className="ns-chip">NeuroSense</span></div>
          <h2>What are we thinking about?</h2><p>Start something new, or build on what you already know.</p>
          <form onSubmit={start}><label className="sr-only" htmlFor="home-draft">Start a conversation</label>
            <textarea id="home-draft" value={draft} onChange={event => setDraft(event.target.value)} maxLength={20000} placeholder="A question, an idea, a decision to make…" rows={3} />
            <div className="ns-ask-toolbar"><label><Folder size={14} /><select aria-label="Conversation context" value={scope} onChange={event => setScope(event.target.value)}><option value="">Personal context</option>{overview?.projects?.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
              <button className="ns-primary" disabled={starting}>{starting ? "Opening…" : "Open conversation"}<ArrowUp size={16} /></button></div>
          </form>
          <small>Your text opens as a draft. You decide when to send it.</small>
          <div className="ns-prompt-row">{["Build on a previous decision", "Understand a source", "Explore a new idea"].map((title, index) => <button key={title} onClick={() => { setDraft(["What do you remember about my current project decisions?", "Help me analyze the source documents in my knowledge library.", "Help me think through a new idea. Ask me what context you need first."][index]); document.getElementById("home-draft")?.focus(); }}>{title}<ArrowUpRight size={12} /></button>)}</div>
        </section>
        <section className="ns-panel"><div className="ns-panel-heading"><div><span className="ns-eyebrow">CONTINUE THE THREAD</span><h2>Recent conversations</h2></div><Link to="/chat">View all<ArrowUpRight size={14} /></Link></div>
          <div className="ns-conversation-list">{chats.slice(0, 3).map(chat => <Link key={chat.id} to={`/chat/${chat.id}`}><span className="ns-conversation-icon"><MessageSquare size={18} /></span><span><strong>{chat.title}</strong><small>{chat.message_count || 0} messages · {chat.project_id ? "Project context" : "Personal context"}</small></span><ArrowUpRight size={15} /></Link>)}
            {!chats.length && <div className="ns-empty"><MessageSquare size={28} /><p>Every lasting thread starts with one conversation.</p><button className="ns-text-button" onClick={start} disabled={starting}>Create your first conversation →</button></div>}</div>
        </section>
        <div className="ns-home-metrics" aria-busy={loading}>{[[Brain, "Memories", counts.memories, "/memory"], [BookOpen, "Sources", counts.documents, "/knowledge"], [CalendarCheck, "Open steps", counts.pending_tasks, "/continuity"]].map(([Icon, label, value, path]) => <Link to={path} key={label}><Icon size={17} /><strong>{loading ? "—" : value ?? "—"}</strong><span>{label}</span><ArrowUpRight size={13} /></Link>)}</div>
      </div>
      <aside className="ns-home-rail">
        <section className="ns-inbox-card"><div className="ns-panel-heading"><span className="ns-spark"><Inbox size={19} /></span><span className="ns-chip">{review ?? "—"} pending</span></div><h2>Keep what matters.</h2><p>{review > 0 ? "New facts are waiting for your decision. Check the original words before they enter recall." : "Your memory inbox is clear. Proposed facts appear here when review is enabled."}</p><Link to="/review">Open memory inbox<ArrowRight size={16} /></Link></section>
        <section className="ns-panel ns-follow-through"><div className="ns-panel-heading"><div><span className="ns-eyebrow">FOLLOW THROUGH</span><h2>Your next steps</h2></div><CalendarCheck size={18} /></div>
          {overview?.tasks?.slice(0, 4).map(task => <div className="ns-home-task" key={task.id}><button aria-label={`Complete ${task.title}`} disabled={completing === task.id} onClick={() => complete(task)}>{completing === task.id ? <Check size={17} /> : <Circle size={17} />}</button><Link to="/continuity"><strong>{task.title}</strong><small>{task.due_at ? new Date(task.due_at.endsWith("Z") ? task.due_at : task.due_at + "Z").toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "No due date"}</small></Link></div>)}
          {!overview?.tasks?.length && <p className="ns-muted">Make the next step explicit. Add a commitment to keep it in view.</p>}
          <Link to="/continuity" className="ns-card-footer"><Plus size={14} />Manage commitments<ArrowUpRight size={13} /></Link></section>
        <section className="ns-memory-policy"><ShieldCheck size={18} /><div><strong>{!user?.preferences?.memory_enabled ? "Memory is paused" : user.preferences.memory_review_required ? "You review before recall" : user.preferences.memory_auto_capture ? "Automatic capture is on" : "You choose what to save"}</strong><p>Inspect sources, change a fact or pause capture whenever you need.</p><Link to="/settings">Your memory preferences<ArrowUpRight size={12} /></Link></div></section>
      </aside>
    </div>
  </WorkspaceShell>;
}
