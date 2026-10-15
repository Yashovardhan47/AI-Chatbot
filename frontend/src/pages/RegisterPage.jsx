import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle2, Eye, EyeOff } from "lucide-react";
import AuthLayout from "../components/AuthLayout";
import GoogleButton from "../components/GoogleButton";
import { authAPI } from "../services/api";
import { safeDestination } from "../services/routing";

export default function RegisterPage() {
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [password, setPassword] = useState("");
  const [show, setShow] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [success, setSuccess] = useState("");
  const navigate = useNavigate(), location = useLocation();
  const destination = safeDestination(new URLSearchParams(location.search).get("next"));
  const signInPath = "/login?next=" + encodeURIComponent(destination);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError("");
    try { const { data } = await authAPI.register({ name: name.trim(), email: email.trim(), password }); setSuccess(data.message); setPassword(""); }
    catch (error) { setError(typeof error.response?.data?.detail === "string" ? error.response.data.detail : "Your account could not be created. Check the connection and try again."); }
    finally { setBusy(false); }
  }
  return <AuthLayout title="Make room for your next idea." description="Create your account. Then choose how NeuroSense remembers.">
    {success ? <div className="ns-registration-complete" role="status"><CheckCircle2 size={32} /><h3>Your account is created.</h3><p>{success}</p><Link className="ns-primary" to={signInPath}>Continue to sign in<ArrowRight size={16} /></Link></div> : <>
      <GoogleButton onSuccess={() => navigate(destination, { replace: true })} />
      <div className="ns-auth-divider"><span>or create an email account</span></div>
      <form onSubmit={submit} aria-busy={busy}>
        <label htmlFor="auth-name">Your name</label><input id="auth-name" autoComplete="name" value={name} onChange={event => setName(event.target.value)} required minLength={2} maxLength={80} placeholder="How should we call you?" />
        <label htmlFor="auth-email">Email address</label><input id="auth-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required placeholder="you@example.com" />
        <label htmlFor="auth-password">Password</label><div className="ns-password-field"><input id="auth-password" type={show ? "text" : "password"} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} required minLength={8} maxLength={1024} placeholder="At least 8 characters" />
          <button type="button" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow(value => !value)}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
        {error && <p role="alert" className="ns-auth-error">{error}</p>}
        <button disabled={busy} className="ns-primary">{busy ? "Creating your account…" : "Create account"}<ArrowRight size={16} /></button>
      </form>
    </>}
    <p className="ns-auth-switch">Already have an account? <Link to={signInPath}>Sign in</Link></p>
  </AuthLayout>;
}
