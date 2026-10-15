// Access tokens live in this tab's memory. The server's HttpOnly cookie is
// the only persistent credential; the storage marker contains no credential.
export const SESSION_KEY = "neurosense.session";
let token = null;
let epoch = 0;
localStorage.removeItem("accessToken"); // retire tokens persisted by v6

export const accessToken = () => token;
export const sessionEpoch = () => epoch;
export const hasSession = () => !!localStorage.getItem(SESSION_KEY);
export function setAccessToken(value, expectedEpoch = epoch, userId) {
  if (expectedEpoch !== epoch) throw new Error("This sign-in attempt is no longer active");
  if (typeof value !== "string" || !value) throw new Error("Invalid authentication response");
  token = value;
  localStorage.setItem(SESSION_KEY, userId || localStorage.getItem(SESSION_KEY) || "active");
  window.dispatchEvent(new CustomEvent("auth:token", { detail: value }));
}
export function clearSession() {
  epoch += 1;
  token = null;
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem("accessToken");
  window.dispatchEvent(new Event("auth:logout"));
  return epoch;
}
window.addEventListener("storage", event => {
  if (event.key === SESSION_KEY && event.oldValue !== event.newValue) {
    epoch += 1; token = null;
    window.dispatchEvent(new Event("auth:logout"));
  }
});
