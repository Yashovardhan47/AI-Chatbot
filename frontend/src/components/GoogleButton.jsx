import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import useAuthStore from "../context/authStore";
import { authAPI } from "../services/api";

let scriptPromise;
export function loadGoogleIdentity() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    let script = document.querySelector("script[data-neurosense-google]");
    if (!script) {
      script = document.createElement("script"); script.src = "https://accounts.google.com/gsi/client";
      script.async = true; script.defer = true; script.dataset.neurosenseGoogle = "true";
      document.head.appendChild(script);
    }
    const timer = setTimeout(() => reject(new Error("Google sign-in took too long to load")), 12000);
    script.addEventListener("load", () => {
      clearTimeout(timer);
      window.google?.accounts?.id ? resolve() : reject(new Error("Google identity did not load"));
    }, { once: true });
    script.addEventListener("error", () => { clearTimeout(timer); reject(new Error("Google sign-in could not load")); }, { once: true });
  }).catch(error => {
    scriptPromise = undefined; document.querySelector("script[data-neurosense-google]")?.remove(); throw error;
  });
  return scriptPromise;
}
export function GoogleMark() {
  return <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.03 46.98 31.87 46.98 24.55Z"/><path fill="#FBBC05" d="M10.53 28.59A14.41 14.41 0 0 1 9.78 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.86 23.86 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.97 6.19C6.51 42.62 14.62 48 24 48Z"/></svg>;
}
export default function GoogleButton({ onSuccess, onCredential }) {
  const ref = useRef(null), id = useId();
  const googleLogin = useAuthStore(state => state.googleLogin);
  const handlers = useRef({ onSuccess, onCredential }); handlers.current = { onSuccess, onCredential };
  const signingIn = useRef(false);
  const [status, setStatus] = useState("loading"), [retry, setRetry] = useState(0), [error, setError] = useState("");
  useEffect(() => {
    let active = true; setStatus("loading"); setError(""); ref.current?.replaceChildren();
    async function setup() {
      try {
        const { data } = await authAPI.config(); if (!active) return;
        if (data?.password_login !== true || typeof data.google_enabled !== "boolean") throw new Error("Invalid authentication configuration");
        if (!data.google_enabled || !data.google_client_id) { setStatus("unconfigured"); return; }
        await loadGoogleIdentity(); if (!active || !ref.current) return;
        window.google.accounts.id.initialize({ client_id: data.google_client_id, ux_mode: "popup", auto_select: false, callback: async response => {
          if (!active || signingIn.current) return;
          if (typeof response.credential !== "string" || !response.credential) { setError("Google did not return a sign-in credential. Please try again."); return; }
          signingIn.current = true; setStatus("authenticating"); setError("");
          try {
            const result = await (handlers.current.onCredential ? handlers.current.onCredential(response.credential) : googleLogin(response.credential));
            if (active) handlers.current.onSuccess?.(result);
          } catch (failure) { if (active) setError(typeof failure.response?.data?.detail === "string" ? failure.response.data.detail : "Google sign-in could not complete. Please try again."); }
          finally { signingIn.current = false; if (active) setStatus("ready"); }
        } });
        window.google.accounts.id.renderButton(ref.current, { theme: "outline", size: "large", width: Math.min(ref.current.clientWidth || 360, 360), shape: "pill", text: "continue_with", logo_alignment: "left" });
        setStatus("ready");
      } catch { if (active) setStatus("unavailable"); }
    }
    setup(); return () => { active = false; };
  }, [retry]);
  const ready = status === "ready" || status === "authenticating";
  return <div className="ns-google-area nx-google-area" aria-busy={status === "authenticating" || status === "loading"}>
    <div ref={ref} className={`ns-google-button ${ready ? "" : "nx-google-mount-hidden"}`} />
    {!ready && <button type="button" className="nx-google-placeholder" disabled aria-describedby={id}><GoogleMark /><span>Continue with Google</span></button>}
    <div id={id} className="nx-google-status" aria-live="polite">
      {status === "loading" && <p>Checking Google sign-in availability…</p>}
      {status === "authenticating" && <p>Verifying your Google account…</p>}
      {status === "unconfigured" && <p>Google sign-in is not activated for this installation.</p>}
      {status === "unavailable" && <p>The sign-in service could not be reached. <button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button></p>}
    </div>
    {error && <p role="alert" className="ns-auth-error">{error}</p>}
    {(status === "unconfigured" || status === "unavailable") && <Link className="nx-google-setup-link" to="/auth-setup">View Google sign-in setup →</Link>}
  </div>;
}
