import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Sparkles, Mail, Lock, AlertCircle } from "lucide-react";
import { useForm } from "../hooks/useForm";
import useAuthStore from "../context/authStore";
import GoogleButton from "../components/GoogleButton";
import toast from "react-hot-toast";

export default function LoginPage() {
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const login = useAuthStore(s => s.login);
  const navigate = useNavigate();
  const { values, onChange } = useForm({ email: "", password: "" });

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(values.email, values.password);
      toast.success("Welcome back!");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || "Login failed. Check your email and password.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-violet-600/20 border border-violet-500/30 mb-4">
            <Sparkles className="text-violet-400" size={28} />
          </div>
          <h1 className="text-2xl font-bold text-white">Welcome back</h1>
          <p className="text-gray-400 mt-1 text-sm">Sign in to NeuroFusion AI</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
          <GoogleButton onSuccess={() => navigate("/dashboard", { replace: true })} />

          <div className="flex items-center gap-3 py-1">
            <div className="flex-1 h-px bg-gray-800" />
            <span className="text-[11px] text-gray-600">OR</span>
            <div className="flex-1 h-px bg-gray-800" />
          </div>

          <form onSubmit={submit} className="space-y-4">
            {error && (
              <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                <AlertCircle size={15} className="text-red-400 mt-0.5 flex-shrink-0" />
                <p className="text-red-400 text-sm leading-relaxed">{error}</p>
              </div>
            )}

            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={15} />
                <input name="email" type="email" value={values.email} onChange={onChange} required placeholder="you@example.com" autoComplete="email"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-10 pr-4 py-2.5 text-white text-sm outline-none focus:border-violet-500 transition-colors" />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-sm text-gray-400">Password</label>
                <Link to="/forgot-password" className="text-xs text-violet-400 hover:text-violet-300">Forgot?</Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={15} />
                <input name="password" type={showPw ? "text" : "password"} value={values.password} onChange={onChange} required placeholder="Your password" autoComplete="current-password"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-10 pr-10 py-2.5 text-white text-sm outline-none focus:border-violet-500 transition-colors" />
                <button type="button" onClick={() => setShowPw(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors">
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2">
              {loading ? <><div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Signing in…</> : "Sign in"}
            </button>
          </form>
        </div>

        <p className="text-center text-gray-500 text-sm mt-4">No account? <Link to="/register" className="text-violet-400 hover:text-violet-300">Create one free</Link></p>
        <p className="text-center mt-2"><Link to="/" className="text-xs text-gray-600 hover:text-gray-400 transition-colors">← Back to home</Link></p>
      </div>
    </div>
  );
}
