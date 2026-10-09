import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, MessageSquare, Trash2, Menu } from "lucide-react";
import toast from "react-hot-toast";
import Sidebar from "../components/sidebar/Sidebar";
import useChatStore from "../context/chatStore";
import useProjectStore from "../context/projectStore";

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { projects, fetchProjects } = useProjectStore();
  const { chats, fetchChats, newChat, deleteChat } = useChatStore();
  const [sidebarOpen, setSidebar] = useState(true);
  const [selectedModel, setModel] = useState("claude-sonnet-4-6");

  useEffect(() => { fetchProjects(); fetchChats(); }, []);

  const project = projects.find(p => p.id === id);
  const projectChats = chats.filter(c => c.project_id === id);

  async function startNewChat() {
    const chat = await newChat(id);
    navigate(`/chat/${chat.id}`);
  }

  if (!project) return (
    <div className="flex h-screen bg-gray-950 items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-4">📁</div>
        <p className="text-gray-400 text-sm">Project not found</p>
        <button onClick={() => navigate("/projects")} className="mt-4 text-violet-400 text-sm hover:text-violet-300">← Back to projects</button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebar(false)} selectedModel={selectedModel} onModelChange={setModel} onNewChat={startNewChat} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 flex-shrink-0">
          <button onClick={() => setSidebar(o => !o)} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"><Menu size={17} /></button>
          <button onClick={() => navigate("/projects")} className="text-gray-500 hover:text-white transition-colors"><ArrowLeft size={16} /></button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-xl">{project.icon}</span>
            <div className="min-w-0"><h1 className="font-semibold text-sm text-white truncate">{project.name}</h1>{project.description && <p className="text-[10px] text-gray-500 truncate">{project.description}</p>}</div>
          </div>
          <button onClick={startNewChat} className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium px-3 py-2 rounded-xl transition-colors flex-shrink-0"><Plus size={13} /> New chat</button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto">
            {projectChats.length === 0 ? (
              <div className="text-center py-20">
                <div className="text-4xl mb-4">{project.icon}</div>
                <h2 className="text-lg font-semibold text-gray-400 mb-2">No conversations yet</h2>
                <p className="text-gray-600 text-sm mb-6">Start a conversation in this project.</p>
                <button onClick={startNewChat} className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors mx-auto"><Plus size={14} /> Start first conversation</button>
              </div>
            ) : (
              <div className="space-y-2">
                {projectChats.map(chat => (
                  <div key={chat.id} onClick={() => navigate(`/chat/${chat.id}`)} className="group flex items-center gap-3 bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl px-4 py-3 cursor-pointer transition-all">
                    <MessageSquare size={15} className="text-gray-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0"><p className="text-sm text-gray-200 truncate">{chat.title}</p></div>
                    <button onClick={e => { e.stopPropagation(); deleteChat(chat.id); toast.success("Chat deleted"); }} className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-600 hover:text-red-400 transition-all"><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
