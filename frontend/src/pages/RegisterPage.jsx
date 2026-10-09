import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Sparkles, User, Mail, Lock, AlertCircle, CheckCircle } from "lucide-react";
import { useForm } from "../hooks/useForm";
import { authAPI } from "../services/api";
import GoogleButton from "../components/GoogleButton";
import toast from "react-hot-toast";

export default function RegisterPage() {
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const navigate = useNavigate();
  const { values, onChange } = useForm({ name: "", email: "", password: "" });

  const len = values.password.length;
  const strength = len === 0 ? 0 : len < 4 ? 1 : len < 8 ? 2 : len < 12 ? 3 : 4;
  const strengthLabel = ["", "Very short", "Short", "Good", "Strong"][strength];
  const strengthColor = ["", "bg-red-500", "bg-orange-500", "bg-blue-500", "bg-green-500"][strength];

  async function submit(e) {
    e.preventDefault();
    setError(""); setSuccess("");
    if (!values.name.trim())  { setError("Please enter your name"); return; }
    if (!values.email.trim()) { setError("Please enter your email"); return; }
    if (!values.password)     { setError("Please enter a password"); return; }
    setLoading(true);
    try {
      const { data } = await authAPI.register(values);
      setSuccess(data.message || "Account created! Redirecting to login…");
      toast.success("Account created!");
      setTimeout(() => navigate("/login", { replace: true }), 2200);
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || "Registration failed";
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
          <h1 className="text-2xl font-bold text-white">Create account</h1>
          <p className="text-gray-400 mt-1 text-sm">Join NeuroFusion AI — free forever</p>
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
            {success && (
              <div className="flex items-start gap-2 bg-green-500/10 border border-green-500/30 rounded-xl p-3">
                <CheckCircle size={15} className="text-green-400 mt-0.5 flex-shrink-0" />
                <p className="text-green-400 text-sm leading-relaxed">{success}</p>
              </div>
            )}

            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Full name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={15} />
                <input name="name" type="text" value={values.name} onChange={onChange} required placeholder="Your name" autoComplete="name"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-10 pr-4 py-2.5 text-white text-sm outline-none focus:border-violet-500 transition-colors" />
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={15} />
                <input name="email" type="email" value={values.email} onChange={onChange} required placeholder="you@example.com" autoComplete="email"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-10 pr-4 py-2.5 text-white text-sm outline-none focus:border-violet-500 transition-colors" />
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={15} />
                <input name="password" type={showPw ? "text" : "password"} value={values.password} onChange={onChange} required placeholder="Choose a password" autoComplete="new-password"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-10 pr-10 py-2.5 text-white text-sm outline-none focus:border-violet-500 transition-colors" />
                <button type="button" onClick={() => setShowPw(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors">
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {values.password.length > 0 && (
                <div className="mt-2">
                  <div className="flex gap-1 mb-1">
                    {[1,2,3,4].map(i => <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= strength ? strengthColor : "bg-gray-700"}`} />)}
                  </div>
                  <p className={`text-[11px] ${["","text-red-400","text-orange-400","text-blue-400","text-green-400"][strength]}`}>{strengthLabel}</p>
                </div>
              )}
            </div>

            <button type="submit" disabled={loading || !!success}
              className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2">
              {loading ? <><div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Creating…</> : "Create account"}
            </button>
          </form>
        </div>

        <p className="text-center text-gray-500 text-sm mt-4">Already have an account? <Link to="/login" className="text-violet-400 hover:text-violet-300">Sign in</Link></p>
        <p className="text-center mt-2"><Link to="/" className="text-xs text-gray-600 hover:text-gray-400 transition-colors">← Back to home</Link></p>
      </div>
    </div>
  );
}
