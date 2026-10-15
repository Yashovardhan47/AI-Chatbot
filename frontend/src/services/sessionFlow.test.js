import { afterEach, beforeEach, expect, it } from "vitest";
import axios from "axios";
import api, { authAPI, authTransport } from "./api";
import { accessToken, clearSession, hasSession, setAccessToken } from "./session";
const originalAdapter = api.defaults.adapter, originalAuthAdapter = authTransport.defaults.adapter;
const response = (config, data) => ({ config, data, status: 200, statusText: "OK", headers: {} });
function rejected(config, status) { return Promise.reject(new axios.AxiosError("Rejected", "ERR_BAD_REQUEST", config, {}, { status, config, data: {} })); }
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
beforeEach(() => { clearSession(); setAccessToken("expired-access", undefined, "owner"); });
afterEach(() => { api.defaults.adapter = originalAdapter; authTransport.defaults.adapter = originalAuthAdapter; clearSession(); });

it("rotates once for simultaneous 401s and keeps bearer credentials out of storage", async () => {
  let refreshes = 0;
  authTransport.defaults.adapter = async config => { refreshes += 1; return response(config, { access_token: "fresh-access" }); };
  api.defaults.adapter = config => config.headers.Authorization === "Bearer fresh-access" ? Promise.resolve(response(config, { private: true })) : rejected(config, 401);
  const results = await Promise.all([api.get("/first"), api.get("/second")]);
  expect(refreshes).toBe(1); expect(results.every(item => item.data.private)).toBe(true);
  expect(accessToken()).toBe("fresh-access"); expect(localStorage.getItem("accessToken")).toBeNull();
});
it("preserves the session on a temporary refresh-server error", async () => {
  authTransport.defaults.adapter = config => rejected(config, 503);
  api.defaults.adapter = config => rejected(config, 401);
  await expect(api.get("/private")).rejects.toThrow();
  expect(accessToken()).toBe("expired-access"); expect(hasSession()).toBe(true);
});
it("clears the session when the refresh cookie is invalid", async () => {
  authTransport.defaults.adapter = config => rejected(config, 401);
  api.defaults.adapter = config => rejected(config, 401);
  await expect(api.get("/private")).rejects.toThrow();
  expect(accessToken()).toBeNull(); expect(hasSession()).toBe(false);
});
it("does not restore a logged-out account from a late refresh", async () => {
  const pending = deferred(), started = deferred();
  authTransport.defaults.adapter = async config => { started.resolve(); await pending.promise; return response(config, { access_token: "old-account-refreshed" }); };
  api.defaults.adapter = config => rejected(config, 401);
  const request = api.get("/private").catch(error => error);
  await started.promise; clearSession(); setAccessToken("new-account", undefined, "new-owner"); pending.resolve();
  expect(axios.isCancel(await request)).toBe(true); expect(accessToken()).toBe("new-account");
});
it("discards a late successful private response after logout", async () => {
  const pending = deferred(), started = deferred();
  api.defaults.adapter = async config => { started.resolve(); await pending.promise; return response(config, { secret: "old-user" }); };
  const request = api.get("/private").catch(error => error);
  await started.promise; clearSession(); pending.resolve();
  expect(axios.isCancel(await request)).toBe(true);
});
it("does not attempt cookie refresh for a rejected Google sign-in", async () => {
  let refreshes = 0;
  authTransport.defaults.adapter = async config => { refreshes += 1; return response(config, {}); };
  api.defaults.adapter = config => { expect(config.headers.Authorization).toBeUndefined(); return rejected(config, 401); };
  await expect(authAPI.googleAuth({ credential: "invalid-google-token" })).rejects.toThrow();
  expect(refreshes).toBe(0); expect(accessToken()).toBe("expired-access");
});
