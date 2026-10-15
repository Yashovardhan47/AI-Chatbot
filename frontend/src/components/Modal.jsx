import { useEffect, useRef } from "react";

export default function Modal({ titleId, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const elements = () => [...ref.current.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]')];
    (elements()[0] || ref.current).focus();
    function keydown(event) {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const targets = elements(), first = targets[0], last = targets.at(-1);
      if (!first) { event.preventDefault(); ref.current.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, [onClose]);
  return <div className="ns-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="ns-confirm-modal" ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId}>{children}</section></div>;
}
