import axios from "axios";
import { apiBase } from "./runtime";
import { accessToken, sessionEpoch, setAccessToken, clearSession } from "./session";

const api = axios.create({ baseURL: apiBase(), withCredentials: true, timeout: 20000 });
export const authTransport = axios.create({ baseURL: apiBase(), withCredentials: true, timeout: 10000 });
let refreshFlight;

function stale() { return new axios.CanceledError("The account session changed"); }
export function refreshAccessToken() {
  const epoch = sessionEpoch();
  if (refreshFlight?.epoch === epoch) return refreshFlight.promise;
  const run = async () => {
    if (epoch !== sessionEpoch()) throw stale();
    const { data } = await authTransport.post("/auth/refresh", {});
    if (epoch !== sessionEpoch()) throw stale();
    setAccessToken(data.access_token, epoch);
    return data.access_token;
  };
  // Serialize rotating cookies across tabs when the browser supports Web Locks.
  const promise = (navigator.locks?.request ? navigator.locks.request("neurosense-refresh", run) : run())
    .catch(error => {
      if (epoch === sessionEpoch() && [401, 403].includes(error.response?.status)) clearSession();
      throw error;
    }).finally(() => { if (refreshFlight?.epoch === epoch) refreshFlight = undefined; });
  refreshFlight = { epoch, promise };
  return promise;
}
api.interceptors.request.use(config => {
  if (!config.skipAuth) {
    config.sessionEpoch ??= sessionEpoch();
    if (config.sessionEpoch !== sessionEpoch()) throw stale();
    const token = accessToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
api.interceptors.response.use(response => {
  if (!response.config.skipAuth && response.config.sessionEpoch !== sessionEpoch()) throw stale();
  return response;
}, async error => {
  const original = error.config;
  if (!original || original.skipAuth || original.skipRefresh) return Promise.reject(error);
  if (original.sessionEpoch !== sessionEpoch()) throw stale();
  if (error.response?.status !== 401) return Promise.reject(error);
  if (original.retried) { clearSession(); return Promise.reject(error); }
  original.retried = true;
  // Another request may have completed rotation before this 401 arrived.
  const current = accessToken();
  const previous = original.headers?.Authorization;
  const next = current && previous !== `Bearer ${current}` ? current : await refreshAccessToken();
  if (original.sessionEpoch !== sessionEpoch()) throw stale();
  original.headers.Authorization = `Bearer ${next}`;
  return api(original);
});
const publicRequest = { skipAuth: true, skipRefresh: true };
export const authAPI = {
  config: () => api.get("/auth/config", { ...publicRequest, timeout: 5000 }),
  register: data => api.post("/auth/register", data, publicRequest),
  login: data => api.post("/auth/login", data, publicRequest),
  googleAuth: data => api.post("/auth/google", data, publicRequest),
  linkGoogle: data => api.post("/auth/google/link", data),
  logout: token => api.post("/auth/logout", {}, { ...publicRequest,
    headers: token ? { Authorization: `Bearer ${token}` } : {} }),
  forgotPw: data => api.post("/auth/forgot-password", data, publicRequest),
  resetPw: (token, data) => api.put(`/auth/reset-password/${token}`, data, publicRequest),
  verifyEmail: token => api.get(`/auth/verify/${token}`, publicRequest),
  resendVerification: email => api.post("/auth/resend-verification", { email }, publicRequest),
  getMe: () => api.get("/auth/me"),
  session: () => api.get("/auth/session"),
};

export const chatAPI = {
  getAll:  () => api.get("/chat/"),
  getOne:  id => api.get(`/chat/${id}`),
  create:  d => api.post("/chat/", d),
  update:  (id,d) => api.put(`/chat/${id}`, d),
  delete:  id => api.delete(`/chat/${id}`),
  daily:   () => api.post("/chat/daily"),
  history: () => api.get("/chat/history"),
};

export const memoryAPI = {
  getAll: params => api.get("/memory/", { params }),
  getOne: id => api.get(`/memory/${id}`),
  create: data => api.post("/memory/", data),
  update: (id, data) => api.patch(`/memory/${id}`, data),
  recall: data => api.post("/memory/recall", data),
  stats: () => api.get("/memory/stats"),
  index: () => api.post("/memory/index"),
  delete: id => api.delete(`/memory/${id}`),
  clearAll: () => api.delete("/memory/"),
};

export const fileAPI = {
  upload: fd => api.post("/files/upload", fd, { headers: { "Content-Type": "multipart/form-data" } }),
};

export const userAPI = {
  updateProfile: d => api.put("/users/profile", d),
  updatePrefs:   d => api.put("/users/preferences", d),
  changePw:      d => api.put("/users/password", d),
  getStats:      () => api.get("/users/stats"),
  deactivate:    () => api.delete("/users/"),
};

export const knowledgeAPI = {
  list: params => api.get("/knowledge/", { params }),
  note: body => api.post("/knowledge/notes", body),
  upload: form => api.post("/knowledge/upload", form),
  get: id => api.get(`/knowledge/${id}`),
  query: body => api.post("/knowledge/query", body),
  index: id => api.post(`/knowledge/${id}/index`),
  delete: id => api.delete(`/knowledge/${id}`),
  download: id => api.get(`/knowledge/${id}/download`, { responseType: "blob" }),
};
export const graphAPI = { get: params => api.get("/memory-graph/", { params }),
  create: body => api.post("/memory-graph/", body), delete: id => api.delete(`/memory-graph/${id}`) };
export const continuityAPI = {
  overview: () => api.get("/continuity/overview"), tasks: params => api.get("/continuity/tasks", { params }),
  create: body => api.post("/continuity/tasks", body), update: (id, body) => api.patch(`/continuity/tasks/${id}`, body),
  delete: id => api.delete(`/continuity/tasks/${id}`), sessions: () => api.get("/continuity/sessions"),
  pinSession: id => api.post(`/continuity/sessions/${id}`), deleteSession: id => api.delete(`/continuity/sessions/${id}`),
  notifications: () => api.get("/continuity/notifications"), read: id => api.patch(`/continuity/notifications/${id}/read`),
};
export const contextAPI = {
  changes: params => api.get("/context/changes", { params }),
  impact: (id, params) => api.get(`/context/changes/${id}`, { params }),
  preview: (body, params) => api.post("/context/preview", body, { params }),
  commit: body => api.post("/context/changes", body),
  replay: body => api.post("/context/replays", body),
  apply: (id, body = {}) => api.post(`/context/replays/${id}/apply`, body),
  answer: (chat, message) => api.get(`/context/answers/${chat}/${message}`),
  support: body => api.post("/context/support", body),
  audit: body => api.post("/context/recall-audit", body),
  clarify: body => api.post("/context/clarify", body),
};
export const accountAPI = { export: () => api.get("/account/export", { responseType: "blob" }),
  erase: confirmation => api.delete("/account/data", { data: { confirmation } }) };
export const workspaceAPI = {
  search: (params, signal) => api.get("/workspace/search", { params, signal }),
  activity: () => api.get("/workspace/activity"), system: () => api.get("/workspace/system"),
  review: params => api.get("/workspace/review", { params }),
  resolve: (id, action) => api.post(`/workspace/review/${id}`, { action }),
  sessions: () => api.get("/workspace/sessions"), revokeAll: () => api.post("/workspace/sessions/revoke-all"),
};
export function saveDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function createChatSocket(chatId, token, { onDelta, onDone, onChatCreated, onError, onClose, onOpen }) {
  const parsed = new URL(apiBase(), window.location.origin);
  parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  const base = parsed.href.replace(/\/$/, "");
  const ws = new WebSocket(`${base}/chat/ws/${encodeURIComponent(chatId)}`);
  ws.onopen = () => ws.send(JSON.stringify({ type: "authenticate", token }));
  ws.onmessage = e => {
    try {
      const data = JSON.parse(e.data);
      if (data.type === "ready") onOpen?.();
      if (data.type === "delta") onDelta?.(data.delta);
      if (data.type === "done")  onDone?.(data);
      if (data.type === "chat_created") onChatCreated?.(data.chat_id);
      if (data.type === "error") onError?.(data.message);
    } catch {}
  };
  ws.onerror = () => onError?.("Chat connection failed. Reload to reconnect.");
  ws.onclose = event => onClose?.(event);
  return ws;
}

export default api;
