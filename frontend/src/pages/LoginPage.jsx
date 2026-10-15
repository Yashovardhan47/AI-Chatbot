import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import AuthLayout from "../components/AuthLayout";
import GoogleButton from "../components/GoogleButton";
import useAuthStore from "../context/authStore";
import { safeDestination } from "../services/routing";

export default function LoginPage() {
  const [email, setEmail] = useState(""), [password, setPassword] = useState("");
  const [show, setShow] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const { login, sessionError } = useAuthStore();
  const navigate = useNavigate(), location = useLocation();
  const destination = safeDestination(new URLSearchParams(location.search).get("next"));
  const complete = () => navigate(destination, { replace: true });
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError("");
    try { await login(email.trim(), password); complete(); }
    catch (error) { setError(error.response?.data?.detail || "Sign-in could not complete. Check your connection and try again."); }
    finally { setBusy(false); }
  }
  return <AuthLayout title="Welcome back." description="Sign in to continue with your own context.">
    <GoogleButton onSuccess={complete} />
    <div className="ns-auth-divider"><span>or continue with email</span></div>
    <form onSubmit={submit} aria-busy={busy}>
      <label htmlFor="auth-email">Email address</label>
      <input id="auth-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required placeholder="you@example.com" />
      <div className="ns-label-row"><label htmlFor="auth-password">Password</label><Link to="/forgot-password">Forgot password?</Link></div>
      <div className="ns-password-field"><input id="auth-password" type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required maxLength={1024} />
        <button type="button" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow(value => !value)}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
      {(error || sessionError) && <p role="alert" className="ns-auth-error">{error || sessionError}</p>}
      <button disabled={busy} className="ns-primary">{busy ? "Signing in…" : "Sign in"}<ArrowRight size={16} /></button>
    </form>
    <p className="ns-auth-switch">New here? <Link to={"/register?next=" + encodeURIComponent(destination)}>Create an account</Link></p>
  </AuthLayout>;
}
