import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useMotion } from "./MotionProvider";

const surfaces = ".nx-feature-bento>a,.ns-thread-card,.ns-home-metrics>a,.ns-metric,.ns-tour-tiles>button";
const entrances = ".nx-section-title,.nx-feature-bento>a,.nx-control-rules article,.nx-final-cta,.ns-panel,.ns-ask-card,.ns-inbox-card,.ns-thread-card,.ns-metric,.ns-home-metrics>a,.ns-policy-choice,.ns-proposal-card,.ns-device-panel,[data-motion-card]";
function pageRoot() {
  return document.querySelector(".ns-page-content,.ns-auth-form-area,.nx-presentation>main,.ns-tour,[data-route-page]");
}
export default function MotionDirector() {
  const { pathname } = useLocation();
  const { effective } = useMotion();
  const previousPath = useRef(pathname);
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    let disposed = false, queued = 0, routeEntered = false, lastTitle = "";
    const changedRoute = previousPath.current !== pathname;
    previousPath.current = pathname;
    const seen = new WeakSet(), animations = new Set(), touched = new Set();
    const duration = effective === "expressive" ? 520 : 230;
    function animate(node, frames, options = {}) {
      if (disposed || effective === "off" || !node.animate || document.hidden) return;
      const animation = node.animate(frames, { duration, fill: "backwards", easing: "cubic-bezier(.22,1,.36,1)", ...options });
      animations.add(animation);
      if (animation.finished) animation.finished.catch(() => {}).finally(() => animations.delete(animation));
    }
    const intersection = effective !== "off" && typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(entries => {
      if (disposed) return;
      let order = 0;
      for (const entry of entries) {
        if (!entry.isIntersecting || seen.has(entry.target)) continue;
        seen.add(entry.target); intersection.unobserve(entry.target);
        animate(entry.target, effective === "expressive" ? [{ opacity: 0, transform: "translateY(18px) scale(.985)" }, { opacity: 1, transform: "none" }] : [{ opacity: .35 }, { opacity: 1 }], { delay: Math.min(order++ * 45, 180) });
      }
    }, { threshold: .04, rootMargin: "0px 0px -12px 0px" }) : null;
    const observed = new WeakSet();
    function scan() {
      queued = 0; if (disposed) return;
      const root = pageRoot(); if (!root) return;
      const title = root.querySelector("h1,h2");
      if (title) {
        const text = (title.innerText || title.textContent).replace(/\s+/g, " ").trim();
        if (text !== lastTitle) { document.title = `${text.slice(0, 95)} · NeuroSense`; setAnnouncement(text); lastTitle = text; }
      }
      if (title && !routeEntered) {
        routeEntered = true;
        // Opacity preserves the positioning of fixed dialogs and the live chat.
        animate(root, [{ opacity: .4 }, { opacity: 1 }], { duration: effective === "expressive" ? 340 : 160 });
        if (changedRoute) {
          document.documentElement.scrollTop = 0; document.body.scrollTop = 0;
          if (!document.activeElement?.matches("input,textarea,select")) { title.setAttribute("tabindex", "-1"); title.focus({ preventScroll: true }); }
        }
      }
      if (!intersection) return;
      root.querySelectorAll(entrances).forEach(node => {
        if (observed.has(node) || node.closest('[role="dialog"]') || node.querySelector('[role="dialog"],.fixed')) return;
        observed.add(node); intersection.observe(node);
      });
    }
    function schedule(records) {
      // Streaming HTML updates are handled by the message's one-time entrance.
      if (records?.length && records.every(record => record.target instanceof Element && record.target.closest(".ns-message"))) return;
      if (!queued) queued = requestAnimationFrame(scan);
    }
    const mutations = typeof MutationObserver !== "undefined" ? new MutationObserver(schedule) : null;
    mutations?.observe(document.body, { childList: true, subtree: true });
    schedule();
    let pointerFrame = 0, lastSurface;
    const finePointer = window.matchMedia?.("(pointer: fine)").matches;
    function resetSurface(node) {
      if (!node) return;
      ["--surface-x", "--surface-y", "--surface-rx", "--surface-ry"].forEach(property => node.style.removeProperty(property));
      node.removeAttribute("data-surface-active");
    }
    function move(event) {
      if (effective !== "expressive" || !finePointer) return;
      const node = event.target.closest?.(surfaces);
      if (lastSurface && node !== lastSurface) resetSurface(lastSurface);
      lastSurface = node;
      if (!node || pointerFrame) return;
      const { clientX, clientY } = event;
      pointerFrame = requestAnimationFrame(() => {
        pointerFrame = 0; if (disposed || !node.isConnected || lastSurface !== node) return;
        const rect = node.getBoundingClientRect(); if (!rect.width || !rect.height) return;
        const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)), y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
        node.style.setProperty("--surface-x", `${x * 100}%`); node.style.setProperty("--surface-y", `${y * 100}%`);
        node.style.setProperty("--surface-rx", `${(y - .5) * -2.8}deg`); node.style.setProperty("--surface-ry", `${(x - .5) * 2.8}deg`);
        node.dataset.surfaceActive = "true"; touched.add(node);
      });
    }
    function leave(event) { if (lastSurface && (!(event.relatedTarget instanceof Node) || !lastSurface.contains(event.relatedTarget))) { resetSurface(lastSurface); lastSurface = null; } }
    document.addEventListener("pointermove", move, { passive: true }); document.addEventListener("pointerout", leave, { passive: true });
    return () => {
      disposed = true; mutations?.disconnect(); intersection?.disconnect(); cancelAnimationFrame(queued); cancelAnimationFrame(pointerFrame);
      animations.forEach(animation => animation.cancel()); touched.forEach(resetSurface);
      document.removeEventListener("pointermove", move); document.removeEventListener("pointerout", leave);
    };
  }, [pathname, effective]);
  return <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>;
}
