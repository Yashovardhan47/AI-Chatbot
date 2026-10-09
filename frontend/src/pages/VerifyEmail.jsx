import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { authAPI } from "../services/api";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

export default function VerifyEmail() {
  const { token } = useParams();
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    authAPI.verifyEmail(token)
      .then(({ data }) => { setStatus("ok"); setMessage(data.message || "Email verified!"); })
      .catch(err => { setStatus("err"); setMessage(err.response?.data?.detail || "Invalid or expired link"); });
  }, [token]);

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 max-w-sm w-full text-center">
        {status === "loading" && <><Loader2 size={40} className="mx-auto mb-4 text-violet-400 animate-spin" /><p className="text-gray-400">Verifying…</p></>}
        {status === "ok" && (
          <>
            <CheckCircle size={48} className="mx-auto mb-4 text-green-400" />
            <h1 className="text-white font-bold text-lg mb-2">Email Verified!</h1>
            <p className="text-gray-400 text-sm mb-6">{message}</p>
            <Link to="/login" className="inline-block bg-violet-600 hover:bg-violet-500 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors">Sign in now</Link>
          </>
        )}
        {status === "err" && (
          <>
            <XCircle size={48} className="mx-auto mb-4 text-red-400" />
            <h1 className="text-white font-bold text-lg mb-2">Verification Failed</h1>
            <p className="text-gray-400 text-sm mb-6">{message}</p>
            <Link to="/login" className="text-violet-400 text-sm hover:text-violet-300">Go to login →</Link>
          </>
        )}
      </div>
    </div>
  );
}
