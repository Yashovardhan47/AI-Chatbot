import { useState } from "react";
import { Copy, Check, Lightbulb, Volume2, ThumbsUp, ThumbsDown } from "lucide-react";
import AIAvatar from "./AIAvatar";
import { Link } from "react-router-dom";

function CodeBlock({ lang, code }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="my-3 rounded-xl overflow-hidden border border-gray-700/60">
      <div className="flex items-center justify-between bg-gray-800/80 px-4 py-2">
        <span className="text-[11px] text-gray-400 font-mono">{lang || "code"}</span>
        <button onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-gray-300 transition-colors">
          {copied ? <><Check size={10} className="text-green-400" /> Copied</> : <><Copy size={10} /> Copy</>}
        </button>
      </div>
      <pre className="bg-gray-950 px-4 py-3 overflow-x-auto text-[12px] font-mono text-gray-200 leading-relaxed scrollbar-thin">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function renderContent(text) {
  if (!text) return null;
  const parts = [];
  const codeRe = /```(\w*)\n?([\s\S]*?)```/g;
  let last = 0, m;
  while ((m = codeRe.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: "text", content: text.slice(last, m.index) });
    parts.push({ type: "code", lang: m[1], content: m[2].trim() });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: "text", content: text.slice(last) });

  return parts.map((p, i) => {
    if (p.type === "code") return <CodeBlock key={i} lang={p.lang} code={p.content} />;
    const html = p.content
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
      .replace(/`([^`]+)`/g, '<code class="bg-gray-800 text-violet-300 px-1.5 py-0.5 rounded text-[12px] font-mono">$1</code>')
      .replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>")
      .replace(/\*(.+?)\*/g,"<em>$1</em>")
      .replace(/^### (.+)$/gm,'<h3 class="text-sm font-semibold text-white mt-4 mb-1.5">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 class="text-base font-semibold text-white mt-4 mb-2">$1</h2>')
      .replace(/^# (.+)$/gm,  '<h2 class="text-lg font-bold text-white mt-4 mb-2">$1</h2>')
      .replace(/^\d+\.\s(.+)$/gm,'<li class="ml-5 list-decimal text-gray-200 text-sm mb-1">$1</li>')
      .replace(/^[-*]\s(.+)$/gm,'<li class="ml-5 list-disc text-gray-200 text-sm mb-1">$1</li>')
      .replace(/(<li[\s\S]*?<\/li>\n?)+/g, s => `<ul class="my-2">${s}</ul>`)
      .replace(/\n\n/g,'</p><p class="mb-2">')
      .replace(/\n/g,"<br/>");
    return <div key={i} className="text-sm text-gray-200 leading-relaxed" dangerouslySetInnerHTML={{ __html: `<p class="mb-2">${html}</p>` }} />;
  });
}

function ConfBadge({ value }) {
  const cls = value >= 90 ? "text-green-400 bg-green-500/10 border-green-500/30"
            : value >= 70 ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/30"
            : "text-red-400 bg-red-500/10 border-red-500/30";
  return <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${cls}`}>{value}% confident</span>;
}

export default function MessageBubble({ message, isLast, onSpeak }) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState(null);

  if (isUser) return (
    <div className="flex justify-end mb-5">
      <div className="max-w-[82%]">
        {message.attachments?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-1.5 justify-end">
            {message.attachments.map((a, i) => (
              <span key={i} className="text-[10px] bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full border border-gray-700">📎 {a.name}</span>
            ))}
          </div>
        )}
        <div className="bg-gray-800/80 border border-gray-700/50 rounded-2xl rounded-tr-sm px-4 py-3 text-sm text-white whitespace-pre-wrap leading-relaxed backdrop-blur">
          {message.content}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex gap-3 mb-5 group">
      <div className="flex-shrink-0 mt-0.5"><AIAvatar size={28} thinking={message.streaming} mode="auto" /></div>
      <div className="flex-1 min-w-0">
        <div className={`rounded-2xl rounded-tl-sm px-4 py-3 bg-gray-900/50 border border-gray-800/50 backdrop-blur ${message.streaming ? "animate-pulse" : ""}`}>
          {renderContent(message.content)}
        </div>
        {!message.streaming && (
          <div className="flex items-center gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => { navigator.clipboard.writeText(message.content); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              className="p-1.5 rounded-lg text-gray-700 hover:text-gray-300 hover:bg-gray-800 transition-colors">
              {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
            </button>
            {onSpeak && <button onClick={onSpeak} className="p-1.5 rounded-lg text-gray-700 hover:text-gray-300 hover:bg-gray-800 transition-colors"><Volume2 size={12} /></button>}
            <button onClick={() => setFeedback("up")} className={`p-1.5 rounded-lg transition-colors ${feedback === "up" ? "text-green-400" : "text-gray-700 hover:text-gray-300 hover:bg-gray-800"}`}><ThumbsUp size={12} /></button>
            <button onClick={() => setFeedback("down")} className={`p-1.5 rounded-lg transition-colors ${feedback === "down" ? "text-red-400" : "text-gray-700 hover:text-gray-300 hover:bg-gray-800"}`}><ThumbsDown size={12} /></button>
          </div>
        )}
        {!message.streaming && (message.confidence != null || message.reasoning || message.sources) && (
          <div className="mt-2 flex flex-col gap-1">
            <div className="flex items-center gap-2 flex-wrap">
              {message.confidence != null && <ConfBadge value={message.confidence} />}
              {message.sources && message.sources !== "NONE" && message.sources.split(",").map((s, i) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded-full text-gray-600">{s.trim()}</span>
              ))}
            </div>
            {message.reasoning && (
              <div className="flex items-start gap-1.5 text-[11px] text-gray-600">
                <Lightbulb size={10} className="mt-0.5 flex-shrink-0 text-yellow-600/50" />{message.reasoning}
              </div>
            )}
            {message.memory_note && <div className="text-[10px] text-gray-700">🧠 Remembered: {message.memory_note}</div>}
          </div>
        )}
        {!message.streaming && message.memory_receipt?.used?.length > 0 && (
          <details className="mt-2 text-xs text-violet-300">
            <summary className="cursor-pointer">NeuroSense used {message.memory_receipt.used.length} memories · {message.memory_receipt.context_chars} context characters</summary>
            <div className="mt-2 space-y-2 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
              {message.memory_receipt.used.map(item => <div key={item.id}>
                <Link className="underline hover:text-white" to={`/memory?memory=${item.id}`}>View memory · version {item.version}</Link>
                <p className="text-gray-400 mt-0.5">{item.reason}</p>
              </div>)}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
