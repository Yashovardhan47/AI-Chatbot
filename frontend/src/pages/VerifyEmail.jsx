import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { authAPI } from "../services/api";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import AuthLayout from "../components/AuthLayout";

const verifications = new Map();
function verifyOnce(token) {
  if (!verifications.has(token)) {
    verifications.set(token, authAPI.verifyEmail(token).finally(() => verifications.delete(token)));
  }
  return verifications.get(token);
}

export default function VerifyEmail() {
  const { token } = useParams();
  const [status, setStatus] = useState("loading"), [message, setMessage] = useState("");
  const [email, setEmail] = useState(""), [sending, setSending] = useState(false), [notice, setNotice] = useState("");
  useEffect(() => {
    let current = true;
    verifyOnce(token)
      .then(({ data }) => { if (current) { setStatus("ok"); setMessage(data.message || "Your email is verified."); } })
      .catch(err => { if (current) { setStatus("err"); setMessage(err.response?.data?.detail || "This verification link is invalid or has expired."); } });
    return () => { current = false; };
  }, [token]);
  async function resend(event) {
    event.preventDefault(); setSending(true); setNotice("");
    try { const { data } = await authAPI.resendVerification(email.trim()); setNotice(data.message); }
    catch { setNotice("We couldn't send a new link. Check your connection and try again."); }
    finally { setSending(false); }
  }
  return <AuthLayout title={status === "ok" ? "You're all set." : status === "err" ? "Let's try that again." : "One final check."} description="Confirming the email address for your workspace.">
    <div className="ns-auth-notice" role={status === "err" ? "alert" : "status"}>{status === "loading" ? <><Loader2 size={25} className="animate-spin" /><p>Verifying your email…</p></> : <>{status === "ok" ? <CheckCircle size={25} /> : <XCircle size={25} />}<p>{message}</p></>}</div>
    {status === "err" && <form onSubmit={resend} aria-busy={sending}>
      <label htmlFor="verification-email">Account email address</label>
      <input id="verification-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required />
      <button className="ns-primary" disabled={sending}>{sending ? "Sending…" : "Send a new verification link"}</button>
      {notice && <p role="status">{notice}</p>}
    </form>}
    {status !== "loading" && <Link className="ns-primary" to="/login">Continue to sign in</Link>}
  </AuthLayout>;
}
