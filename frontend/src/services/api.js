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

export function createChatSocket(chatId, token, { onDelta, onDone, onChatCreated, onError, onClose }) {
  const base = (import.meta.env.VITE_API_URL || "http://localhost:8000/api").replace(/^http/, "ws");
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
  ws.onclose = () => onClose?.();
  return ws;
}

export default api;
