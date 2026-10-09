import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Sparkles, ArrowRight, MessageSquare, LayoutDashboard, Bot, Brain,
  Send, Star, Clock, Swords, CalendarCheck, Zap,
} from "lucide-react";
import useAuthStore from "../context/authStore";
import LivingBackground from "../components/LivingBackground";
import AIAvatar from "../components/AIAvatar";

// ── Demo mockups shown inside the browser-frame ───────────────────────────────
function ChatDemo() {
  return (
    <div className="p-4 space-y-3">
      <div className="flex justify-end"><div className="bg-gray-800 rounded-2xl rounded-tr-sm px-3 py-2 text-xs text-white max-w-[75%]">Explain async/await in Python</div></div>
      <div className="flex gap-2">
        <AIAvatar size={22} mode="auto" />
        <div className="bg-gray-800/60 rounded-2xl rounded-tl-sm px-3 py-2 text-xs text-gray-300 max-w-[80%] leading-relaxed">
          async/await lets a function pause at an <code className="text-violet-300">await</code> point without blocking the whole program…
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[9px] bg-green-500/10 text-green-400 border border-green-500/30 px-1.5 py-0.5 rounded-full">96% confident</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 bg-gray-800/60 rounded-xl px-3 py-1.5 mt-2">
        <div className="flex-1 text-[11px] text-gray-600">Message NeuroFusion AI…</div>
        <Send size={13} className="text-gray-600" />
      </div>
    </div>
  );
}

function DashboardDemo() {
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-3 bg-violet-600/10 border border-violet-500/20 rounded-xl p-3">
        <AIAvatar size={30} mode="auto" />
        <div><p className="text-xs text-white font-medium">Good morning, Alex 👋</p><p className="text-[10px] text-gray-500">Last session: "FastAPI middleware" · 12 memories recalled</p></div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[["142","Messages"],["12","Memories"],["8","Chats"],["5","Files"]].map(([v,l]) => (
          <div key={l} className="bg-gray-800/60 rounded-lg p-2 text-center"><div className="text-sm font-bold text-white">{v}</div><div className="text-[9px] text-gray-500">{l}</div></div>
        ))}
      </div>
      <div className="flex items-center gap-2 bg-gray-800/40 rounded-xl px-3 py-2">
        <Star size={12} className="text-yellow-400 fill-yellow-400" />
        <span className="text-[11px] text-gray-300 flex-1">Healthcare AI research</span>
        <Clock size={10} className="text-gray-600" />
      </div>
    </div>
  );
}

function AgentsDemo() {
  return (
    <div className="p-4 space-y-2">
      {[
        [Bot, "Multi-Agent", "Intent → Specialist → Self-Reflection", "bg-violet-600"],
        [Swords, "Debate Mode", "Research + Critic + Supporter + Judge", "bg-red-600"],
        [CalendarCheck, "Task Planner", "4-week study plan generated", "bg-green-600"],
      ].map(([Icon, title, desc, color], i) => (
        <div key={i} className="flex items-center gap-3 bg-gray-800/50 rounded-xl p-3">
          <div className={`w-7 h-7 rounded-lg ${color} flex items-center justify-center flex-shrink-0`}><Icon size={13} className="text-white" /></div>
          <div className="min-w-0"><p className="text-xs text-white font-medium">{title}</p><p className="text-[10px] text-gray-500 truncate">{desc}</p></div>
        </div>
      ))}
    </div>
  );
}

