import KineticText from "../motion/KineticText";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Check, Inbox, MousePointer2, Sparkles } from "lucide-react";
import useAuthStore from "../context/authStore";
import { userAPI } from "../services/api";
import { safeDestination } from "../services/routing";
const policies = [
  ["review", Inbox, "Review first", "Proposed facts wait in your inbox. Only approved facts enter recall.", "Recommended"],
  ["automatic", Sparkles, "Capture as we talk", "Save grounded facts from your messages automatically. Inspect or remove them later.", ""],
  ["manual", MousePointer2, "Only when I ask", "Use Remember… in chat or save facts yourself in Memory Studio.", ""],
];
export default function SetupPage() {
  const { user, updateUser } = useAuthStore();
  const [policy, setPolicy] = useState("review"), [goal, setGoal] = useState(user?.preferences?.workspace_goal || "");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const navigate = useNavigate(), location = useLocation();
  async function finish(event) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const { data } = await userAPI.updatePrefs({ onboarding_completed: true, workspace_goal: goal.trim(), memory_enabled: true,
        memory_review_required: policy === "review", memory_auto_capture: policy !== "manual",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" });
      updateUser({ preferences: data.preferences });
      navigate(safeDestination(new URLSearchParams(location.search).get("next")), { replace: true });
    } catch { setError("We couldn't save your choices. Please try again."); }
    finally { setBusy(false); }
  }
  return <main className="ns-setup"><span className="ns-eyebrow">LET'S MAKE THIS YOURS · FIRST-TIME SETUP</span><h1><KineticText>A lasting memory.<br /><em>On your terms.</em></KineticText></h1><p>Choose how context carries forward. You can change this in Settings at any time.</p>
    <form onSubmit={finish}><label className="ns-field-label" htmlFor="workspace-goal">What are you working toward? <span>Optional</span></label><input id="workspace-goal" value={goal} maxLength={160} onChange={event => setGoal(event.target.value)} placeholder="A research project, a product, a new skill…" />
      <fieldset><legend>How should NeuroSense remember?</legend><div className="ns-policy-grid">{policies.map(([value, Icon, title, description, badge]) => <label key={value} className={`ns-policy-choice ${policy === value ? "selected" : ""}`}><input type="radio" name="memory-policy" value={value} checked={policy === value} onChange={() => setPolicy(value)} /><span className="ns-policy-top"><Icon size={23} />{policy === value && <Check size={17} />}</span><strong>{title}</strong>{badge && <small>{badge}</small>}<p>{description}</p></label>)}</div></fieldset>
      <p className="ns-setup-note">Private turns skip memory recall and capture. Conversation transcripts are still saved in your account.</p>
      {error && <p role="alert" className="ns-inline-error">{error}</p>}
      <button className="ns-primary" disabled={busy}>{busy ? "Saving your choices…" : "Open my workspace"}<ArrowRight size={17} /></button>
    </form>
  </main>;
}
