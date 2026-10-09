import { X } from "lucide-react";
export default function FilePreview({ file, onRemove }) {
  const icon = file.file_type === "image" ? "🖼️" : file.file_type === "pdf" ? "📄" : file.file_type === "audio" ? "🎙️" : file.file_type === "video" ? "🎬" : "📁";
  return (
    <div className="flex items-center gap-2 bg-gray-800/60 border border-gray-700 rounded-lg px-2.5 py-1.5 max-w-[160px] backdrop-blur">
      <span className="text-sm">{icon}</span>
      <span className="text-[11px] text-gray-300 truncate flex-1">{file.name}</span>
      <button onClick={onRemove} className="text-gray-600 hover:text-red-400 flex-shrink-0 transition-colors"><X size={11} /></button>
    </div>
  );
}
