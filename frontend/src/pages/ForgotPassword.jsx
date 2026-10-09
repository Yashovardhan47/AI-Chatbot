import { useState } from "react";
import { Link } from "react-router-dom";
import { authAPI } from "../services/api";
import { Mail, Sparkles, CheckCircle } from "lucide-react";
import toast from "react-hot-toast";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try { await authAPI.forgotPw({ email }); setSent(true); toast.success("Reset link sent!"); }
    catch { toast.error("Failed to send. Try again."); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-violet-600/20 border border-violet-500/30 mb-4"><Sparkles className="text-violet-400" size={28} /></div>
          <h1 className="text-2xl font-bold text-white">Forgot password</h1>
          <p className="text-gray-400 mt-1 text-sm">Enter your email to receive a reset link</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          {sent ? (
            <div className="text-center">
              <CheckCircle size={40} className="mx-auto mb-3 text-green-400" />
              <p className="text-green-400 text-sm font-medium mb-1">Reset link sent!</p>
              <p className="text-gray-500 text-xs">Check your email. In dev mode, check the backend terminal.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="your@email.com" autoComplete="email"
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-10 pr-4 py-2.5 text-white text-sm outline-none focus:border-violet-500 transition-colors" />
                </div>
              </div>
              <button type="submit" disabled={loading} className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
                {loading ? <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : "Send reset link"}
              </button>
            </form>
          )}
        </div>
        <p className="text-center text-gray-500 text-sm mt-4"><Link to="/login" className="text-violet-400 hover:text-violet-300">← Back to login</Link></p>
      </div>
    </div>
  );
}
