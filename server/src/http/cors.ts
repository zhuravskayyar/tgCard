import type { OutgoingHttpHeaders } from "node:http";

export interface CorsPolicy {
  allowed: boolean;
  headers: OutgoingHttpHeaders;
}

function isLocalDevelopmentOrigin(origin: string) {
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "http:"
      && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]")
      && parsed.username === ""
      && parsed.password === ""
      && parsed.pathname === "/"
      && parsed.search === ""
      && parsed.hash === "";
  } catch {
    return false;
  }
}

export function getCorsPolicy(requestOrigin: string | undefined, allowedOrigin: string | null): CorsPolicy {
  if (!requestOrigin || !allowedOrigin) {
    return { allowed: true, headers: {} };
  }

  if (requestOrigin !== allowedOrigin && !isLocalDevelopmentOrigin(requestOrigin)) {
    return { allowed: false, headers: {} };
  }

  return {
    allowed: true,
    headers: {
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Origin": requestOrigin,
      Vary: "Origin",
    },
  };
}
