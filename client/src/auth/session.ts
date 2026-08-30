const SESSION_STORAGE_KEY = "cardastika.session.token";
let memorySessionToken: string | null = null;

export function getSessionToken() {
  if (typeof window === "undefined") return memorySessionToken;
  try {
    const storedToken = window.localStorage.getItem(SESSION_STORAGE_KEY)?.trim() || null;
    if (storedToken) memorySessionToken = storedToken;
    return storedToken || memorySessionToken;
  } catch {
    return memorySessionToken;
  }
}

export function setSessionToken(token: string) {
  memorySessionToken = token.trim() || null;
  if (typeof window === "undefined" || !memorySessionToken) return;
  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, memorySessionToken);
  } catch {
    // Restricted webviews can block storage; keep the active session in memory.
  }
}

export function clearSessionToken() {
  memorySessionToken = null;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // There is no persistent token to clear when storage is unavailable.
  }
}
