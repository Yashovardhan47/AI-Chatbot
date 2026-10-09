import { useEffect, useRef, useState } from "react";
import useAuthStore from "../context/authStore";
import toast from "react-hot-toast";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

/* Renders Google's official "Sign in with Google" button using the
   Google Identity Services script loaded in index.html. Falls back to
   a disabled hint if no client ID is configured. */
export default function GoogleButton({ onSuccess }) {
  const ref = useRef(null);
  const googleLogin = useAuthStore(s => s.googleLogin);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!CLIENT_ID) return;

    function init() {
      if (!window.google?.accounts?.id || !ref.current) return;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: async (response) => {
          try {
            await googleLogin(response.credential);
            toast.success("Signed in with Google!");
            onSuccess?.();
          } catch (err) {
            toast.error(err.response?.data?.detail || "Google sign-in failed");
          }
        },
      });
      window.google.accounts.id.renderButton(ref.current, {
        theme: "filled_black", size: "large", width: 320, shape: "pill", text: "continue_with",
      });
      setReady(true);
    }

    if (window.google?.accounts?.id) init();
    else {
      const t = setInterval(() => {
        if (window.google?.accounts?.id) { clearInterval(t); init(); }
      }, 200);
      return () => clearInterval(t);
    }
  }, []);

  if (!CLIENT_ID) {
    return (
      <div className="w-full text-center text-[11px] text-gray-600 border border-dashed border-gray-800 rounded-xl py-2.5">
        Google sign-in not configured — add VITE_GOOGLE_CLIENT_ID to frontend/.env
      </div>
    );
  }

  return <div ref={ref} className="flex justify-center w-full [&>div]:!w-full" />;
}
