import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000/api",
  withCredentials: true,
});

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem("accessToken");
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// FIX: no more window.location.href hard-reload on auth failure.
// Clearing the token + notifying the app lets React Router handle the
// redirect via PrivateRoute — no full page reload, no "needs refresh" bug.
function onAuthFailure() {
  localStorage.removeItem("accessToken");
  window.dispatchEvent(new Event("auth:logout"));
}

let refreshing = false, queue = [];
api.interceptors.response.use(res => res, async err => {
  const orig = err.config;
  if (err.response?.status === 401 && !orig._retry && !orig.url?.includes("/auth/refresh") && !orig.url?.includes("/auth/login") && !orig.url?.includes("/auth/register")) {
    if (refreshing) return new Promise((res, rej) => queue.push({ res, rej }))
      .then(t => { orig.headers.Authorization = `Bearer ${t}`; return api(orig); });
    orig._retry = true; refreshing = true;
    try {
      const { data } = await api.post("/auth/refresh");
      localStorage.setItem("accessToken", data.access_token);
      queue.forEach(p => p.res(data.access_token)); queue = [];
      orig.headers.Authorization = `Bearer ${data.access_token}`;
      return api(orig);
    } catch {
      queue.forEach(p => p.rej(err)); queue = [];
      onAuthFailure();
    } finally { refreshing = false; }
  }
  return Promise.reject(err);
});

export const authAPI = {
  register: d => api.post("/auth/register", d),
  login:    d => api.post("/auth/login", d),
  googleAuth: d => api.post("/auth/google", d),
  logout:   () => api.post("/auth/logout"),
  forgotPw: d => api.post("/auth/forgot-password", d),
  resetPw:  (t,d) => api.put(`/auth/reset-password/${t}`, d),
  verifyEmail: t => api.get(`/auth/verify/${t}`),
  getMe:    () => api.get("/auth/me"),
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
export const accountAPI = { export: () => api.get("/account/export", { responseType: "blob" }),
  erase: confirmation => api.delete("/account/data", { data: { confirmation } }) };
export function saveDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function createChatSocket(chatId, token, { onDelta, onDone, onChatCreated, onError, onClose }) {
  const parsed = new URL(import.meta.env.VITE_API_URL || "http://localhost:8000/api", window.location.origin);
  parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  const base = parsed.href.replace(/\/$/, "");
  const ws = new WebSocket(`${base}/chat/ws/${chatId}?token=${token}`);
  ws.onmessage = e => {
    try {
      const data = JSON.parse(e.data);
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
