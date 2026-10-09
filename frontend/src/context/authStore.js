import { create } from "zustand";
import { authAPI } from "../services/api";

const useAuthStore = create((set) => ({
  user: null,
  token: localStorage.getItem("accessToken") || null,
  loading: true,

  init: async () => {
    const token = localStorage.getItem("accessToken");
    if (!token) { set({ loading: false }); return; }
    try {
      const { data } = await authAPI.getMe();
      set({ user: data.user, loading: false });
    } catch {
      localStorage.removeItem("accessToken");
      set({ user: null, token: null, loading: false });
    }
  },

  login: async (email, password) => {
    const { data } = await authAPI.login({ email, password });
    localStorage.setItem("accessToken", data.access_token);
    set({ user: data.user, token: data.access_token });
    return data;
  },

  // Google Identity Services returns a credential (ID token) — send to backend
  googleLogin: async credential => {
    const { data } = await authAPI.googleAuth({ credential });
    localStorage.setItem("accessToken", data.access_token);
    set({ user: data.user, token: data.access_token });
    return data;
  },

  logout: async () => {
    try { await authAPI.logout(); } catch {}
    localStorage.removeItem("accessToken");
    set({ user: null, token: null });
  },

  updateUser: updates => set(s => ({ user: { ...s.user, ...updates } })),
}));

// FIX: react to auth failures (401/refresh-fail) via event instead of a hard
// page reload — React Router's PrivateRoute picks up the state change and
// redirects instantly with no "needs refresh" glitch.
window.addEventListener("auth:logout", () => {
  useAuthStore.setState({ user: null, token: null, loading: false });
});

export default useAuthStore;
