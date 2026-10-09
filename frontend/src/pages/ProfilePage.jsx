import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, User, Mail, Calendar, MessageSquare, Brain, Save } from "lucide-react";
import toast from "react-hot-toast";
import useAuthStore from "../context/authStore";
import { userAPI } from "../services/api";

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, updateUser } = useAuthStore();
  const [name, setName] = useState(user?.name || "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) { toast.error("Name cannot be empty"); return; }
    setSaving(true);
    try {
      await userAPI.updateProfile({ name: name.trim() });
      updateUser({ name: name.trim() });
      toast.success("Profile updated");
    } catch { toast.error("Failed to update"); }
    finally { setSaving(false); }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"><ArrowLeft size={17} /></button>
          <div className="flex items-center gap-2"><User size={18} className="text-violet-400" /><h1 className="text-lg font-bold">Profile</h1></div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-4 text-center">
          <div className="w-20 h-20 rounded-full bg-violet-600/20 border border-violet-500/30 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl font-bold text-violet-400">{user?.name?.[0]?.toUpperCase()}</span>
          </div>
          <div className="max-w-xs mx-auto">
            <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-center text-white text-sm outline-none focus:border-violet-500 transition-colors mb-2" />
            <button onClick={save} disabled={saving} className="flex items-center gap-2 justify-center w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-medium px-4 py-2 rounded-xl transition-colors">
              <Save size={12} /> {saving ? "Saving…" : "Save name"}
            </button>
          </div>
          <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500 mt-4"><Mail size={12} /> {user?.email}</div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <MessageSquare size={16} className="text-violet-400 mx-auto mb-2" />
            <div className="text-lg font-bold text-white">{user?.stats?.total_messages || 0}</div>
            <div className="text-[10px] text-gray-500">Messages</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <Brain size={16} className="text-green-400 mx-auto mb-2" />
            <div className="text-lg font-bold text-white">{user?.stats?.total_sessions || 0}</div>
            <div className="text-[10px] text-gray-500">Sessions</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <Calendar size={16} className="text-blue-400 mx-auto mb-2" />
            <div className="text-xs font-bold text-white">{user?.created_at ? new Date(user.created_at).toLocaleDateString() : "—"}</div>
            <div className="text-[10px] text-gray-500">Member since</div>
          </div>
        </div>
      </div>
    </div>
  );
}
