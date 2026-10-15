const privatePaths = /^\/(home|chat|projects|agents|settings|security|profile|memory|knowledge|continuity|review|memory-graph)(\/|$)/;
export function safeDestination(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/home";
  try {
    const parsed = new URL(value, window.location.origin);
    return parsed.origin === window.location.origin && privatePaths.test(parsed.pathname)
      ? parsed.pathname + parsed.search + parsed.hash : "/home";
  } catch { return "/home"; }
}
export const loginDestination = location => "/login?next=" + encodeURIComponent(safeDestination(location.pathname + location.search));
