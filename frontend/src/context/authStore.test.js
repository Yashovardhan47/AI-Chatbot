import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ login: vi.fn(), logout: vi.fn(), google: vi.fn(), me: vi.fn(), refresh: vi.fn() }));
vi.mock("../services/api", () => ({ authAPI: { login: mocks.login, logout: mocks.logout, googleAuth: mocks.google, getMe: mocks.me }, refreshAccessToken: mocks.refresh }));
import store from "./authStore";
import { accessToken, clearSession, setAccessToken, SESSION_KEY } from "../services/session";
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
beforeEach(() => { vi.clearAllMocks(); clearSession(); mocks.logout.mockResolvedValue({}); });
it("recovers the account through its refresh cookie after a reload", async () => {
  localStorage.setItem(SESSION_KEY, "owner");
  mocks.refresh.mockImplementation(async () => setAccessToken("rotated", undefined, "owner"));
  mocks.me.mockResolvedValue({ data: { user: { id: "owner", name: "Owner" } } });
  await store.getState().init();
  expect(mocks.refresh).toHaveBeenCalledOnce(); expect(store.getState().user.id).toBe("owner"); expect(store.getState().token).toBe("rotated");
});
it("deduplicates simultaneous session bootstrap calls", async () => {
  localStorage.setItem(SESSION_KEY, "owner"); const pending = deferred();
  mocks.refresh.mockImplementation(async () => { await pending.promise; setAccessToken("rotated"); });
  mocks.me.mockResolvedValue({ data: { user: { id: "owner" } } });
  const one = store.getState().init(), two = store.getState().init(); pending.resolve(); await Promise.all([one, two]);
  expect(mocks.refresh).toHaveBeenCalledOnce(); expect(mocks.me).toHaveBeenCalledOnce();
});
it("hides account data immediately when logout is still waiting on the server", async () => {
  const pending = deferred(); mocks.logout.mockReturnValue(pending.promise);
  store.setState({ user: { id: "owner" }, token: "access" }); setAccessToken("access");
  const operation = store.getState().logout();
  expect(store.getState().user).toBeNull(); expect(accessToken()).toBeNull();
  pending.resolve(); await operation;
});
it("rejects a late sign-in result after logout", async () => {
  const pending = deferred(); mocks.login.mockReturnValue(pending.promise);
  const operation = store.getState().login("owner@example.com", "password").catch(error => error);
  await store.getState().logout(); pending.resolve({ data: { access_token: "old-token", user: { id: "owner" } } });
  expect(await operation).toBeInstanceOf(Error); expect(store.getState().user).toBeNull(); expect(accessToken()).toBeNull();
});
it("does not accept a malformed successful sign-in response", async () => {
  mocks.login.mockResolvedValue({ data: { access_token: "token" } });
  await expect(store.getState().login("owner@example.com", "password")).rejects.toThrow("Invalid authentication response");
  expect(accessToken()).toBeNull();
});
