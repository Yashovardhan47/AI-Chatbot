import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Brain, BookOpen, CalendarCheck, MessageSquare, ArrowRight, Network, Bookmark, Bell } from "lucide-react";
import WorkspaceShell from "../components/WorkspaceShell";
import useAuthStore from "../context/authStore";
import useChatStore from "../context/chatStore";
import { continuityAPI } from "../services/api";
import toast from "react-hot-toast";

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { chats, fetchChats, newChat } = useChatStore();
  const [overview, setOverview] = useState(null), [error, setError] = useState("");
  async function load() { try { const { data } = await continuityAPI.overview(); setOverview(data); setError(""); } catch { setError("Unable to load your workspace. Retry when the connection is available."); } }
  useEffect(() => { fetchChats(); load(); }, []);
  async function startChat() { try { const chat = await newChat(); navigate(`/chat/${chat.id}`); } catch { toast.error("Unable to create conversation"); } }
  const counts = overview?.counts || {};
  return <WorkspaceShell eyebrow="Your lasting AI workspace" title={`Welcome back, ${user?.name?.split(" ")[0] || "there"}`} description="Continue conversations, build a lasting knowledge library and keep your commitments moving. Your context stays connected across sessions." action={<button onClick={startChat} className="bg-violet-600 rounded-xl px-5 py-3 text-sm flex items-center gap-2"><MessageSquare size={15}/>New conversation</button>}>
    {error && <p role="alert" className="text-red-300 mb-6">{error}<button onClick={load} className="underline ml-3">Retry</button></p>}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-7">{[[Brain, "Stored facts", counts.memories], [BookOpen, "Knowledge documents", counts.documents], [CalendarCheck, "Pending commitments", counts.pending_tasks], [Bell, "Unread reminders", counts.unread_notifications]].map(([Icon, label, value]) => <div key={label} className="rounded-2xl border border-gray-800 bg-gray-900/50 p-5"><p className="text-xs text-gray-500 flex items-center gap-2"><Icon size={14} className="text-violet-400"/>{label}</p><p className="text-3xl font-semibold mt-4">{value ?? "—"}</p></div>)}</div>
    <div className="grid lg:grid-cols-[1.3fr_1fr] gap-6"><div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 to-gray-900/30 p-6"><p className="text-xs uppercase tracking-widest text-violet-300 mb-3">Continue your work</p><h2 className="text-xl font-medium mb-5">Context that moves with you</h2><div className="space-y-2">{chats.slice(0, 4).map(chat => <Link key={chat.id} to={`/chat/${chat.id}`} className="flex gap-3 items-center p-3 rounded-xl border border-gray-800 bg-gray-950/40 hover:border-violet-500/40"><MessageSquare size={14} className="text-gray-500"/><span className="truncate text-sm flex-1">{chat.title}</span><ArrowRight size={13} className="text-gray-500"/></Link>)}{!chats.length && <p className="text-sm text-gray-500 py-6">Start a conversation to begin building your context.</p>}</div></div>
    <div className="rounded-2xl border border-gray-800 bg-gray-900/30 p-6"><h2 className="text-sm font-medium flex items-center gap-2 mb-5"><CalendarCheck size={15} className="text-emerald-300"/>Next commitments</h2><div className="space-y-4">{overview?.tasks.slice(0, 4).map(task => <div key={task.id}><Link to="/continuity" className="text-sm hover:text-violet-300">{task.title}</Link><p className="text-xs text-gray-500 mt-1">{task.due_at ? new Date(task.due_at.endsWith("Z") ? task.due_at : task.due_at + "Z").toLocaleString() : "No due date"}</p></div>)}{!overview?.tasks.length && <p className="text-sm text-gray-500">Add a commitment to keep track of what happens next.</p>}</div><Link to="/continuity" className="block text-xs text-violet-300 mt-6">Open Continuity →</Link></div></div>
    <div className="grid md:grid-cols-3 gap-4 mt-7">{[["/knowledge", BookOpen, "Build your library", "Import documents or save notes. Ask questions with source passages."], ["/memory-graph", Network, "Connect your memory", "Link related facts and inspect the context behind recalled answers."], ["/continuity", Bookmark, "Keep session context", "Save useful conversations and receive reminders for your commitments."]].map(([path, Icon, title, description]) => <Link key={path} to={path} className="rounded-2xl border border-gray-800 bg-gray-900/30 p-5 hover:border-gray-600"><Icon size={20} className="text-violet-400 mb-4"/><h2 className="text-sm font-medium">{title}</h2><p className="text-xs text-gray-500 leading-relaxed mt-2">{description}</p></Link>)}</div>
    {overview && <p className="text-xs text-gray-500 mt-7">AI provider: {overview.provider.provider}{overview.provider.local_model ? ` · ${overview.provider.local_model} · local service and model required` : ""} · Recall: {overview.semantics.enabled ? `semantic index available (${overview.semantics.model})` : "lexical, graph and feedback"} · <Link to="/settings" className="text-violet-300">Manage preferences</Link></p>}
  </WorkspaceShell>;
}
