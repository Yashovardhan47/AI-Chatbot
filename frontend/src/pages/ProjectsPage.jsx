import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FolderKanban, Plus, Search, Trash2, Edit3, Calendar, MoreHorizontal, ArrowRight, X, Check, Menu } from "lucide-react";
import toast from "react-hot-toast";
import Sidebar from "../components/sidebar/Sidebar";
import useChatStore from "../context/chatStore";
import useProjectStore from "../context/projectStore";

const PROJECT_COLORS = ["#534AB7", "#1D9E75", "#D85A30", "#378ADD", "#BA7517", "#7C3AED", "#DC2626", "#059669"];
const PROJECT_ICONS = ["🚀", "🔬", "💡", "📊", "🎯", "🛠️", "📱", "🌐", "🤖", "📚"];

function ProjectCard({ project, onOpen, onDelete, onEdit }) {
  const [menu, setMenu] = useState(false);
  return (
    <div onClick={() => onOpen(project.id)} className="group relative bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-2xl p-5 cursor-pointer transition-all">
      <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl" style={{ background: project.color }} />
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{project.icon}</span>
          <div><h3 className="font-semibold text-sm text-white">{project.name}</h3><p className="text-[10px] text-gray-500 mt-0.5">{project.chat_count || 0} conversation{project.chat_count !== 1 ? "s" : ""}</p></div>
        </div>
        <div className="relative" onClick={e => e.stopPropagation()}>
          <button onClick={() => setMenu(m => !m)} className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-gray-600 hover:text-white hover:bg-gray-800 transition-all"><MoreHorizontal size={14} /></button>
          {menu && (
            <div className="absolute right-0 top-full mt-1 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-10 py-1 min-w-[130px]">
              <button onClick={() => { onEdit(project); setMenu(false); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-300 hover:text-white hover:bg-gray-800"><Edit3 size={11} /> Edit</button>
              <div className="border-t border-gray-800 my-1" />
              <button onClick={() => { onDelete(project.id); setMenu(false); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-gray-800"><Trash2 size={11} /> Delete</button>
            </div>
          )}
        </div>
      </div>
      {project.description && <p className="text-xs text-gray-500 mb-3 line-clamp-2 leading-relaxed">{project.description}</p>}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-600"><Calendar size={10} /> {new Date(project.updated_at || project.created_at).toLocaleDateString()}</div>
        <ArrowRight size={13} className="text-gray-700 group-hover:text-gray-400 transition-colors" />
      </div>
    </div>
  );
}

function CreateProjectModal({ onClose, onSave, editProject }) {
  const [name, setName] = useState(editProject?.name || "");
  const [description, setDescription] = useState(editProject?.description || "");
  const [color, setColor] = useState(editProject?.color || PROJECT_COLORS[0]);
  const [icon, setIcon] = useState(editProject?.icon || PROJECT_ICONS[0]);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) { toast.error("Project name required"); return; }
    await onSave({ name: name.trim(), description: description.trim(), color, icon });
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <h2 className="font-semibold text-sm">{editProject ? "Edit project" : "New project"}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={16} /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-2">Icon</label>
            <div className="flex gap-2 flex-wrap">{PROJECT_ICONS.map(ic => <button key={ic} type="button" onClick={() => setIcon(ic)} className={`text-xl p-1.5 rounded-lg transition-colors ${icon === ic ? "bg-gray-700 ring-1 ring-violet-500" : "hover:bg-gray-800"}`}>{ic}</button>)}</div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-2">Color</label>
            <div className="flex gap-2">{PROJECT_COLORS.map(c => <button key={c} type="button" onClick={() => setColor(c)} className="w-7 h-7 rounded-full transition-transform hover:scale-110 flex items-center justify-center" style={{ background: c }}>{color === c && <Check size={12} className="text-white" />}</button>)}</div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} required placeholder="My Research Project" className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500 transition-colors" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="What is this project about?" className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500 transition-colors resize-none" />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white border border-gray-700 rounded-xl transition-colors">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm bg-violet-600 hover:bg-violet-500 text-white rounded-xl transition-colors font-medium">{editProject ? "Save changes" : "Create project"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const navigate = useNavigate();
  const { projects, fetchProjects, createProject, deleteProject, updateProject } = useProjectStore();
  const { fetchChats, newChat } = useChatStore();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editProject, setEditProject] = useState(null);
  const [sidebarOpen, setSidebar] = useState(true);
  const [selectedModel, setModel] = useState("claude-sonnet-4-6");

  useEffect(() => { fetchProjects(); fetchChats(); }, []);

  const filtered = projects.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.description?.toLowerCase().includes(search.toLowerCase()));

  async function handleSave(data) {
    if (editProject) { await updateProject(editProject.id, data); toast.success("Project updated"); }
    else { await createProject(data); toast.success("Project created!"); }
    setEditProject(null);
  }

  async function handleDelete(id) {
    if (!confirm("Delete this project?")) return;
    await deleteProject(id);
    toast.success("Project deleted");
  }

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebar(false)} selectedModel={selectedModel} onModelChange={setModel} onNewChat={async () => { const c = await newChat(); navigate(`/chat/${c.id}`); }} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 flex-shrink-0">
          <button onClick={() => setSidebar(o => !o)} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"><Menu size={17} /></button>
          <div className="flex items-center gap-2 flex-1"><FolderKanban size={18} className="text-violet-400" /><h1 className="font-semibold text-sm">Projects</h1></div>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium px-3 py-2 rounded-xl transition-colors"><Plus size={13} /> New project</button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="relative max-w-sm mb-6">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search projects…" className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white outline-none focus:border-gray-700 transition-colors" />
          </div>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <FolderKanban size={48} className="text-gray-800 mb-4" />
              <h2 className="text-lg font-semibold text-gray-400 mb-2">No projects yet</h2>
              <p className="text-gray-600 text-sm mb-6 max-w-sm">Create a project to organize your AI conversations.</p>
              <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"><Plus size={14} /> Create your first project</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map(project => <ProjectCard key={project.id} project={project} onOpen={id => navigate(`/projects/${id}`)} onDelete={handleDelete} onEdit={p => { setEditProject(p); setShowCreate(true); }} />)}
              <button onClick={() => setShowCreate(true)} className="bg-gray-900 border border-dashed border-gray-800 hover:border-gray-700 rounded-2xl p-5 flex flex-col items-center justify-center gap-2 text-gray-600 hover:text-gray-400 transition-all cursor-pointer min-h-[140px]"><Plus size={20} /><span className="text-xs">New project</span></button>
            </div>
          )}
        </div>
      </div>
      {showCreate && <CreateProjectModal onClose={() => { setShowCreate(false); setEditProject(null); }} onSave={handleSave} editProject={editProject} />}
    </div>
  );
}
