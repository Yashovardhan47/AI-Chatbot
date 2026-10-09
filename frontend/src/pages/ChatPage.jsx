import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Menu, Globe, Brain, Mic, MicOff, Paperclip, Send, Sparkles, Square, Shield } from "lucide-react";
import toast from "react-hot-toast";
import useChatStore from "../context/chatStore";
import MessageBubble from "../components/MessageBubble";
import MemoryPanel from "../components/MemoryPanel";
import FilePreview from "../components/FilePreview";
import Sidebar, { AI_MODELS } from "../components/sidebar/Sidebar";
import LivingBackground from "../components/LivingBackground";
import AIAvatar from "../components/AIAvatar";

const MODES = [
  { key: "auto", label: "Auto", color: "#534AB7" },
  { key: "friend", label: "Friend", color: "#1D9E75" },
  { key: "teacher", label: "Teacher", color: "#378ADD" },
  { key: "researcher", label: "Researcher", color: "#D85A30" },
  { key: "coder", label: "Coder", color: "#0F6E56" },
  { key: "mentor", label: "Mentor", color: "#BA7517" },
];

export default function ChatPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { chats, activeChat, messages, memories, memoryTotal, streaming, streamBuffer, fetchChats, fetchHistory, openChat, newChat, sendMessage, fetchMemories, uploadFiles, getTodayChat } = useChatStore();

  const [input, setInput] = useState("");
  const [mode, setMode] = useState("auto");
  const [selectedModel, setModel] = useState("claude-sonnet-4-6");
  const [webSearch, setWebSearch] = useState(false);
  const [files, setFiles] = useState([]);
  const [recording, setRecording] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [sidebarOpen, setSidebar] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [ttsActive, setTtsActive] = useState(false);
  const [privateMode, setPrivateMode] = useState(false);

  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const recognRef = useRef(null);

  useEffect(() => { fetchChats(); fetchMemories(); fetchHistory(); }, []);
  useEffect(() => () => useChatStore.getState().disconnect(), []);
  useEffect(() => {
    if (id) { openChat(id); }
    else { getTodayChat().then(chat => { if (chat) navigate(`/chat/${chat.id}`, { replace: true }); }); }
  }, [id]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streaming, streamBuffer]);

  function toggleVoice() {
    if (recording) { recognRef.current?.stop(); setRecording(false); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast.error("Voice input needs Chrome or Edge"); return; }
    const r = new SR();
    r.continuous = true; r.interimResults = true;
    let final = "";
    r.onresult = e => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript + " ";
        else interim = e.results[i][0].transcript;
      }
      setInput(final + interim);
    };
    r.onerror = () => setRecording(false);
    r.onend = () => setRecording(false);
    r.start(); recognRef.current = r; setRecording(true);
  }

  function speakText(text) {
    if (!window.speechSynthesis) { toast.error("TTS not supported"); return; }
    window.speechSynthesis.cancel();
    const clean = text.replace(/```[\s\S]*?```/g, "code block").replace(/[*#`]/g, "");
    const utt = new SpeechSynthesisUtterance(clean);
    utt.rate = 1.05;
    utt.onend = () => setTtsActive(false);
    window.speechSynthesis.speak(utt);
    setTtsActive(true);
  }

  async function onFilePick(e) {
    const picked = Array.from(e.target.files || []).slice(0, 5);
    e.target.value = "";
    if (!picked.length) return;
    setUploading(true);
    try {
      const uploaded = await uploadFiles(picked);
      setFiles(prev => [...prev, ...uploaded]);
      toast.success(`${uploaded.length} file(s) ready`);
    } catch { toast.error("Upload failed — check Cloudinary config in .env"); }
    finally { setUploading(false); }
  }

  async function handleSend() {
    const text = input.trim();
    if ((!text && files.length === 0) || streaming) return;
    if (!activeChat) { const chat = await newChat(); navigate(`/chat/${chat.id}`, { replace: true }); }
    recognRef.current?.stop(); setRecording(false);
    const attachments = [...files];
    const sent = sendMessage({ content: text, attachments, mode, webSearch, model: selectedModel, privateMode });
    if (!sent) return;
    setInput(""); setFiles([]);
    if (inputRef.current) inputRef.current.style.height = "auto";
  }

  const currentMode = MODES.find(m => m.key === mode) || MODES[0];
  const modelInfo = AI_MODELS.find(m => m.id === selectedModel) || AI_MODELS[0];

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden relative">
      <LivingBackground mode={mode} />
      <Sidebar open={sidebarOpen} onClose={() => setSidebar(false)} selectedModel={selectedModel} onModelChange={setModel}
        onNewChat={async () => { const chat = await newChat(); navigate(`/chat/${chat.id}`); }} />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0 relative z-10">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800/60 flex-shrink-0 bg-gray-950/70 backdrop-blur">
          <button onClick={() => setSidebar(o => !o)} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors flex-shrink-0"><Menu size={16} /></button>
          {activeChat && <span className="text-xs text-gray-500 truncate hidden sm:block max-w-[180px]">{activeChat.title}</span>}
          <div className="flex gap-1 overflow-x-auto flex-1 scrollbar-none">
            {MODES.map(m => (
              <button key={m.key} onClick={() => setMode(m.key)}
                style={mode === m.key ? { borderColor: m.color + "60", background: m.color + "18", color: m.color } : {}}
                className={`px-2.5 py-1 rounded-full text-[10px] font-medium border transition-all whitespace-nowrap flex-shrink-0 ${mode === m.key ? "" : "border-gray-800 text-gray-600 hover:border-gray-600 hover:text-gray-400"}`}>
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] border border-gray-800 text-gray-500 flex-shrink-0">
            <modelInfo.icon size={10} className={modelInfo.color} /><span className="hidden sm:inline">{modelInfo.label}</span>
          </div>
          <button onClick={() => setWebSearch(s => !s)} className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] border transition-all flex-shrink-0 ${webSearch ? "border-blue-500/40 bg-blue-600/20 text-blue-400" : "border-gray-800 text-gray-600 hover:border-gray-600"}`}><Globe size={11} /></button>
          <button onClick={() => setShowMemory(s => !s)} className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] border transition-all flex-shrink-0 ${showMemory ? "border-violet-500/40 bg-violet-600/20 text-violet-400" : "border-gray-800 text-gray-600 hover:border-gray-600"}`}>
            <Brain size={11} />
            {memoryTotal > 0 && <span className="bg-violet-500 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center text-[8px]">{memoryTotal > 99 ? "99+" : memoryTotal}</span>}
          </button>
          <button onClick={() => setPrivateMode(value => !value)} aria-pressed={privateMode}
            title="Skip memory recall and capture for this message. Chat transcripts are still saved."
            className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] border ${privateMode ? "text-amber-300 border-amber-500/40 bg-amber-500/10" : "text-gray-400 border-gray-700"}`}>
            <Shield size={11} /><span className="hidden sm:inline">{privateMode ? "Memory off" : "Private mode"}</span>
          </button>
          {ttsActive && <button onClick={() => { window.speechSynthesis?.cancel(); setTtsActive(false); }} className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] border border-orange-500/40 bg-orange-600/20 text-orange-400 flex-shrink-0"><Square size={9} fill="currentColor" /> Stop</button>}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6 scrollbar-thin">
          {messages.length === 0 && !streaming && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <AIAvatar size={64} thinking={false} mode={mode} />
              <h2 className="text-xl font-semibold mt-4 mb-2 text-white">{activeChat?.is_daily ? "Today's session" : "How can I help?"}</h2>
              <p className="text-gray-500 text-sm max-w-sm mb-2">Using <span style={{ color: currentMode.color }} className="font-medium">{modelInfo.name}</span></p>
              {memoryTotal > 0 && <p className="text-xs text-violet-400/70 mb-6">{memoryTotal} stored facts across your sessions and projects</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-md w-full mt-2">
                {["Explain Python async/await with examples","Debug my FastAPI authentication code","What are the latest AI trends?","Help me write a research paper intro","Build a REST API in Python","Analyze this concept and give me sources"].map(p => (
                  <button key={p} onClick={() => { setInput(p); inputRef.current?.focus(); }} className="text-left text-xs bg-gray-900/60 backdrop-blur hover:bg-gray-800/60 border border-gray-800 hover:border-gray-700 rounded-xl p-3 text-gray-400 hover:text-gray-200 transition-all">{p}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((msg, i) => <MessageBubble key={msg.id || i} message={msg} isLast={i === messages.length - 1} onSpeak={() => speakText(msg.content)} />)}
          {streaming && streamBuffer && <MessageBubble message={{ role: "assistant", content: streamBuffer, streaming: true }} />}
          {streaming && !streamBuffer && (
            <div className="flex gap-3 mb-5">
              <AIAvatar size={28} thinking={true} mode={mode} />
              <div className="flex items-center gap-2 px-4 py-3 bg-gray-800/40 border border-gray-700/40 backdrop-blur rounded-2xl rounded-tl-sm">
                <span className="text-xs text-gray-500 animate-pulse">Thinking…</span>
                {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: currentMode.color, animationDelay: `${i*0.15}s` }} />)}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {files.length > 0 && (
          <div className="px-4 py-2 flex gap-2 flex-wrap border-t border-gray-800/60 flex-shrink-0 bg-gray-950/70">
            {files.map((f, i) => <FilePreview key={i} file={f} onRemove={() => setFiles(prev => prev.filter((_, j) => j !== i))} />)}
          </div>
        )}

        <div className="px-4 py-3 border-t border-gray-800/60 flex-shrink-0 bg-gray-950/70 backdrop-blur">
          <div className="flex items-end gap-2 bg-gray-900/80 backdrop-blur border border-gray-700/60 rounded-2xl p-2.5 max-w-4xl mx-auto transition-all" style={{ boxShadow: streaming ? `0 0 20px ${currentMode.color}22` : "none" }}>
            <button onClick={() => fileRef.current?.click()} disabled={uploading} className={`p-1.5 rounded-xl transition-colors flex-shrink-0 ${files.length > 0 ? "text-violet-400 bg-violet-600/20" : "text-gray-600 hover:text-gray-400 hover:bg-gray-800"}`}>
              {uploading ? <div className="h-4 w-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" /> : <Paperclip size={15} />}
            </button>
            <input ref={fileRef} type="file" multiple className="hidden" accept="image/*,application/pdf,text/*,.csv,.json,.js,.py,.java,.ts,.html,.css,.md,audio/*,video/*" onChange={onFilePick} />
            <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Message NeuroFusion AI… (Enter to send, Shift+Enter for new line)" rows={1}
              className="flex-1 bg-transparent outline-none text-sm text-white placeholder-gray-600 resize-none max-h-36 leading-relaxed"
              onInput={e => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 144) + "px"; }} />
            <button onClick={toggleVoice} className={`p-1.5 rounded-xl transition-colors flex-shrink-0 ${recording ? "bg-red-500/20 text-red-400 animate-pulse" : "text-gray-600 hover:text-gray-400 hover:bg-gray-800"}`}>{recording ? <MicOff size={15} /> : <Mic size={15} />}</button>
            <button onClick={handleSend} disabled={streaming || (!input.trim() && files.length === 0)} className="p-2 bg-white hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed text-gray-950 rounded-xl transition-colors flex-shrink-0"><Send size={14} /></button>
          </div>
          <p className="text-[10px] text-gray-500 text-center mt-1.5">{privateMode ? "Memory recall and capture are off · This chat is still saved" : "Powered by NeuroSense · Relevant memories across sessions"} · {modelInfo.name}</p>
        </div>
      </div>

      {showMemory && <MemoryPanel onClose={() => setShowMemory(false)} />}
    </div>
  );
}
