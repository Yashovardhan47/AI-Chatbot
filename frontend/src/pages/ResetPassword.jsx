import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { authAPI } from "../services/api";
import { Loader2 } from "lucide-react";
import AuthLayout from "../components/AuthLayout";
import toast from "react-hot-toast";

export default function ResetPassword() {
  const { token } = useParams(), navigate = useNavigate();
  const [password, setPassword] = useState(""), [loading, setLoading] = useState(false), [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault(); setLoading(true); setError("");
    try { await authAPI.resetPw(token, { password }); toast.success("Password updated. You can now sign in."); navigate("/login"); }
    catch (err) { setError(err.response?.data?.detail || "This reset link may have expired. Please request a new one."); }
    finally { setLoading(false); }
  }
  return <AuthLayout title="A fresh start." description="Choose a new password for your NeuroSense account.">
    <form onSubmit={submit} aria-busy={loading}><label htmlFor="new-password">New password</label><input id="new-password" type="password" value={password} onChange={event => setPassword(event.target.value)} required autoComplete="new-password" placeholder="Choose a new password" />
      {error && <p role="alert" className="ns-auth-error">{error}</p>}<button className="ns-primary" disabled={loading}>{loading ? <><Loader2 size={16} className="animate-spin" />Updating…</> : "Update password"}</button>
    </form>
  </AuthLayout>;
}
