import { afterEach, expect, it, vi } from "vitest";
import { createChatSocket } from "./api";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("constructs same-origin websocket URLs for a proxied /api frontend", () => {
  vi.stubEnv("VITE_API_URL", "/api");
  vi.stubGlobal("WebSocket", class { constructor(url) { this.url = url; } });
  const socket = createChatSocket("chat-id", "test-token", {});
  expect(socket.url).toBe(window.location.origin.replace(/^http/, "ws") + "/api/chat/ws/chat-id?token=test-token");
});
it("uses secure websockets behind an HTTPS API", () => {
  vi.stubEnv("VITE_API_URL", "https://workspace.example/api");
  vi.stubGlobal("WebSocket", class { constructor(url) { this.url = url; } });
  expect(createChatSocket("id", "token", {}).url).toBe("wss://workspace.example/api/chat/ws/id?token=token");
});
