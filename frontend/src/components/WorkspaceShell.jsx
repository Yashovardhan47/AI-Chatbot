import KineticText from "../motion/KineticText";
import { Link, useLocation } from "react-router-dom";
import { useAppFrame } from "../context/frameContext";
import { Brain, MessageSquare, LayoutDashboard, BookOpen, Network, CalendarCheck, Settings, FolderKanban } from "lucide-react";

const links = [["/home", "Home", LayoutDashboard], ["/chat", "Chat", MessageSquare],
  ["/knowledge", "Knowledge", BookOpen], ["/continuity", "Continuity", CalendarCheck],
  ["/memory", "Memory", Brain], ["/memory-graph", "Graph", Network], ["/projects", "Projects", FolderKanban]];

export default function WorkspaceShell({ eyebrow, title, description, action, children }) {
  const { pathname } = useLocation();
  const frame = useAppFrame();
  return <div className="min-h-screen bg-gray-950 text-gray-100">
    {!frame && <header className="border-b border-gray-800 bg-gray-950/95 sticky top-0 z-30 backdrop-blur">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-4 flex items-center justify-between gap-4"><Link to="/home" className="flex items-center gap-2 font-semibold"><Brain size={21} className="text-violet-400" />NeuroSense <span className="hidden sm:inline text-xs text-gray-500 font-normal">AI workspace</span></Link><Link to="/settings" aria-label="Settings" className="p-2 text-gray-400 hover:text-white"><Settings size={18} /></Link></div>
      <nav aria-label="Workspace navigation" className="max-w-7xl mx-auto px-4 sm:px-8 flex gap-4 overflow-x-auto">
        {links.map(([path, label, Icon]) => <Link key={path} to={path} className={`flex items-center gap-1.5 text-xs py-3 whitespace-nowrap border-b-2 ${pathname === path ? "text-violet-200 border-violet-400" : "text-gray-500 border-transparent hover:text-gray-200"}`}><Icon size={13}/>{label}</Link>)}
      </nav>
    </header>}
    <main className="max-w-7xl mx-auto px-4 sm:px-8 py-8"><div className="flex flex-wrap items-start justify-between gap-4 mb-7"><div><p className="text-xs uppercase tracking-widest text-violet-400 mb-2">{eyebrow}</p><h1 className="text-3xl sm:text-4xl font-semibold tracking-tight"><KineticText>{title}</KineticText></h1><p className="text-sm text-gray-400 mt-3 max-w-2xl">{description}</p></div>{action}</div>{children}</main>
  </div>;
}
