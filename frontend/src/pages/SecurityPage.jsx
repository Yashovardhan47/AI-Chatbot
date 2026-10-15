import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ShieldCheck, RefreshCw, CheckCircle2, KeyRound, LogOut, ArrowUpRight } from "lucide-react";
import WorkspaceShell from "../components/WorkspaceShell";
import Modal from "../components/Modal";
import GoogleButton from "../components/GoogleButton";
import useAuthStore from "../context/authStore";
import { authAPI, workspaceAPI, refreshAccessToken } from "../services/api";
import { clearSession } from "../services/session";

export default function SecurityPage() {
  const { user, updateUser } = useAuthStore();
  const [session, setSession] = useState(null), [sessions, setSessions] = useState([]), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [linking, setLinking] = useState(false), [password, setPassword] = useState(""), [confirm, setConfirm] = useState(false);
  const navigate = useNavigate();
  async function verify(rotate = false) {
    setBusy(true); setError(""); setSession(null);
    try {
      if (rotate) await refreshAccessToken();
      const [checked, active] = await Promise.all([authAPI.session(), workspaceAPI.sessions()]);
      setSession(checked.data); setSessions(active.data.sessions);
    } catch { setError("Verification could not complete. Check the server connection or sign in again."); }
    finally { setBusy(false); }
  }
  useEffect(() => { verify(); }, []);
  async function revoke() {
    setBusy(true);
    try { await workspaceAPI.revokeAll(); clearSession(); navigate("/login", { replace: true }); }
    catch { setError("Sessions could not be revoked. Please try again."); setBusy(false); }
  }
  const date = value => new Date(value.endsWith("Z") || /[+-]\d\d:\d\d$/.test(value) ? value : value + "Z").toLocaleString();
  return <WorkspaceShell eyebrow="ACCOUNT SECURITY" title="Know how you're signed in." description="Check your current session with the server, manage sign-in methods and revoke access.">
    {error && <p role="alert" className="ns-inline-error">{error}</p>}
    <div className="ns-security-grid"><section className="ns-panel ns-session-card"><div className="ns-panel-heading"><span className="ns-spark"><ShieldCheck size={22} /></span><span className={`ns-session-status ${session ? "verified" : ""}`}>{busy ? "Checking…" : session ? "Server verified" : "Not checked"}</span></div><h2>Your current session</h2><p>The API validates this token's signature, audience, expiry and revocation against your account.</p>
      {session && <dl className="ns-security-facts"><div><dt>Signed in with</dt><dd>{session.sign_in_method === "google" ? "Google" : "Email and password"}</dd></div><div><dt>JWT issuer</dt><dd>{session.issuer}</dd></div><div><dt>JWT audience</dt><dd>{session.audience}</dd></div><div><dt>Access expires</dt><dd>{date(session.expires_at)}</dd></div><div><dt>Refresh cookie</dt><dd>{session.refresh_cookie_active ? "Active · HttpOnly" : "Not available — sign-in may be needed after expiry"}</dd></div><div><dt>Last checked</dt><dd>{date(session.checked_at)}</dd></div></dl>}
      <div className="ns-security-actions"><button className="ns-primary" disabled={busy} onClick={() => verify(false)}><ShieldCheck size={15} />Verify this session</button><button className="ns-secondary" disabled={busy} onClick={() => verify(true)}><RefreshCw size={14} />Rotate & verify</button></div><small>Access tokens stay in this tab's memory. Refresh credentials use a server-managed cookie.</small>
    </section><section className="ns-panel"><div className="ns-panel-heading"><span className="ns-spark"><KeyRound size={22} /></span></div><h2>Sign-in methods</h2><div className="ns-signin-method"><div><strong>Email and password</strong><p>{user?.email}</p></div><span>{user?.auth_methods?.password ? "Enabled" : "Google account"}</span></div><div className="ns-signin-method"><div><strong>Google</strong><p>{user?.auth_methods?.google ? "Linked to your verified Google identity" : "Link Google to this same workspace"}</p></div>{user?.auth_methods?.google && <CheckCircle2 size={18} />}</div>
      {!user?.auth_methods?.google && user?.auth_methods?.password && (!linking ? <button className="ns-secondary" onClick={() => setLinking(true)}>Link Google account<ArrowUpRight size={14} /></button> : <div className="ns-google-link"><label htmlFor="link-password">Confirm your account password</label><input id="link-password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /><p>Then choose the Google account with the same email. This links a sign-in method; it keeps your current session.</p>{password && <GoogleButton onCredential={credential => authAPI.linkGoogle({ credential, current_password: password })} onSuccess={result => { updateUser(result.data.user); setPassword(""); setLinking(false); verify(); }} />}</div>)}
      <Link to="/settings" className="ns-card-footer">Password & memory preferences<ArrowUpRight size={14} /></Link></section></div>
    <section className="ns-panel ns-device-panel"><div><span className="ns-eyebrow">SESSION CONTROL</span><h2>{sessions.length} active refresh {sessions.length === 1 ? "session" : "sessions"}</h2><p>Each browser sign-in or rotation creates a session. Sign out everywhere to revoke all access tokens and cookies.</p></div><button className="ns-secondary" onClick={() => setConfirm(true)} disabled={busy}><LogOut size={15} />Sign out everywhere</button>
      {sessions.length > 0 && <ul>{sessions.slice(0, 5).map(item => <li key={item.id}><span>Created {date(item.created_at)}</span><small>Expires {date(item.expires_at)}</small></li>)}</ul>}
    </section>
    {confirm && <Modal titleId="revoke-title" onClose={() => { if (!busy) setConfirm(false); }}><ShieldCheck size={28} /><h2 id="revoke-title">Sign out on every device?</h2><p>This also ends your current session. Your workspace data stays saved.</p><div><button className="ns-secondary" onClick={() => setConfirm(false)}>Keep sessions</button><button className="ns-danger" disabled={busy} onClick={revoke}>Sign out everywhere</button></div></Modal>}
  </WorkspaceShell>;
}
