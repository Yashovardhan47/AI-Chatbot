import { create } from "zustand";
import { authAPI, refreshAccessToken } from "../services/api";
import { accessToken, sessionEpoch, hasSession, setAccessToken, clearSession } from "../services/session";

let initialization;
const useAuthStore = create((set) => {
  async function signIn(request) {
    const epoch = clearSession();
    const { data } = await request();
    if (epoch !== sessionEpoch()) throw new Error("This sign-in attempt was cancelled");
    if (!data.user?.id || !data.access_token) throw new Error("Invalid authentication response");
    setAccessToken(data.access_token, epoch, data.user.id);
    set({ user: data.user, token: data.access_token, loading: false, sessionError: "" });
    return data;
  }
  return {
    user: null, token: null, loading: true, sessionError: "",
    init: () => {
      if (initialization?.epoch === sessionEpoch()) return initialization.promise;
      const epoch = sessionEpoch();
      const promise = (async () => {
        if (!hasSession() && !accessToken()) { set({ loading: false }); return; }
        try {
          if (!accessToken()) await refreshAccessToken();
          const { data } = await authAPI.getMe();
          if (epoch !== sessionEpoch()) return;
          if (!data.user?.id) throw new Error("Invalid account response");
          setAccessToken(accessToken(), epoch, data.user.id);
          set({ user: data.user, token: accessToken(), loading: false, sessionError: "" });
        } catch (error) {
          if (epoch !== sessionEpoch()) return;
          set({ user: null, token: null, loading: false,
            sessionError: error.response?.status === 401 ? "" : "Your session could not be restored. Check the connection and try again." });
        }
      })().finally(() => { if (initialization?.epoch === epoch) initialization = undefined; });
      initialization = { epoch, promise };
      return promise;
    },
    login: (email, password) => signIn(() => authAPI.login({ email, password })),
    googleLogin: credential => signIn(() => authAPI.googleAuth({ credential })),
    logout: () => {
      const previous = accessToken();
      clearSession(); // close sockets and hide private content immediately
      return authAPI.logout(previous).catch(() => {});
    },
    updateUser: updates => set(state => state.user ? { user: { ...state.user, ...updates } } : {}),
  };
});
window.addEventListener("auth:logout", () => {
  useAuthStore.setState({ user: null, token: null, loading: false, sessionError: "" });
});
window.addEventListener("auth:token", event => useAuthStore.setState({ token: event.detail }));
export default useAuthStore;
