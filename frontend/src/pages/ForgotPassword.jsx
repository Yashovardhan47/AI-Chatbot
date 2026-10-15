import { useState } from "react";
import { Link } from "react-router-dom";
import { authAPI } from "../services/api";
import { CheckCircle, Loader2 } from "lucide-react";
import AuthLayout from "../components/AuthLayout";

export default function ForgotPassword() {
  const [email, setEmail] = useState(""), [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false), [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault(); setLoading(true); setError("");
    try { await authAPI.forgotPw({ email }); setSent(true); }
    catch { setError("We couldn't send the link. Please try again."); }
    finally { setLoading(false); }
  }
  return <AuthLayout title="Find your way back." description="Enter your email to request a password reset link.">
    {sent ? <div role="status" className="ns-auth-notice"><CheckCircle size={24} /><p>Check your inbox. If an account uses this address, a reset link is on its way.</p></div> :
      <form onSubmit={submit} aria-busy={loading}><label htmlFor="recovery-email">Email address</label><input id="recovery-email" type="email" value={email} onChange={event => setEmail(event.target.value)} required autoComplete="email" placeholder="you@example.com" />
        {error && <p className="ns-auth-error" role="alert">{error}</p>}<button className="ns-primary" disabled={loading}>{loading ? <><Loader2 size={16} className="animate-spin" />Sending…</> : "Send reset link"}</button>
      </form>}
    <p className="ns-auth-switch"><Link to="/login">Back to sign in</Link></p>
  </AuthLayout>;
}
