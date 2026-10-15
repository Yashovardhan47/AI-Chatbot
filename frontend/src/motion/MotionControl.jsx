import { useEffect, useId, useRef, useState } from "react";
import { Check, SlidersHorizontal, X } from "lucide-react";
import { useMotion } from "./MotionProvider";
const options = [["expressive", "Expressive", "Full page, heading and surface motion."], ["subtle", "Subtle", "Gentle transitions and interaction feedback."], ["off", "Off", "Keep the interface still."]];
export default function MotionControl() {
  const { mode, setMode, reduced } = useMotion();
  const [open, setOpen] = useState(false);
  const root = useRef(null), trigger = useRef(null), id = useId();
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector('input:checked')?.focus();
    const pointer = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    const key = event => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", pointer); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", pointer); document.removeEventListener("keydown", key); };
  }, [open]);
  return <div className="ns-motion-control" ref={root}><button type="button" ref={trigger} aria-label="Motion preferences" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}><SlidersHorizontal size={17} /></button>
    {open && <section id={id} role="dialog" aria-label="Motion preferences" className="ns-motion-popover"><header><span>Make it feel like you.</span><button aria-label="Close motion preferences" onClick={() => { setOpen(false); trigger.current?.focus(); }}><X size={15} /></button></header><fieldset><legend>Motion intensity</legend>{options.map(([value, label, description]) => <label key={value}><input type="radio" name={id} value={value} checked={mode === value} onChange={() => setMode(value)} /><span><strong>{label}</strong><small>{description}</small></span>{mode === value && <Check size={15} />}</label>)}</fieldset>{reduced && <p role="status">Your device requests reduced motion. Motion stays off while that preference is active.</p>}</section>}
  </div>;
}
