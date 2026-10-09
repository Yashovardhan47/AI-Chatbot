import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, MessageSquare, FolderKanban, Brain, Target, Clock, ArrowRight, Bot, Star, Menu } from "lucide-react";
import useAuthStore from "../context/authStore";
import useChatStore from "../context/chatStore";
import LivingBackground from "../components/LivingBackground";
import AIAvatar from "../components/AIAvatar";
import Sidebar, { AI_MODELS } from "../components/sidebar/Sidebar";
import api from "../services/api";

function StatCard({ icon: Icon, label, value, color, sub }) {
  return (
    <div className="relative bg-gray-900/80 backdrop-blur border border-gray-800 rounded-2xl p-5 hover:border-gray-700 transition-all overflow-hidden">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3" style={{ background: "rgba(255,255,255,0.05)" }}>
        <Icon size={17} className={color} />
      </div>
      <div className="text-2xl font-bold text-white mb-0.5">{value ?? "—"}</div>
      <div className="text-xs text-gray-400">{label}</div>
      {sub && <div className="text-[10px] text-gray-600 mt-1">{sub}</div>}
    </div>
  );
}

function QuickAction({ icon: Icon, label, desc, color, onClick }) {
  return (
    <button onClick={onClick} className="flex items-start gap-3 bg-gray-900/80 backdrop-blur border border-gray-800 hover:border-gray-600 rounded-2xl p-4 text-left transition-all group w-full">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.05)" }}>
        <Icon size={16} className={color} />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium text-white group-hover:text-violet-300 transition-colors">{label}</div>
        <div className="text-[11px] text-gray-500 mt-0.5 truncate">{desc}</div>
      </div>
      <ArrowRight size={14} className="text-gray-700 group-hover:text-gray-400 flex-shrink-0 mt-1 ml-auto transition-colors" />
    </button>
  );
}

