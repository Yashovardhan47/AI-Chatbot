import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, Swords, CalendarCheck, ArrowLeft, FileSearch, Globe, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import api from "../services/api";
import toast from "react-hot-toast";

const MODELS = [
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6 — Recommended" },
  { id: "claude-opus-4-6", label: "Opus 4.6 — Most Powerful" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5 — Fastest" },
];

function Section({ title, icon: Icon, color, children }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden mb-4">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-800/50 transition-colors">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}><Icon size={16} className="text-white" /></div>
        <span className="font-semibold text-sm text-white flex-1 text-left">{title}</span>
        {open ? <ChevronUp size={15} className="text-gray-500" /> : <ChevronDown size={15} className="text-gray-500" />}
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

function ResultBox({ data, label = "Result" }) {
  if (!data) return null;
  return (
    <div className="mt-4 bg-gray-950 border border-gray-700 rounded-xl p-4">
      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">{label}</p>
      <pre className="text-sm text-gray-200 whitespace-pre-wrap font-sans leading-relaxed">{typeof data === "string" ? data : JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}

export default function AgentsPage() {
  const navigate = useNavigate();
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [loading, setLoad] = useState({});

  const [multiQuery, setMQ] = useState(""); const [multiResult, setMR] = useState(null);
  const [debateTopic, setDT] = useState(""); const [debateResult, setDR] = useState(null);
  const [planGoal, setPG] = useState(""); const [planWeeks, setPW] = useState(4); const [planResult, setPR] = useState(null);
  const [ragDoc, setRD] = useState(""); const [ragQ, setRQ] = useState(""); const [ragResult, setRR] = useState(null);
  const [webQ, setWQ] = useState(""); const [webResult, setWR] = useState(null);

  async function call(key, endpoint, body, setter) {
    setLoad(l => ({ ...l, [key]: true }));
    try { const { data } = await api.post(endpoint, { ...body, model }); setter(data); }
    catch (err) { toast.error(err.response?.data?.detail || "Request failed"); }
    finally { setLoad(l => ({ ...l, [key]: false })); }
  }

  const spinner = key => loading[key] ? <Loader2 size={15} className="animate-spin" /> : null;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate("/chat")} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"><ArrowLeft size={17} /></button>
          <div className="flex items-center gap-2"><Bot size={20} className="text-violet-400" /><h1 className="text-lg font-bold">AI Enhancement Lab</h1></div>
        </div>

        <div className="flex items-center gap-3 mb-6 bg-gray-900 border border-gray-800 rounded-xl p-3">
          <span className="text-xs text-gray-500 font-medium">Model:</span>
          <select value={model} onChange={e => setModel(e.target.value)} className="flex-1 bg-gray-800 border border-gray-700 text-white text-xs rounded-lg px-3 py-1.5 outline-none focus:border-violet-500">
            {MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>

        <Section title="Multi-Agent System — Intent → Specialist → Self-Reflection" icon={Bot} color="bg-violet-600">
          <textarea value={multiQuery} onChange={e => setMQ(e.target.value)} rows={3} placeholder="Ask anything — picks the best specialist agent automatically…" className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-violet-500 resize-none" />
          <button onClick={() => call("multi", "/agents/multi-agent", { query: multiQuery }, setMR)} disabled={!multiQuery || loading.multi} className="mt-3 flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors">{spinner("multi")} Run Multi-Agent</button>
          {multiResult && (
            <div className="mt-4 space-y-3">
              <div className="flex gap-3 flex-wrap">
                <span className="text-xs bg-violet-600/20 text-violet-400 border border-violet-500/30 px-2 py-1 rounded-full">Agent: {multiResult.specialist_used}</span>
                {multiResult.confidence != null && <span className="text-xs bg-green-600/20 text-green-400 border border-green-500/30 px-2 py-1 rounded-full">Confidence: {multiResult.confidence}%</span>}
              </div>
              <ResultBox data={multiResult.answer} label="Final Answer" />
            </div>
          )}
        </Section>

        <Section title="AI Debate Mode — Research + Critic + Supporter + Judge" icon={Swords} color="bg-red-600">
          <input value={debateTopic} onChange={e => setDT(e.target.value)} placeholder="e.g. Should AI replace doctors?" className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500" />
          <button onClick={() => call("debate", "/agents/debate", { topic: debateTopic }, setDR)} disabled={!debateTopic || loading.debate} className="mt-3 flex items-center gap-2 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors">{spinner("debate")} Start Debate</button>
          {debateResult && (
            <div className="mt-4 space-y-3">
              {[["research","Research Agent","text-blue-400"],["for","Supporter","text-green-400"],["against","Critic","text-red-400"],["verdict","Judge Verdict","text-yellow-400"]].map(([key,label,color]) => debateResult[key] && (
                <div key={key} className="bg-gray-950 border border-gray-700 rounded-xl p-4"><p className={`text-xs font-medium mb-2 ${color}`}>{label}</p><p className="text-sm text-gray-200 leading-relaxed">{debateResult[key]}</p></div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Autonomous Task Planner" icon={CalendarCheck} color="bg-green-600">
          <input value={planGoal} onChange={e => setPG(e.target.value)} placeholder="e.g. Prepare for GATE DA exam" className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500 mb-3" />
          <div className="flex items-center gap-3 mb-3"><span className="text-xs text-gray-500">Weeks:</span>{[2,4,8,12].map(w => <button key={w} onClick={() => setPW(w)} className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${planWeeks === w ? "bg-green-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>{w}</button>)}</div>
          <button onClick={() => call("plan", "/agents/plan", { goal: planGoal, weeks: planWeeks }, setPR)} disabled={!planGoal || loading.plan} className="flex items-center gap-2 bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors">{spinner("plan")} Generate Plan</button>
          {planResult?.plan && (
            <div className="mt-4 space-y-2">
              {planResult.plan.weeks?.map((w, i) => (
                <div key={i} className="bg-gray-950 border border-gray-700 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2"><span className="bg-green-600/20 text-green-400 border border-green-500/30 text-xs px-2 py-0.5 rounded-full">Week {w.week}</span><span className="text-sm font-medium text-white">{w.theme}</span></div>
                  <ul className="space-y-1">{w.tasks?.map((t, j) => <li key={j} className="text-xs text-gray-400 flex items-start gap-2"><span className="text-green-500 mt-0.5">✓</span>{t}</li>)}</ul>
                  {w.milestone && <p className="text-xs text-yellow-400 mt-2">🎯 {w.milestone}</p>}
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="RAG — Answer From Your Document" icon={FileSearch} color="bg-blue-600">
          <textarea value={ragDoc} onChange={e => setRD(e.target.value)} rows={4} placeholder="Paste document text here…" className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-blue-500 resize-none mb-3" />
          <input value={ragQ} onChange={e => setRQ(e.target.value)} placeholder="Ask a question about the document…" className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-blue-500 mb-3" />
          <button onClick={() => call("rag", "/rag/query", { query: ragQ, document_text: ragDoc, document_name: "Document" }, setRR)} disabled={!ragDoc || !ragQ || loading.rag} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors">{spinner("rag")} Ask Document</button>
          {ragResult && <ResultBox data={ragResult.answer} label="Document Answer" />}
        </Section>

        <Section title="Real-Time Web Intelligence" icon={Globe} color="bg-teal-600">
          <input value={webQ} onChange={e => setWQ(e.target.value)} placeholder="Ask anything that needs current information…" className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-teal-500 mb-3" />
          <button onClick={() => call("web", "/rag/web-search", { query: webQ }, setWR)} disabled={!webQ || loading.web} className="flex items-center gap-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors">{spinner("web")} Search & Answer</button>
          {webResult && <ResultBox data={webResult.answer} label="Web Intelligence Answer" />}
        </Section>
      </div>
    </div>
  );
}
