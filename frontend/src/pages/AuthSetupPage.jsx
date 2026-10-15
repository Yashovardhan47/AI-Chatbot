import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ArrowUpRight, Check, CheckCircle2, Circle, Copy, RefreshCw, Server, ShieldCheck } from "lucide-react";
import PublicNav from "../components/PublicNav";
import ConnectionSettings from "../components/ConnectionSettings";
import GoogleButton from "../components/GoogleButton";
import { authAPI } from "../services/api";
import { apiBase } from "../services/runtime";

export default function AuthSetupPage() {
  const [config, setConfig] = useState(null), [status, setStatus] = useState("loading"), [copied, setCopied] = useState(false);
  const navigate = useNavigate();
  const inspect = useCallback(async () => {
    setStatus("loading"); setConfig(null);
    try { const { data } = await authAPI.config(); if (data?.password_login !== true || typeof data.google_enabled !== "boolean") throw new Error("Invalid API"); setConfig(data); setStatus("connected"); }
    catch { setStatus("offline"); }
  }, []);
  useEffect(() => { inspect(); }, [inspect]);
  const configured = status === "connected" && config.google_enabled && !!config.google_client_id;
  async function copyOrigin() { try { await navigator.clipboard.writeText(window.location.origin); setCopied(true); } catch { setCopied(false); } }
  return <div className="nx-presentation nx-auth-setup"><PublicNav /><main className="nx-setup-main"><div className="nx-section-title"><span className="nx-kicker">GOOGLE SIGN-IN / INSTALLATION SETUP</span><h1>Connect once.<br /><em>Continue with Google.</em></h1><p>The Google integration is part of NeuroSense. This page checks whether this installation has the services it needs to complete a real sign-in.</p></div>
    <div className="nx-setup-grid"><section className="nx-setup-checklist"><div className="nx-setup-card-heading"><ShieldCheck size={22} /><h2>Installation status</h2><button aria-label="Recheck configuration" onClick={inspect} disabled={status === "loading"}><RefreshCw size={16} /></button></div>
      <div className={`nx-setup-check ${status === "connected" ? "complete" : ""}`}><span>{status === "connected" ? <CheckCircle2 size={20} /> : <Circle size={20} />}</span><div><h3>1. Connect the Python account service</h3><p>{status === "loading" ? "Checking the authentication endpoint…" : status === "connected" ? "The authentication endpoint is reachable." : "This interface cannot reach a configured NeuroSense authentication service."}</p><code>{apiBase()}</code><ConnectionSettings compact /></div></div>
      <div className={`nx-setup-check ${configured ? "complete" : ""}`}><span>{configured ? <CheckCircle2 size={20} /> : <Circle size={20} />}</span><div><h3>2. Configure the Google web client</h3><p>{configured ? "The server supplies a public Google client ID." : "The server needs the Google OAuth web client ID from your own Google Cloud project."}</p>{configured ? <code>{config.google_client_id}</code> : <code>GOOGLE_CLIENT_ID=your-web-client-id</code>}<a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Open Google Cloud credentials<ArrowUpRight size={12} /></a></div></div>
      <div className="nx-setup-check"><span><Circle size={20} /></span><div><h3>3. Authorize this frontend origin</h3><p>Add this exact origin to the Google web client's authorized JavaScript origins. Its registration is checked by Google during sign-in.</p><div className="nx-origin-copy"><code>{window.location.origin}</code><button aria-label="Copy frontend origin" onClick={copyOrigin}>{copied ? <Check size={15} /> : <Copy size={15} />}</button></div></div></div>
      <div className="nx-setup-check"><span><Circle size={20} /></span><div><h3>4. Finish a live sign-in</h3><p>Choose a Google account, then open Account security to verify the application JWT session, cookie rotation and sign-out.</p><Link to="/login?next=%2Fsecurity">Open the sign-in flow<ArrowRight size={13} /></Link></div></div>
    </section><aside><div className="nx-setup-try"><span className="nx-kicker">THE REAL PROVIDER FLOW</span><h2>Ready when<br />your service is.</h2><p>{configured ? "The configured Google button below can start the provider flow. Successful sign-in opens your account home or first-time setup." : "This control becomes available when the API and Google client are configured. It never issues a sample token."}</p><GoogleButton onSuccess={() => navigate("/home", { replace: true })} /><small>No Google client secret is needed by this ID-token sign-in flow. Keep API keys and signing secrets on the server.</small></div><div className="nx-setup-flow"><Server size={22} /><h3>One coherent account workflow.</h3><p>Google credential → Python verification → NeuroSense JWT session → memory setup → your home.</p><Link to="/tour?view=security">Inspect the account experience<ArrowUpRight size={13} /></Link></div></aside></div>
  </main></div>;
}