function GreetingMessage({ user, memories, recentChats }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const lastChat = recentChats[0];
  const memCount = memories.length;

  return (
    <div className="relative bg-gray-900/60 backdrop-blur border border-violet-500/20 rounded-2xl p-6 mb-6 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-violet-600/5 to-transparent pointer-events-none" />
      <div className="flex items-center gap-4">
        <AIAvatar size={52} thinking={false} mode="auto" />
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-white">{greeting}, {user?.name?.split(" ")[0]}! 👋</h2>
          {lastChat ? (
            <p className="text-sm text-gray-400 mt-1">
              Last session: <span className="text-violet-300">"{lastChat.title}"</span>
              {memCount > 0 && ` · I remember ${memCount} things about you`}
            </p>
          ) : (
            <p className="text-sm text-gray-400 mt-1">Welcome to your AI workspace. What shall we explore today?</p>
          )}
        </div>
      </div>
      {lastChat && (
        <div className="mt-4 pt-4 border-t border-gray-800">
          <p className="text-[11px] text-gray-500 mb-2 uppercase tracking-wider font-medium">While you were away…</p>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-[12px] text-gray-400"><span className="text-green-400">✓</span> Last chat: "{lastChat.title}"</div>
            {memCount > 0 && <div className="flex items-center gap-2 text-[12px] text-gray-400"><span className="text-violet-400">✓</span> {memCount} memories saved across sessions</div>}
            <div className="flex items-center gap-2 text-[12px] text-gray-400"><span className="text-blue-400">✓</span> Ready to continue where you left off</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { chats, memories, fetchChats, fetchMemories, newChat } = useChatStore();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebar] = useState(true);
  const [selectedModel, setModel] = useState("claude-sonnet-4-6");

  useEffect(() => {
    async function load() {
      await Promise.all([fetchChats(), fetchMemories()]);
      try { const { data } = await api.get("/users/stats"); setStats(data.stats); } catch {}
      setLoading(false);
    }
    load();
  }, []);

  const recentChats = chats.slice(0, 5);
  const starredChats = chats.filter(c => c.starred).slice(0, 3);

  async function startNewChat() {
    const chat = await newChat();
    navigate(`/chat/${chat.id}`);
  }

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden relative">
      <LivingBackground mode="auto" />
      <Sidebar open={sidebarOpen} onClose={() => setSidebar(false)} selectedModel={selectedModel} onModelChange={setModel} onNewChat={startNewChat} />

      <div className="flex-1 overflow-y-auto relative z-10">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <button onClick={() => setSidebar(o => !o)} className="lg:hidden p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors mr-1"><Menu size={17} /></button>
              <div className="w-8 h-8 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center"><Sparkles size={15} className="text-violet-400" /></div>
              <span className="font-bold text-sm text-white">NeuroFusion AI</span>
              <span className="text-[10px] bg-violet-600/20 text-violet-400 border border-violet-500/30 px-2 py-0.5 rounded-full ml-1">Dashboard</span>
            </div>
            <button onClick={() => navigate("/chat")} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 border border-gray-700 hover:border-gray-600 px-3 py-1.5 rounded-xl transition-all">
              Open Chat <ArrowRight size={12} />
            </button>
          </div>

          {!loading && <GreetingMessage user={user} memories={memories} recentChats={recentChats} />}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <StatCard icon={MessageSquare} label="Total messages" value={stats?.total_messages || 0} color="text-violet-400" sub="Across all sessions" />
            <StatCard icon={Brain} label="Memories saved" value={memories.length} color="text-green-400" sub="Long-term context" />
            <StatCard icon={FolderKanban} label="Conversations" value={chats.length} color="text-blue-400" sub="All time" />
            <StatCard icon={Target} label="Files uploaded" value={stats?.files_uploaded || 0} color="text-orange-400" sub="Images, PDFs, code" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-1 space-y-3">
              <h3 className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-2">Quick actions</h3>
              <QuickAction icon={Sparkles} label="New conversation" desc="Start a fresh AI chat" color="text-violet-400" onClick={startNewChat} />
              <QuickAction icon={Bot} label="AI Enhancement Lab" desc="Agents, RAG, Debate, Planner" color="text-pink-400" onClick={() => navigate("/agents")} />
              <QuickAction icon={FolderKanban} label="My Projects" desc="Organize chats by project" color="text-blue-400" onClick={() => navigate("/projects")} />
              <QuickAction icon={Brain} label="View memory" desc={`${memories.length} facts stored`} color="text-green-400" onClick={() => navigate("/chat")} />
            </div>

            <div className="lg:col-span-2 space-y-4">
              <div>
                <h3 className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-3 flex items-center gap-2"><Clock size={11} /> Recent conversations</h3>
                <div className="space-y-2">
                  {recentChats.length === 0 && (
                    <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4 text-center">
                      <p className="text-gray-600 text-sm">No conversations yet</p>
                      <button onClick={startNewChat} className="mt-2 text-violet-400 text-xs hover:text-violet-300">Start your first chat →</button>
                    </div>
                  )}
                  {recentChats.map(chat => (
                    <button key={chat.id} onClick={() => navigate(`/chat/${chat.id}`)}
                      className="w-full flex items-center gap-3 bg-gray-900/60 backdrop-blur border border-gray-800 hover:border-gray-700 rounded-xl px-4 py-3 text-left transition-all group">
                      <MessageSquare size={14} className="text-gray-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-200 truncate">{chat.title}</p>
                        <p className="text-[10px] text-gray-600 mt-0.5">{chat.message_count || 0} messages</p>
                      </div>
                      <ArrowRight size={12} className="text-gray-700 group-hover:text-gray-400 flex-shrink-0 transition-colors" />
                    </button>
                  ))}
                </div>
              </div>

              {starredChats.length > 0 && (
                <div>
                  <h3 className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-3 flex items-center gap-2"><Star size={11} className="text-yellow-400 fill-yellow-400" /> Starred</h3>
                  <div className="space-y-2">
                    {starredChats.map(chat => (
                      <button key={chat.id} onClick={() => navigate(`/chat/${chat.id}`)}
                        className="w-full flex items-center gap-3 bg-gray-900/60 backdrop-blur border border-yellow-500/20 hover:border-yellow-500/40 rounded-xl px-4 py-3 text-left transition-all">
                        <Star size={13} className="text-yellow-400 fill-yellow-400 flex-shrink-0" />
                        <p className="text-sm text-gray-200 truncate flex-1">{chat.title}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {memories.length > 0 && (
                <div>
                  <h3 className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-3 flex items-center gap-2"><Brain size={11} /> What I know about you</h3>
                  <div className="bg-gray-900/60 backdrop-blur border border-violet-500/20 rounded-xl p-4 space-y-1.5">
                    {memories.slice(0, 4).map((m, i) => (
                      <div key={m.id || i} className="flex items-start gap-2 text-[12px] text-gray-400">
                        <span className="text-violet-400 mt-0.5 flex-shrink-0">•</span>
                        <span className="truncate">{m.fact}</span>
                      </div>
                    ))}
                    {memories.length > 4 && <p className="text-[11px] text-gray-600 pt-1">+{memories.length - 4} more memories</p>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
