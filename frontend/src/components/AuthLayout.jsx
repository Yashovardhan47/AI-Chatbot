import { Link } from "react-router-dom";
import { Brain, CheckCircle2, ShieldCheck } from "lucide-react";
import { Brand } from "./AppShell";
import ConnectionSettings from "./ConnectionSettings";

export default function AuthLayout({ title, description, children }) {
  return <div className="ns-auth-page">
    <aside className="ns-auth-story">
      <Link to="/"><Brand light /></Link>
      <div><span className="ns-eyebrow">LESS REPEATING. MORE CONTINUITY.</span>
        <h1>Pick up the thread.<br /><em>Keep the context.</em></h1>
        <p>A workspace for the ideas you keep coming back to. Grounded memories, connected sources and conversations that move forward.</p>
        <div className="ns-auth-evidence"><span><Brain size={16} />A memory you can inspect · example</span>
          <blockquote>“I prefer explanations with exact source citations.”</blockquote>
          <div><CheckCircle2 size={14} />Your words · your decision · your history</div>
        </div>
      </div>
      <footer><ShieldCheck size={15} />Choose what to remember. Change it as you grow.</footer>
    </aside>
    <main className="ns-auth-form-area">
      <div className="ns-auth-mobile-brand"><Link to="/"><Brand /></Link></div>
      <section className="ns-auth-form"><span className="ns-eyebrow">YOUR LASTING AI WORKSPACE</span>
        <h2>{title}</h2><p>{description}</p>{children}
        <div className="ns-auth-foot"><Link to="/">← Project overview</Link><ConnectionSettings compact /></div>
      </section>
    </main>
  </div>;
}
