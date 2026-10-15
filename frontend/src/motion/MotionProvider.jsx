import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState } from "react";
export const MOTION_KEY = "neurosense.motion";
export const MOTION_MODES = ["expressive", "subtle", "off"];
const defaults = { mode: "expressive", effective: "expressive", reduced: false, setMode: () => {} };
const MotionContext = createContext(defaults);
export const useMotion = () => useContext(MotionContext);
function preference() {
  try { const value = localStorage.getItem(MOTION_KEY); return MOTION_MODES.includes(value) ? value : "expressive"; }
  catch { return "expressive"; }
}
export function MotionProvider({ children }) {
  const [mode, setStoredMode] = useState(preference);
  const [reduced, setReduced] = useState(() => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(!!query?.matches);
    query?.addEventListener?.("change", update);
    const storage = event => { if (event.key === MOTION_KEY || event.key === null) setStoredMode(preference()); };
    window.addEventListener("storage", storage);
    return () => { query?.removeEventListener?.("change", update); window.removeEventListener("storage", storage); };
  }, []);
  const effective = reduced ? "off" : mode;
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.motion = effective;
    return () => { delete root.dataset.motion; };
  }, [effective]);
  const value = useMemo(() => ({ mode, effective, reduced, setMode: next => {
    if (!MOTION_MODES.includes(next)) return;
    setStoredMode(next);
    try { localStorage.setItem(MOTION_KEY, next); } catch { /* tab-only preference if storage is unavailable */ }
  } }), [mode, effective, reduced]);
  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}
