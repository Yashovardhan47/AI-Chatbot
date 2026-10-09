import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Brain, Search, Plus, Pin, Trash2, Check, Clock, ArrowLeft, Shield, Sparkles, X, Save } from "lucide-react";
import toast from "react-hot-toast";
import { memoryAPI, userAPI } from "../services/api";
import api from "../services/api";
import useAuthStore from "../context/authStore";
import useChatStore from "../context/chatStore";

const categories = ["personal", "skill", "preference", "project", "goal", "other"];
const inputClass = "w-full rounded-xl bg-gray-950 border border-gray-700 px-3 py-2.5 text-sm text-gray-200 outline-none focus:border-violet-400";
const dateLabel = value => value ? new Date(value.endsWith?.("Z") ? value : `${value}Z`).toLocaleString() : "Not recorded";

export default function MemoryPage() {
  const { user, updateUser } = useAuthStore();
  const [params] = useSearchParams();
  const [memories, setMemories] = useState([]);
  const [projects, setProjects] = useState([]);
  const [stats, setStats] = useState({});
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("library");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [fact, setFact] = useState("");
  const [category, setCategory] = useState("personal");
  const [kind, setKind] = useState("semantic");
  const [scope, setScope] = useState("");
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(null);
  const [query, setQuery] = useState("");
  const [recallScope, setRecallScope] = useState("");
  const [asOf, setAsOf] = useState("");
  const [recallResult, setRecallResult] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [list, counts] = await Promise.all([memoryAPI.getAll({ offset, limit: 100 }), memoryAPI.stats()]);
      setMemories(list.data.memories); setTotal(list.data.total); setStats(counts.data);
    } catch { setError("Unable to load your memories. Retry when the connection is available."); }
    finally { setLoading(false); }
  }, [offset]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get("/projects/").then(({ data }) => setProjects(data.projects)).catch(() => {}); }, []);
  useEffect(() => {
    const id = params.get("memory");
    if (id) memoryAPI.getOne(id).then(({ data }) => setSelected(data.memory))
      .catch(() => toast.error("This memory is unavailable or has been deleted"));
  }, [params]);

  async function refresh() {
    setRecallResult(null);
    await load();
    await useChatStore.getState().fetchMemories();
  }
  async function saveNew(event) {
    event.preventDefault(); setBusy(true);
    try {
      const { data } = await memoryAPI.create({ fact: fact.trim(), category, kind, project_id: scope || null });
      setSelected(data.memory); setShowAdd(false); setFact(""); await refresh(); toast.success("Memory saved");
    } catch (err) { toast.error(err.response?.data?.detail || "Unable to save memory"); }
    finally { setBusy(false); }
  }
  async function update(memory, changes) {
    setBusy(true);
    try {
      const { data } = await memoryAPI.update(memory.id, { ...changes, expected_version: memory.version });
      setSelected(data.memory); setEdit(null); await refresh(); toast.success("Memory updated");
    } catch (err) { toast.error(err.response?.data?.detail || "Unable to update memory"); await load(); }
    finally { setBusy(false); }
  }
  async function remove(memory) {
    if (!window.confirm("Delete this memory and every revision? Its original chat transcript remains saved.")) return;
    setBusy(true);
    try { await memoryAPI.delete(memory.id); if (selected?.id === memory.id) setSelected(null); await refresh(); toast.success("Memory deleted"); }
    catch { toast.error("Unable to delete memory"); }
    finally { setBusy(false); }
  }
  async function setPreference(key, value) {
    setBusy(true);
    try {
      const { data } = await userAPI.updatePrefs({ [key]: value });
      updateUser({ preferences: data.preferences }); await load();
      setRecallResult(null); toast.success("Memory preferences saved");
    } catch { toast.error("Unable to update preferences"); }
    finally { setBusy(false); }
  }
  async function tryRecall(event) {
    event.preventDefault(); setBusy(true); setRecallResult(null);
    try {
      const { data } = await memoryAPI.recall({ query, project_id: recallScope || null,
        ...(asOf ? { as_of: new Date(asOf).toISOString() } : {}) });
      setRecallResult(data);
    } catch (err) { toast.error(err.response?.data?.detail || "Unable to run recall"); }
    finally { setBusy(false); }
  }

  const visible = memories.filter(memory => (memory.fact + " " + memory.category + " " + (memory.slot || "")).toLowerCase().includes(search.toLowerCase()));
  const scopeLabel = memory => memory.project_id ? projects.find(project => project.id === memory.project_id)?.name || "Project" : "Personal";

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
          <div>
            <Link to="/chat" className="inline-flex items-center gap-2 text-xs text-gray-400 hover:text-white mb-5"><ArrowLeft size={13} /> Back to chat</Link>
            <div className="flex items-center gap-2 text-violet-300 text-xs tracking-widest uppercase mb-2"><Brain size={15} /> NeuroSense</div>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Memory Studio</h1>
            <p className="text-sm text-gray-400 mt-3 max-w-xl">A lasting memory, with evidence you can inspect. Keep what matters, correct what changes, and choose what your AI recalls.</p>
          </div>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 rounded-xl px-4 py-3 text-sm font-medium sm:mt-10"><Plus size={16} /> Add a memory</button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {[[Brain, "Stored facts", stats.total], [Pin, "Pinned", stats.pinned], [Clock, "Past revisions", stats.revisions], [Check, "Need your review", stats.review_needed]].map(([Icon, label, value]) => (
            <div key={label} className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4"><div className="flex gap-2 items-center text-gray-400 text-xs"><Icon size={14} className="text-violet-400" />{label}</div><p className="text-2xl font-semibold mt-3">{value ?? "—"}</p></div>
          ))}
        </div>

        <div className="flex flex-wrap gap-4 justify-between rounded-2xl border border-gray-800 bg-gray-900/50 px-5 py-4 mb-7">
          <div className="flex items-center gap-3"><Shield size={19} className="text-emerald-300" /><div><p className="text-sm font-medium">Your memory, your choice</p><p className="text-xs text-gray-500 mt-1">Pausing keeps saved memories. It stops recall and new capture.</p></div></div>
          <div className="flex flex-wrap gap-5">
            {[["memory_enabled", "Memory enabled"], ["memory_auto_capture", "Automatic capture"]].map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-xs text-gray-300"><input type="checkbox" className="accent-violet-500 w-4 h-4" disabled={busy} checked={user?.preferences?.[key] ?? true} onChange={event => setPreference(key, event.target.checked)} />{label}</label>
            ))}
          </div>
        </div>

        <div className="flex gap-5 border-b border-gray-800 mb-6">
          {[["library", "Memory library"], ["recall", "Recall explorer"]].map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={`pb-3 text-sm border-b-2 ${tab === key ? "border-violet-400 text-violet-200" : "border-transparent text-gray-500 hover:text-gray-300"}`}>{label}</button>)}
        </div>

        {error && <div role="alert" className="mb-5 border border-red-500/30 text-red-300 bg-red-500/5 rounded-xl p-4 text-sm">{error}<button onClick={load} className="ml-3 underline">Retry</button></div>}

        {tab === "library" ? (
          <div className="grid lg:grid-cols-[1fr_360px] gap-6">
            <div>
              <div className="flex items-center gap-3 mb-4"><div className="relative flex-1"><Search size={15} className="absolute top-3.5 left-3 text-gray-500" /><input aria-label="Filter loaded memories" placeholder="Filter facts, categories, topics…" value={search} onChange={event => setSearch(event.target.value)} className={`${inputClass} pl-9`} /></div><span className="text-xs text-gray-500 whitespace-nowrap">{total} total</span></div>
              {loading ? <p className="text-sm text-gray-500 py-12">Loading memories…</p> : visible.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-700 p-12 text-center"><Brain size={32} className="text-violet-400/50 mx-auto mb-4" /><h2 className="text-lg">{search ? "No matching facts on this page" : "Start with something worth remembering"}</h2><p className="text-sm text-gray-500 mt-2">Try “My goal is to become a data scientist” in chat, or add a fact here.</p></div>
              ) : <div className="space-y-3">{visible.map(memory => <div key={memory.id} className={`rounded-2xl border p-4 transition-colors ${selected?.id === memory.id ? "border-violet-500/60 bg-violet-500/5" : "border-gray-800 bg-gray-900/40 hover:border-gray-700"}`}>
                <div className="flex gap-2 text-[10px] mb-3"><span className="text-violet-300 rounded-md bg-violet-500/10 px-2 py-1 capitalize">{memory.category}</span><span className="text-gray-400 rounded-md bg-gray-800 px-2 py-1">{scopeLabel(memory)}</span><span className="text-gray-500 px-1 py-1">v{memory.version}</span>{memory.pinned && <Pin size={12} className="text-amber-300 mt-1" />}</div>
                <button onClick={() => { setSelected(memory); setEdit(null); }} className="text-left text-sm leading-relaxed hover:text-violet-200 w-full">{memory.fact}</button>
                <div className="flex items-center gap-3 mt-4 text-xs text-gray-500"><span className="mr-auto">{memory.provenance === "legacy" && !memory.confirmed ? "Needs review before recall" : memory.confirmed ? "Confirmed by you" : "Grounded in your message"}</span><button disabled={busy} title={memory.pinned ? "Unpin memory" : "Pin memory"} aria-label={memory.pinned ? "Unpin memory" : "Pin memory"} onClick={() => update(memory, { pinned: !memory.pinned })} className="hover:text-amber-300 disabled:opacity-40"><Pin size={14} /></button><button disabled={busy} aria-label="Delete memory" onClick={() => remove(memory)} className="hover:text-red-300 disabled:opacity-40"><Trash2 size={14} /></button></div>
              </div>)}</div>}
              {total > 100 && <div className="flex items-center justify-between text-xs text-gray-400 mt-5"><button disabled={!offset} onClick={() => setOffset(value => Math.max(0, value - 100))}>← Previous</button><span>{offset + 1}–{Math.min(offset + 100, total)} of {total} · filter applies to this page</span><button disabled={offset + 100 >= total} onClick={() => setOffset(value => value + 100)}>Next →</button></div>}
              {total > 0 && <button className="text-xs text-red-400 mt-7 hover:text-red-300" disabled={busy} onClick={async () => {
                if (!window.confirm("Delete ALL memories and revision history? Chat transcripts will stay saved.")) return;
                setBusy(true);
                try { await memoryAPI.clearAll(); setSelected(null); setOffset(0); await refresh(); toast.success("All memories deleted"); }
                catch { toast.error("Unable to delete memories"); }
                finally { setBusy(false); }
              }}>Delete all memory facts and revisions</button>}
            </div>

            <aside className="rounded-2xl border border-gray-800 bg-gray-900/30 p-5 h-fit lg:sticky lg:top-6">
              {selected ? <>
                <div className="flex justify-between items-center mb-4"><h2 className="font-medium text-sm">Evidence & history</h2><button aria-label="Close memory details" onClick={() => setSelected(null)} className="text-gray-500"><X size={16} /></button></div>
                {edit !== null ? <form onSubmit={event => { event.preventDefault(); update(selected, { fact: edit }); }}><textarea aria-label="Correct memory" value={edit} onChange={event => setEdit(event.target.value)} maxLength={1000} rows={4} className={inputClass} /><div className="flex gap-3 mt-3"><button disabled={busy || edit.trim().length < 2} className="text-xs text-violet-300">Save correction</button><button type="button" onClick={() => setEdit(null)} className="text-xs text-gray-500">Cancel</button></div></form> : <><p className="text-sm text-gray-200 leading-relaxed">{selected.fact}</p><button onClick={() => setEdit(selected.fact)} className="text-xs text-violet-300 mt-3">Correct this fact</button></>}
                {selected.provenance === "legacy" && !selected.confirmed && <button disabled={busy} onClick={() => update(selected, { confirmed: true })} className="block text-xs bg-violet-600 rounded-lg px-3 py-2 mt-4">Confirm for recall</button>}
                <dl className="text-xs space-y-3 mt-6 border-t border-gray-800 pt-5"><div><dt className="text-gray-500">Observed</dt><dd className="text-gray-300 mt-1">{dateLabel(selected.valid_from || selected.created_at)}</dd></div><div><dt className="text-gray-500">Memory type</dt><dd className="text-gray-300 capitalize mt-1">{selected.kind} · {scopeLabel(selected)}</dd></div><div><dt className="text-gray-500">Exact source quote</dt><dd className="text-gray-300 mt-1 leading-relaxed">{selected.source_quote || "Not recorded in the original memory"}</dd></div>{selected.source_chat_id && <div><dt className="text-gray-500">Origin</dt><dd className="mt-1"><Link to={`/chat/${selected.source_chat_id}`} className="text-violet-300 underline">Open source conversation</Link></dd></div>}</dl>
                {selected.revisions?.length > 0 && <div className="border-t border-gray-800 pt-5 mt-5"><h3 className="text-xs text-gray-400 mb-4">Previous versions</h3><div className="space-y-5 border-l border-gray-700 pl-4">{[...selected.revisions].reverse().map(revision => <div key={revision.version}><span className="text-[10px] text-gray-500">v{revision.version} · superseded {dateLabel(revision.valid_until)}</span><p className="text-xs text-gray-300 mt-1 leading-relaxed">{revision.fact}</p></div>)}</div></div>}
              </> : <div className="py-12 text-center"><Clock size={24} className="text-gray-600 mx-auto mb-3" /><p className="text-sm text-gray-400">Select a memory</p><p className="text-xs text-gray-500 mt-2">See where it came from and how it changed.</p></div>}
            </aside>
          </div>
        ) : <div className="grid lg:grid-cols-[360px_1fr] gap-6">
          <form onSubmit={tryRecall} className="rounded-2xl border border-gray-800 bg-gray-900/40 p-5 h-fit">
            <h2 className="text-base font-medium flex items-center gap-2 mb-2"><Sparkles size={16} className="text-violet-300" /> Test what your AI recalls</h2><p className="text-xs text-gray-500 mb-5">Inspect retrieval evidence without making an AI provider call.</p>
            <label className="block text-xs text-gray-400 mb-2" htmlFor="recall-query">Your question</label><textarea id="recall-query" required maxLength={2000} value={query} onChange={event => setQuery(event.target.value)} placeholder="What is my career goal?" rows={3} className={inputClass} />
            <label className="block text-xs text-gray-400 mt-4 mb-2" htmlFor="recall-scope">Context</label><select id="recall-scope" className={inputClass} value={recallScope} onChange={event => setRecallScope(event.target.value)}><option value="">Personal memories</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name} + personal</option>)}</select>
            <label className="block text-xs text-gray-400 mt-4 mb-2" htmlFor="as-of">As of date (optional)</label><input id="as-of" type="datetime-local" value={asOf} onChange={event => setAsOf(event.target.value)} className={inputClass} /><p className="text-[11px] text-gray-500 mt-2">Use a date to inspect facts known at that time.</p>
            <button disabled={busy || !query.trim()} className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded-xl py-2.5 text-sm mt-5">{busy ? "Retrieving…" : "Run recall"}</button>
          </form>
          <div>{recallResult ? <>
            <div className="flex flex-wrap gap-3 text-xs text-gray-400 mb-4"><span>{recallResult.used.length} memories selected</span><span>·</span><span>{recallResult.context_chars} / 6,000 context characters</span><span>·</span><span>{recallResult.candidates} candidates</span></div>
            {recallResult.disabled ? <p className="text-amber-300 text-sm">Memory is paused. Enable it above to inspect recall.</p> : recallResult.used.length === 0 ? <div className="rounded-2xl border border-gray-800 p-10 text-center text-gray-400 text-sm">No relevant evidence. The AI should say it does not remember.</div> : <div className="space-y-3">{recallResult.used.map(item => <div key={item.id} className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-5"><p className="text-sm leading-relaxed">{item.fact}</p><p className="text-xs text-violet-300 mt-3">{item.reason} · score {item.score} · v{item.version}</p>{item.source_quote && <p className="text-xs text-gray-400 mt-2">Source: “{item.source_quote}”</p>}<button className="text-xs text-violet-300 mt-3 underline" onClick={async () => { try { const { data } = await memoryAPI.getOne(item.id); setSelected(data.memory); setTab("library"); } catch { toast.error("Memory was deleted"); } }}>Inspect history</button></div>)}</div>}
          </> : <div className="rounded-2xl border border-dashed border-gray-800 p-14 text-center"><Search size={30} className="mx-auto text-gray-600 mb-3" /><p className="text-sm text-gray-500">Your retrieval evidence will appear here.</p></div>}</div>
        </div>}
      </div>

      {showAdd && <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"><form role="dialog" aria-modal="true" aria-label="Add a memory" onSubmit={saveNew} className="w-full max-w-lg rounded-2xl bg-gray-900 border border-gray-700 p-6"><div className="flex items-center justify-between mb-5"><h2 className="text-lg font-medium">Remember something important</h2><button type="button" aria-label="Close add memory" onClick={() => setShowAdd(false)}><X size={18} /></button></div>
        <label htmlFor="new-fact" className="text-xs text-gray-400 block mb-2">Fact</label><textarea autoFocus id="new-fact" required minLength={2} maxLength={1000} rows={4} value={fact} onChange={event => setFact(event.target.value)} placeholder="My goal is to become a data scientist." className={inputClass} />
        <div className="grid grid-cols-2 gap-3 mt-4"><label className="text-xs text-gray-400">Category<select value={category} onChange={event => setCategory(event.target.value)} className={`${inputClass} mt-2`}>{categories.map(value => <option key={value}>{value}</option>)}</select></label><label className="text-xs text-gray-400">Memory type<select value={kind} onChange={event => setKind(event.target.value)} className={`${inputClass} mt-2`}><option value="semantic">Fact or preference</option><option value="episodic">Event or experience</option><option value="procedural">Workflow or method</option></select></label></div>
        <label className="text-xs text-gray-400 block mt-4">Scope<select value={scope} onChange={event => setScope(event.target.value)} className={`${inputClass} mt-2`}><option value="">Personal · available across projects</option>{projects.map(project => <option value={project.id} key={project.id}>{project.name} only</option>)}</select></label>
        <p className="text-xs text-gray-500 mt-4">Stored until you delete it. Add personal facts and workflows; keep passwords and API keys out of memory.</p><button disabled={busy || fact.trim().length < 2} className="mt-5 flex justify-center items-center gap-2 w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded-xl py-3 text-sm"><Save size={14} />{busy ? "Saving…" : "Save memory"}</button>
      </form></div>}
    </div>
  );
}
