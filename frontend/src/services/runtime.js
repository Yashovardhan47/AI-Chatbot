export const CONNECTION_KEY = "neurosense.api.connection";
export function apiBase() {
  return localStorage.getItem(CONNECTION_KEY) || import.meta.env.VITE_API_URL || "http://localhost:8000/api";
}
export function validateApiBase(value) {
  const text = value.trim().replace(/\/$/, "");
  const url = new URL(text, window.location.origin);
  if (url.username || url.password || url.search || url.hash) throw new Error("Use an API URL without credentials, query strings or fragments.");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
    throw new Error("Use HTTPS for a hosted API, or HTTP localhost for local development.");
  return url.href.replace(/\/$/, "");
}