function MemoryDemo() {
  const facts = ["Prefers concise code examples", "Working on NeuroFusion AI project", "Learning FastAPI + React", "Interested in healthcare AI research"];
  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-3"><Brain size={14} className="text-violet-400" /><span className="text-xs font-medium text-white">Memory (4)</span></div>
      <div className="space-y-2">
        {facts.map((f, i) => (
          <div key={i} className="flex items-start gap-2 bg-gray-800/50 rounded-lg p-2.5">
            <span className="text-violet-400/50 text-[10px] mt-0.5">#{i+1}</span>
            <p className="text-[11px] text-gray-300 leading-relaxed">{f}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const DEMOS = [
  { key: "chat", label: "Chat", icon: MessageSquare, component: ChatDemo },
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, component: DashboardDemo },
  { key: "agents", label: "AI Agents", icon: Bot, component: AgentsDemo },
  { key: "memory", label: "Memory", icon: Brain, component: MemoryDemo },
];

// ── Section 3: visual process flow, icons only ────────────────────────────────
function ProcessFlow() {
  const steps = [
    { icon: MessageSquare, label: "You ask" },
    { icon: Bot, label: "Agents think" },
    { icon: Brain, label: "Memory recalls" },
    { icon: Zap, label: "Confident answer" },
  ];
  return (
    <div className="flex items-center justify-center gap-2 sm:gap-4 flex-wrap">
      {steps.map((s, i) => (
        <div key={s.label} className="flex items-center gap-2 sm:gap-4">
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-2xl bg-gray-900 border border-violet-500/30 flex items-center justify-center">
              <s.icon size={20} className="text-violet-400" />
            </div>
            <span className="text-[10px] text-gray-500 font-medium">{s.label}</span>
          </div>
          {i < steps.length - 1 && <ArrowRight size={14} className="text-gray-700 flex-shrink-0" />}
        </div>
      ))}
    </div>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const [tab, setTab] = useState("chat");
  const Active = DEMOS.find(d => d.key === tab)?.component || ChatDemo;

  return (
    <div className="relative min-h-screen bg-gray-950 text-white overflow-hidden">
      <LivingBackground mode="auto" />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-gray-800/40 backdrop-blur bg-gray-950/60">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center"><Sparkles size={15} className="text-violet-400" /></div>
          <span className="font-bold text-sm">NeuroFusion AI</span>
        </div>
        <div className="flex gap-2 items-center">
          {user ? (
            <button onClick={() => navigate("/dashboard")} className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white text-sm px-4 py-2 rounded-xl font-medium transition-colors">Open App <ArrowRight size={13} /></button>
          ) : (
            <>
              <Link to="/login" className="text-gray-400 hover:text-white text-sm px-4 py-2 rounded-xl transition-colors">Sign in</Link>
              <Link to="/register" className="bg-violet-600 hover:bg-violet-500 text-white text-sm px-4 py-2 rounded-xl font-medium transition-colors">Get started</Link>
            </>
          )}
        </div>
      </nav>

      {/* Section 1 — Hero */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 pt-16 pb-10 text-center">
        <div className="inline-flex items-center gap-2 bg-violet-600/10 border border-violet-500/20 text-violet-400 text-[11px] font-medium px-3 py-1.5 rounded-full mb-6">
          <Sparkles size={11} /> Memory-Augmented Multi-Agent AI
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-6">
          Your Personal <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-purple-400 to-blue-400">AI Operating System</span>
        </h1>
        <button onClick={() => navigate(user ? "/dashboard" : "/register")}
          className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white font-semibold px-6 py-3 rounded-xl transition-all shadow-lg shadow-violet-900/30">
          {user ? "Open Dashboard" : "Try it free"} <ArrowRight size={15} />
        </button>
      </section>

      {/* Section 2 — Live demo inside a browser-frame mockup */}
      <section className="relative z-10 max-w-lg mx-auto px-6 pb-16">
        <div className="flex gap-1 bg-gray-900/60 backdrop-blur border border-gray-800 rounded-xl p-1 mb-3">
          {DEMOS.map(d => (
            <button key={d.key} onClick={() => setTab(d.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-medium transition-colors ${tab === d.key ? "bg-violet-600 text-white" : "text-gray-500 hover:text-gray-300"}`}>
              <d.icon size={12} /> {d.label}
            </button>
          ))}
        </div>
        {/* Browser-chrome frame for a polished, presentational look */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl shadow-violet-950/20">
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-gray-800 bg-gray-950/40">
            <span className="w-2 h-2 rounded-full bg-red-500/60" />
            <span className="w-2 h-2 rounded-full bg-yellow-500/60" />
            <span className="w-2 h-2 rounded-full bg-green-500/60" />
            <span className="text-[9px] text-gray-600 ml-2">neurofusion.ai</span>
          </div>
          <Active />
        </div>
      </section>

      {/* Section 3 — Visual process flow, icons only, no paragraphs */}
      <section className="relative z-10 max-w-3xl mx-auto px-6 pb-16">
        <ProcessFlow />
      </section>

      {/* Section 4 — Final CTA banner */}
      <section className="relative z-10 max-w-3xl mx-auto px-6 pb-16">
        <div className="bg-gradient-to-r from-violet-600/20 via-purple-600/15 to-blue-600/20 border border-violet-500/20 rounded-3xl p-8 text-center backdrop-blur">
          <AIAvatar size={44} mode="auto" />
          <h2 className="text-xl font-bold text-white mt-4 mb-5">Ready when you are.</h2>
          <button onClick={() => navigate(user ? "/dashboard" : "/register")}
            className="inline-flex items-center gap-2 bg-white hover:bg-gray-200 text-gray-950 font-semibold px-6 py-3 rounded-xl transition-colors">
            {user ? "Open Dashboard" : "Get started free"} <ArrowRight size={15} />
          </button>
        </div>
      </section>

      <footer className="relative z-10 border-t border-gray-800/40 px-6 py-4 text-center text-gray-700 text-xs">
        NeuroFusion AI
      </footer>
    </div>
  );
}
