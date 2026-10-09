import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Sparkles, Plus, Search, MessageSquare, FolderKanban, LayoutDashboard,
  Settings, LogOut, User, Brain, ChevronDown, ChevronRight,
  Star, Trash2, Edit3, Check, X, Cpu, Zap, Crown, Bot, Calendar, Clock,
} from "lucide-react";
import useAuthStore from "../../context/authStore";
import useChatStore from "../../context/chatStore";

export const AI_MODELS = [
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", label: "Sonnet", desc: "Smart & fast", icon: Zap, color: "text-violet-400", badge: "Recommended", badgeColor: "bg-violet-600/20 text-violet-400 border-violet-500/30" },
  { id: "claude-opus-4-6",   name: "Claude Opus 4.6",   label: "Opus",   desc: "Most powerful", icon: Crown, color: "text-yellow-400", badge: "Powerful", badgeColor: "bg-yellow-600/20 text-yellow-400 border-yellow-500/30" },
  { id: "claude-haiku-4-5",  name: "Claude Haiku 4.5",  label: "Haiku",  desc: "Fastest", icon: Cpu, color: "text-green-400", badge: "Fastest", badgeColor: "bg-green-600/20 text-green-400 border-green-500/30" },
];

function ModelSelector({ selectedModel, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const model = AI_MODELS.find(m => m.id === selectedModel) || AI_MODELS[0];
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-800/80 border border-gray-700 hover:border-gray-600 w-full transition-colors">
        <model.icon size={12} className={model.color} />
        <span className="text-[11px] font-medium text-gray-300 flex-1 text-left">{model.label}</span>
        <ChevronDown size={10} className="text-gray-500" />
      </button>
      {open && (
        <div className="absolute bottom-full mb-2 left-0 right-0 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-800"><p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">AI Model</p></div>
          {AI_MODELS.map(m => (
            <button key={m.id} onClick={() => { onSelect(m.id); setOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-800 transition-colors text-left ${selectedModel === m.id ? "bg-gray-800/60" : ""}`}>
              <m.icon size={13} className={`${m.color} flex-shrink-0`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5"><span className="text-xs font-medium text-white">{m.name}</span>{selectedModel === m.id && <Check size={10} className="text-violet-400" />}</div>
                <p className="text-[10px] text-gray-500">{m.desc}</p>
              </div>
              <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full border flex-shrink-0 ${m.badgeColor}`}>{m.badge}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ChatRow({ chat, isActive, onOpen, onDelete, onRename, onStar }) {
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const [editTitle, setEditTitle] = useState(chat.title);
  const inputRef = useRef(null);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  return (
    <div onClick={() => !editing && onOpen(chat.id)}
      className={`group relative flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition-all ${isActive ? "bg-violet-600/15 border border-violet-500/30" : "hover:bg-gray-800/60"}`}>
      {chat.starred && <Star size={8} className="text-yellow-400 fill-yellow-400 flex-shrink-0" />}
      {chat.is_daily && <Calendar size={8} className="text-violet-400 flex-shrink-0" />}
      {editing ? (
        <input ref={inputRef} value={editTitle} onChange={e => setEditTitle(e.target.value)} onClick={e => e.stopPropagation()}
          onKeyDown={e => { if (e.key === "Enter") { onRename(chat.id, editTitle); setEditing(false); } if (e.key === "Escape") setEditing(false); }}
          onBlur={() => { onRename(chat.id, editTitle); setEditing(false); }}
          className="flex-1 bg-gray-700 text-[11px] text-white px-1.5 py-0.5 rounded outline-none border border-violet-500" />
      ) : (
        <span className="flex-1 text-[11px] text-gray-300 truncate leading-relaxed">{chat.title}</span>
      )}
      <div className="opacity-0 group-hover:opacity-100 flex-shrink-0 relative" onClick={e => e.stopPropagation()}>
        <button onClick={() => setMenu(o => !o)} className="p-0.5 rounded text-gray-600 hover:text-white hover:bg-gray-700"><Edit3 size={10} /></button>
        {menu && (
          <div className="absolute right-0 top-full mt-1 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 py-1 min-w-[130px]">
            <button onClick={() => { onStar(chat.id); setMenu(false); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-300 hover:text-white hover:bg-gray-800 transition-colors">
              <Star size={10} className={chat.starred ? "fill-yellow-400 text-yellow-400" : ""} />{chat.starred ? "Unstar" : "Star"}
            </button>
            <button onClick={() => { setEditing(true); setMenu(false); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"><Edit3 size={10} /> Rename</button>
            <div className="border-t border-gray-800 my-1" />
            <button onClick={() => { onDelete(chat.id); setMenu(false); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-gray-800 transition-colors"><Trash2 size={10} /> Delete</button>
          </div>
        )}
      </div>
    </div>
  );
}

function HistoryGroup({ label, chats, activeId, onOpen, onDelete, onRename, onStar }) {
  const [collapsed, setCollapsed] = useState(false);
  if (!chats || !chats.length) return null;
  const isToday = label === "Today";
  return (
    <div className="mb-3">
      <button onClick={() => setCollapsed(c => !c)} className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium text-gray-600 hover:text-gray-400 uppercase tracking-wider w-full group">
        {collapsed ? <ChevronRight size={9} /> : <ChevronDown size={9} />}
        {isToday && <Calendar size={9} className="text-violet-400" />}
        <span className={isToday ? "text-violet-400" : ""}>{label}</span>
        <span className="ml-auto text-[9px] opacity-0 group-hover:opacity-100">{chats.length}</span>
      </button>
      {!collapsed && (
        <div className="space-y-0.5 ml-1">
          {chats.map(chat => <ChatRow key={chat.id} chat={chat} isActive={chat.id === activeId} onOpen={onOpen} onDelete={onDelete} onRename={onRename} onStar={onStar} />)}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ open, onClose, selectedModel, onModelChange, onNewChat }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { chats, activeChat, memories, historyGroups, fetchHistory, openChat, deleteChat, updateChat } = useChatStore();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("history");

  useEffect(() => { fetchHistory(); }, [chats.length]);

  async function handleOpen(id) { navigate(`/chat/${id}`); await openChat(id); }
  async function handleRename(id, t) { await updateChat(id, { title: t }); }
  async function handleStar(id) { const chat = chats.find(c => c.id === id); if (chat) await updateChat(id, { starred: !chat.starred }); }

  const filterChats = list => search ? list.filter(c => c.title?.toLowerCase().includes(search.toLowerCase())) : list;
  const filteredGroups = Object.fromEntries(Object.entries(historyGroups).map(([k, v]) => [k, filterChats(v)]));
  const allFiltered = filterChats(chats);

  const navItems = [
    { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { path: "/chat",      label: "Chat",      icon: MessageSquare },
    { path: "/projects",  label: "Projects",  icon: FolderKanban },
    { path: "/agents",    label: "Agents",    icon: Bot },
  ];

  async function handleLogout() { await logout(); navigate("/welcome"); }

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/60 z-30 lg:hidden" onClick={onClose} />}
      <aside className={`fixed lg:relative inset-y-0 left-0 z-40 flex flex-col w-64 bg-gray-950/95 backdrop-blur border-r border-gray-800/60 transition-transform duration-200 ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0 lg:w-0 lg:overflow-hidden lg:border-0"}`}>
        <div className="flex items-center justify-between px-3 pt-3 pb-2 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-violet-600/20 border border-violet-500/30 flex items-center justify-center"><Sparkles size={13} className="text-violet-400" /></div>
            <span className="font-bold text-sm text-white">NeuroFusion</span>
          </div>
          <button onClick={onClose} className="lg:hidden text-gray-600 hover:text-white p-1"><X size={14} /></button>
        </div>

        <div className="px-3 mb-2 flex-shrink-0">
          <button onClick={onNewChat} className="w-full flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-semibold py-2 px-3 rounded-xl transition-colors shadow-lg shadow-violet-900/20">
            <Plus size={13} /> New conversation
          </button>
        </div>

        <div className="px-3 mb-2 grid grid-cols-4 gap-1 flex-shrink-0">
          {navItems.map(({ path, label, icon: Icon }) => {
            const active = location.pathname.startsWith(path);
            return (
              <button key={path} onClick={() => navigate(path)} title={label}
                className={`flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-[9px] font-medium transition-colors ${active ? "bg-gray-800 text-violet-400" : "text-gray-600 hover:text-gray-400 hover:bg-gray-800/60"}`}>
                <Icon size={14} />{label.split(" ")[0]}
              </button>
            );
          })}
        </div>

        <div className="px-3 mb-2 flex-shrink-0">
          <div className="relative">
            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search chats…"
              className="w-full bg-gray-800/60 border border-gray-700/60 rounded-lg pl-7 pr-7 py-1.5 text-[11px] text-gray-300 outline-none focus:border-violet-500/50 transition-colors placeholder-gray-600" />
            {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400"><X size={10} /></button>}
          </div>
        </div>

        <div className="px-3 mb-2 flex gap-1 flex-shrink-0">
          {[["history","History"], ["all","All chats"]].map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={`flex-1 py-1 rounded-lg text-[10px] font-medium transition-colors ${tab === k ? "bg-gray-800 text-white" : "text-gray-600 hover:text-gray-400"}`}>{label}</button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-2 scrollbar-thin">
          {tab === "history" ? (
            Object.keys(filteredGroups).length === 0 ? (
              <div className="text-center mt-10"><Clock size={22} className="mx-auto mb-2 text-gray-800" /><p className="text-[11px] text-gray-700">No history yet</p></div>
            ) : (
              Object.entries(filteredGroups).map(([label, groupChats]) =>
                groupChats.length > 0 ? <HistoryGroup key={label} label={label} chats={groupChats} activeId={activeChat?.id} onOpen={handleOpen} onDelete={deleteChat} onRename={handleRename} onStar={handleStar} /> : null
              )
            )
          ) : (
            allFiltered.length === 0 ? (
              <div className="text-center mt-10"><MessageSquare size={22} className="mx-auto mb-2 text-gray-800" /><p className="text-[11px] text-gray-700">No conversations yet</p></div>
            ) : (
              <div className="space-y-0.5">
                {allFiltered.map(chat => <ChatRow key={chat.id} chat={chat} isActive={chat.id === activeChat?.id} onOpen={handleOpen} onDelete={deleteChat} onRename={handleRename} onStar={handleStar} />)}
              </div>
            )
          )}
        </div>

        {memories.length > 0 && (
          <div className="px-3 mb-2 flex-shrink-0">
            <div className="flex items-center gap-2 bg-violet-600/10 border border-violet-500/20 rounded-xl px-3 py-2 cursor-pointer hover:bg-violet-600/15 transition-colors" onClick={() => navigate("/chat")}>
              <Brain size={11} className="text-violet-400 flex-shrink-0" /><span className="text-[10px] text-violet-300">{memories.length} memories · AI knows you</span>
            </div>
          </div>
        )}

        <div className="px-3 mb-2 flex-shrink-0"><ModelSelector selectedModel={selectedModel} onSelect={onModelChange} /></div>

        <div className="border-t border-gray-800/60 px-3 py-2.5 flex-shrink-0 space-y-0.5">
          <button onClick={() => navigate("/profile")} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
            <div className="w-5 h-5 rounded-full bg-violet-600/30 flex items-center justify-center flex-shrink-0"><User size={9} className="text-violet-400" /></div>
            <span className="truncate flex-1">{user?.name}</span>
          </button>
          <button onClick={() => navigate("/settings")} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"><Settings size={12} /> Settings</button>
          <button onClick={handleLogout} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] text-gray-400 hover:text-red-400 hover:bg-gray-800 transition-colors"><LogOut size={12} /> Sign out</button>
        </div>
      </aside>
    </>
  );
}
