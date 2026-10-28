import { afterEach, expect, it, vi } from "vitest";
import { createChatSocket } from "./api";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("constructs same-origin websocket URLs for a proxied /api frontend", () => {
  vi.stubEnv("VITE_API_URL", "/api");
  vi.stubGlobal("WebSocket", class { constructor(url) { this.url = url; } });
  const socket = createChatSocket("chat-id", "test-token", {});
  expect(socket.url).toBe(window.location.origin.replace(/^http/, "ws") + "/api/chat/ws/chat-id");
});
it("uses secure websockets behind an HTTPS API", () => {
  vi.stubEnv("VITE_API_URL", "https://workspace.example/api");
  vi.stubGlobal("WebSocket", class { constructor(url) { this.url = url; } });
  expect(createChatSocket("id", "token", {}).url).toBe("wss://workspace.example/api/chat/ws/id");
});
it("authenticates in the first frame and becomes usable only after server verification", () => {
  vi.stubGlobal("WebSocket", class { send = vi.fn(); constructor(url) { this.url = url; } });
  const onOpen = vi.fn();
  const socket = createChatSocket("id", "private-token", { onOpen });
  socket.onopen();
  expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: "authenticate", token: "private-token" }));
  expect(onOpen).not.toHaveBeenCalled();
  socket.onmessage({ data: JSON.stringify({ type: "ready" }) });
  expect(onOpen).toHaveBeenCalledOnce();
  expect(socket.url).not.toContain("private-token");
});
