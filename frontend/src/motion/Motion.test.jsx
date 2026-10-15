import React, { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { MOTION_KEY, MotionProvider, useMotion } from "./MotionProvider";
import MotionControl from "./MotionControl";
import MotionDirector from "./MotionDirector";
import KineticText from "./KineticText";

let device;
const originalAnimate = Object.getOwnPropertyDescriptor(Element.prototype, "animate");
const originalHidden = Object.getOwnPropertyDescriptor(document, "hidden");
beforeEach(() => {
  localStorage.clear();
  device = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.stubGlobal("matchMedia", vi.fn(query => query.includes("reduced-motion") ? device : { matches: true }));
});
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  if (originalAnimate) Object.defineProperty(Element.prototype, "animate", originalAnimate); else delete Element.prototype.animate;
  if (originalHidden) Object.defineProperty(document, "hidden", originalHidden); else delete document.hidden;
});
function State() { const motion = useMotion(); return <output>{motion.mode}/{motion.effective}</output>; }
function preferences() { return render(<MotionProvider><MotionControl /><State /></MotionProvider>); }

it("restores the chosen motion intensity across page loads", () => {
  localStorage.setItem(MOTION_KEY, "subtle"); preferences();
  expect(document.documentElement.dataset.motion).toBe("subtle");
  expect(screen.getByText("subtle/subtle")).toBeTruthy();
});
it("honors a changing device preference without discarding the user's intensity", async () => {
  preferences(); await userEvent.click(screen.getByRole("button", { name: "Motion preferences" }));
  await userEvent.click(screen.getByRole("radio", { name: /Subtle/ }));
  expect(localStorage.getItem(MOTION_KEY)).toBe("subtle");
  act(() => { device.matches = true; device.addEventListener.mock.calls[0][1](); });
  expect(document.documentElement.dataset.motion).toBe("off");
  expect(screen.getByText(/Your device requests reduced motion/)).toBeTruthy();
  act(() => { device.matches = false; device.addEventListener.mock.calls[0][1](); });
  expect(document.documentElement.dataset.motion).toBe("subtle");
});
it("synchronizes changes from another tab and rejects unknown stored modes", () => {
  preferences();
  act(() => { localStorage.setItem(MOTION_KEY, "off"); window.dispatchEvent(new StorageEvent("storage", { key: MOTION_KEY })); });
  expect(document.documentElement.dataset.motion).toBe("off");
  act(() => { localStorage.setItem(MOTION_KEY, "broken"); window.dispatchEvent(new StorageEvent("storage", { key: MOTION_KEY })); });
  expect(document.documentElement.dataset.motion).toBe("expressive");
});
it("allows a tab-only preference when persistent storage is unavailable", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Blocked"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Blocked"); });
  preferences(); await userEvent.click(screen.getByRole("button", { name: "Motion preferences" }));
  await userEvent.click(screen.getByRole("radio", { name: /Off/ }));
  expect(document.documentElement.dataset.motion).toBe("off");
});
it("supports keyboard dismissal, returns focus and closes on outside interaction", async () => {
  preferences(); const trigger = screen.getByRole("button", { name: "Motion preferences" });
  await userEvent.click(trigger); expect(document.activeElement).toBe(screen.getByRole("radio", { name: /Expressive/ }));
  await userEvent.keyboard("{Escape}"); expect(screen.queryByRole("dialog")).toBeNull(); expect(document.activeElement).toBe(trigger);
  await userEvent.click(trigger); fireEvent.pointerDown(document.body); expect(screen.queryByRole("dialog")).toBeNull();
});
it("keeps readable, copyable semantic text while animating individual words", () => {
  render(<h1><KineticText>Keep <em>your context</em>.</KineticText></h1>);
  // Accessible-name computation adds whitespace at emphasis boundaries even
  // without animation wrappers. The actual copyable text stays exact.
  const heading = screen.getByRole("heading", { name: /^Keep your context\s*\.$/ });
  expect(heading.textContent).toBe("Keep your context.");
  expect(heading.querySelector("em").textContent).toBe("your context");
  expect(heading.querySelector("[aria-hidden]")).toBeNull();
});

function Frame() {
  const [draft, setDraft] = useState("");
  return <><label>Persistent draft<input value={draft} onChange={event => setDraft(event.target.value)} /></label><Link to="/next">Next page</Link><MotionControl /><main className="ns-page-content"><Outlet /></main></>;
}
function routes() {
  return render(<MotionProvider><MemoryRouter initialEntries={["/first"]}><MotionDirector /><Routes><Route element={<Frame />}><Route path="/first" element={<><h1>First page</h1><article data-motion-card>Evidence card</article><div className="ns-message">Answer</div></>} /><Route path="/next" element={<h1>Next chapter</h1>} /></Route></Routes></MemoryRouter></MotionProvider>);
}
it("announces navigation and focuses the new heading without remounting the shell", async () => {
  routes(); await userEvent.type(screen.getByLabelText("Persistent draft"), "A thought to keep");
  await userEvent.click(screen.getByRole("link", { name: "Next page" }));
  await waitFor(() => expect(document.title).toBe("Next chapter · NeuroSense"));
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Next chapter" }));
  expect(screen.getByLabelText("Persistent draft").value).toBe("A thought to keep");
});
it("plays a card once, ignores streamed text and cancels active animations when switched off", async () => {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
  const observed = [], cancellations = [], observers = [];
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback) { this.callback = callback; this.disconnect = vi.fn(); observers.push(this); }
    observe(node) { observed.push(node); }
    unobserve() {}
  });
  const animate = vi.fn(() => { const cancel = vi.fn(); cancellations.push(cancel); return { cancel, finished: new Promise(() => {}) }; });
  Object.defineProperty(Element.prototype, "animate", { configurable: true, value: animate });
  routes(); const card = screen.getByText("Evidence card");
  await waitFor(() => expect(observed).toContain(card));
  act(() => observers[0].callback([{ target: card, isIntersecting: true }]));
  const count = animate.mock.calls.length;
  act(() => observers[0].callback([{ target: card, isIntersecting: true }]));
  expect(animate).toHaveBeenCalledTimes(count);
  act(() => { screen.getByText("Answer").textContent = "Answer with the next streamed word"; });
  await new Promise(resolve => requestAnimationFrame(resolve));
  expect(animate).toHaveBeenCalledTimes(count);
  await userEvent.click(screen.getByRole("button", { name: "Motion preferences" }));
  await userEvent.click(screen.getByRole("radio", { name: /Off/ }));
  expect(observers[0].disconnect).toHaveBeenCalled();
  cancellations.forEach(cancel => expect(cancel).toHaveBeenCalled());
  expect(document.documentElement.dataset.motion).toBe("off");
});
it("keeps route content visible if browser animation APIs are unavailable", async () => {
  vi.stubGlobal("IntersectionObserver", undefined);
  Object.defineProperty(Element.prototype, "animate", { configurable: true, value: undefined });
  routes(); await waitFor(() => expect(document.title).toBe("First page · NeuroSense"));
  expect(screen.getByText("Evidence card").style.opacity).toBe("");
  expect(screen.getByRole("heading", { name: "First page" }).hidden).toBe(false);
});
