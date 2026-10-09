import { Brain, X, Trash2 } from "lucide-react";
import useChatStore from "../context/chatStore";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";

export default function MemoryPanel({ onClose }) {
  const { memories, memoryTotal, memoryError, deleteMemory, clearMemories } = useChatStore();
  return (
    <aside className="w-72 border-l border-gray-800/60 bg-gray-950/90 backdrop-blur flex flex-col flex-shrink-0 relative z-20">
      <div className="flex items-center justify-between p-4 border-b border-gray-800/60">
        <div className="flex items-center gap-2"><Brain size={14} className="text-violet-400" /><span className="text-sm font-medium">NeuroSense ({memoryTotal})</span></div>
        <div className="flex gap-2">
          {memories.length > 0 && (
            <button onClick={async () => { if (!confirm("Delete all memory facts and revisions? Chat transcripts stay saved.")) return; try { await clearMemories(); toast.success("Memory cleared"); } catch { toast.error("Unable to clear memories"); } }}
              className="text-[11px] text-red-400 hover:text-red-300 border border-red-500/30 px-2 py-1 rounded-lg transition-colors">Clear all</button>
          )}
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors"><X size={15} /></button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin">
        {memoryError && <p role="alert" className="text-xs text-red-400">{memoryError}</p>}
        {memories.length === 0 ? (
          <div className="text-center mt-12 text-gray-700">
            <Brain size={30} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No memories yet.</p>
            <p className="text-xs mt-1">Chat and I'll learn about you.</p>
          </div>
        ) : memories.map((m, i) => (
          <div key={m.id || i} className="group flex items-start gap-2 p-2.5 bg-gray-900/60 border border-gray-800 rounded-xl hover:border-gray-700 transition-colors">
            <span className="text-violet-400/50 text-[10px] font-medium mt-0.5 flex-shrink-0">#{i+1}</span>
            <p className="text-[12px] text-gray-300 flex-1 leading-relaxed">{m.fact}</p>
            <button aria-label="Delete memory" onClick={async () => { try { await deleteMemory(m.id); } catch { toast.error("Unable to delete memory"); } }} className="opacity-0 group-hover:opacity-100 text-gray-700 hover:text-red-400 transition-all flex-shrink-0"><Trash2 size={11} /></button>
          </div>
        ))}
      </div>
      <div className="p-3 border-t border-gray-800/60 text-center"><Link to="/memory" className="text-xs text-violet-300 hover:text-white">Open Memory Studio →</Link><p className="text-[10px] text-gray-500 mt-2">Inspect sources, revisions and recall</p></div>
    </aside>
  );
}
