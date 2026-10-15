import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { authAPI } from "../services/api";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import AuthLayout from "../components/AuthLayout";

export default function VerifyEmail() {
  const { token } = useParams();
  const [status, setStatus] = useState("loading"), [message, setMessage] = useState("");
  useEffect(() => {
    let current = true;
    authAPI.verifyEmail(token)
      .then(({ data }) => { if (current) { setStatus("ok"); setMessage(data.message || "Your email is verified."); } })
      .catch(err => { if (current) { setStatus("err"); setMessage(err.response?.data?.detail || "This verification link is invalid or has expired."); } });
    return () => { current = false; };
  }, [token]);
  return <AuthLayout title={status === "ok" ? "You're all set." : status === "err" ? "Let's try that again." : "One final check."} description="Confirming the email address for your workspace.">
    <div className="ns-auth-notice" role={status === "err" ? "alert" : "status"}>{status === "loading" ? <><Loader2 size={25} className="animate-spin" /><p>Verifying your email…</p></> : <>{status === "ok" ? <CheckCircle size={25} /> : <XCircle size={25} />}<p>{message}</p></>}</div>
    {status !== "loading" && <Link className="ns-primary" to="/login">Continue to sign in</Link>}
  </AuthLayout>;
}
