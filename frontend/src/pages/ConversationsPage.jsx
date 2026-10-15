import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MessageSquare, Search, Plus, ArrowUpRight, Pin, Trash2, Pencil, X, Check } from "lucide-react";
import WorkspaceShell from "../components/WorkspaceShell";
import Modal from "../components/Modal";
import useChatStore from "../context/chatStore";

export default function ConversationsPage() {
  const { chats, fetchChats, newChat, deleteChat, updateChat, chatsLoading, chatsError } = useChatStore();
  const [query, setQuery] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [editing, setEditing] = useState(null), [title, setTitle] = useState(""), [removing, setRemoving] = useState(null);
  const navigate = useNavigate();
  useEffect(() => { fetchChats(); }, [fetchChats]);
  async function start() {
    setBusy(true); setError("");
    try { const chat = await newChat(); navigate(`/chat/${chat.id}`); }
    catch { setError("Your conversation could not open. Please try again."); }
    finally { setBusy(false); }
  }
  async function action(operation) {
    setBusy(true); setError("");
    try { await operation(); setEditing(null); setRemoving(null); }
    catch { setError("That change could not be saved. Please retry."); }
    finally { setBusy(false); }
  }
  const visible = chats.filter(chat => chat.title.toLowerCase().includes(query.toLowerCase())).sort((a, b) => Number(b.pinned) - Number(a.pinned));
  return <WorkspaceShell eyebrow="EVERY THREAD HAS A PLACE" title="Your conversations." description="Revisit a decision, find an idea and pick up where you left off." action={<button className="ns-primary" onClick={start} disabled={busy}><Plus size={16} />New conversation</button>}>
    {(error || chatsError) && <div role="alert" className="ns-inline-error">{error || chatsError}<button onClick={fetchChats}>Retry</button></div>}
    <div className="ns-library-toolbar"><label><Search size={17} /><input aria-label="Find a conversation" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a conversation…" /></label><span>{visible.length} {visible.length === 1 ? "thread" : "threads"}</span></div>
    <div className="ns-thread-grid" aria-busy={chatsLoading}>
      {visible.map(chat => <article className="ns-thread-card" key={chat.id}><div className="ns-thread-top"><span className="ns-conversation-icon"><MessageSquare size={20} /></span><button className={chat.pinned ? "pinned" : ""} aria-label={`${chat.pinned ? "Unpin" : "Pin"} ${chat.title}`} onClick={() => action(() => updateChat(chat.id, { pinned: !chat.pinned }))} disabled={busy}><Pin size={15} /></button></div>
        {editing === chat.id ? <form className="ns-thread-rename" onSubmit={event => { event.preventDefault(); action(() => updateChat(chat.id, { title: title.trim() })); }}><input aria-label="Conversation title" value={title} onChange={event => setTitle(event.target.value)} minLength={1} maxLength={120} required autoFocus /><button aria-label="Save title" disabled={busy}><Check size={15} /></button><button type="button" aria-label="Cancel rename" onClick={() => setEditing(null)}><X size={15} /></button></form> : <Link className="ns-thread-name" to={`/chat/${chat.id}`}><h2>{chat.title}</h2><ArrowUpRight size={16} /></Link>}
        <p>{chat.message_count || 0} messages · {chat.project_id ? "Project context" : "Personal context"}</p>
        <footer><span>{new Date(chat.updated_at.endsWith("Z") ? chat.updated_at : chat.updated_at + "Z").toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span><button aria-label={`Rename ${chat.title}`} onClick={() => { setEditing(chat.id); setTitle(chat.title); }}><Pencil size={14} /></button><button aria-label={`Delete ${chat.title}`} onClick={() => setRemoving(chat)}><Trash2 size={14} /></button></footer>
      </article>)}
      {!visible.length && <div className="ns-library-empty"><MessageSquare size={35} /><h2>{query ? "No matching conversations." : chatsLoading ? "Loading your threads…" : "A new thought belongs here."}</h2><p>{query ? "Try a different title, or use workspace search to search inside messages." : "Start your first conversation. Your saved context can travel with you."}</p>{!query && <button className="ns-primary" disabled={busy} onClick={start}>Start a conversation<Plus size={16} /></button>}</div>}
    </div>
    {removing && <Modal titleId="delete-thread-title" onClose={() => { if (!busy) setRemoving(null); }}><Trash2 size={27} /><h2 id="delete-thread-title">Delete this conversation?</h2><p>“{removing.title}” and its session snapshot will be removed. Previously saved facts remain manageable in Memory Studio.</p><div><button className="ns-secondary" onClick={() => setRemoving(null)}>Keep conversation</button><button className="ns-danger" disabled={busy} onClick={() => action(() => deleteChat(removing.id))}>Delete conversation</button></div></Modal>}
  </WorkspaceShell>;
}
