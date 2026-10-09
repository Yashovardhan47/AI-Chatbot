import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Settings, Lock, Palette, Globe, Volume2, Save } from "lucide-react";
import toast from "react-hot-toast";
import useAuthStore from "../context/authStore";
import { userAPI } from "../services/api";

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [mode, setMode] = useState(user?.preferences?.mode || "auto");
  const [webSearch, setWebSearch] = useState(user?.preferences?.web_search || false);
  const [ttsEnabled, setTtsEnabled] = useState(user?.preferences?.tts_enabled || false);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [changingPw, setChangingPw] = useState(false);

  async function savePreferences() {
    setSavingPrefs(true);
    try {
      await userAPI.updatePrefs({ mode, web_search: webSearch, tts_enabled: ttsEnabled });
      toast.success("Preferences saved");
    } catch { toast.error("Failed to save"); }
    finally { setSavingPrefs(false); }
  }

  async function changePassword(e) {
    e.preventDefault();
    if (!currentPw || !newPw) { toast.error("Fill in both password fields"); return; }
    setChangingPw(true);
    try {
      await userAPI.changePw({ current_password: currentPw, new_password: newPw });
      toast.success("Password changed successfully");
      setCurrentPw(""); setNewPw("");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to change password");
    } finally { setChangingPw(false); }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"><ArrowLeft size={17} /></button>
          <div className="flex items-center gap-2"><Settings size={18} className="text-violet-400" /><h1 className="text-lg font-bold">Settings</h1></div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-4">
          <h2 className="text-sm font-semibold mb-4 flex items-center gap-2"><Palette size={14} className="text-violet-400" /> Preferences</h2>

          <div className="mb-4">
            <label className="block text-xs text-gray-400 mb-2">Default AI mode</label>
            <div className="grid grid-cols-3 gap-2">
              {["auto","friend","teacher","researcher","coder","mentor"].map(m => (
                <button key={m} onClick={() => setMode(m)} className={`text-xs py-2 rounded-lg font-medium capitalize transition-colors ${mode === m ? "bg-violet-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>{m}</button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between py-2.5 border-t border-gray-800">
            <div className="flex items-center gap-2"><Globe size={14} className="text-gray-500" /><span className="text-sm text-gray-300">Web search by default</span></div>
            <button onClick={() => setWebSearch(w => !w)} className={`w-10 rounded-full transition-colors relative ${webSearch ? "bg-violet-600" : "bg-gray-700"}`} style={{height: "22px"}}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${webSearch ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>

          <div className="flex items-center justify-between py-2.5 border-t border-gray-800">
            <div className="flex items-center gap-2"><Volume2 size={14} className="text-gray-500" /><span className="text-sm text-gray-300">Text-to-speech enabled</span></div>
            <button onClick={() => setTtsEnabled(t => !t)} className={`w-10 rounded-full transition-colors relative ${ttsEnabled ? "bg-violet-600" : "bg-gray-700"}`} style={{height: "22px"}}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${ttsEnabled ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>

          <button onClick={savePreferences} disabled={savingPrefs} className="mt-4 flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors">
            <Save size={13} /> {savingPrefs ? "Saving…" : "Save preferences"}
          </button>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <h2 className="text-sm font-semibold mb-4 flex items-center gap-2"><Lock size={14} className="text-violet-400" /> Change password</h2>
          <form onSubmit={changePassword} className="space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Current password</label>
              <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} autoComplete="current-password"
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500 transition-colors" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">New password</label>
              <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} autoComplete="new-password" placeholder="Choose a new password"
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500 transition-colors" />
            </div>
            <button type="submit" disabled={changingPw} className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors">
              {changingPw ? "Updating…" : "Update password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
