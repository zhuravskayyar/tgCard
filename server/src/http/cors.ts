import type { OutgoingHttpHeaders } from "node:http";

export interface CorsPolicy {
  allowed: boolean;
  headers: OutgoingHttpHeaders;
}

export function getCorsPolicy(requestOrigin: string | undefined, allowedOrigin: string | null): CorsPolicy {
  if (!requestOrigin || !allowedOrigin) {
    return { allowed: true, headers: {} };
  }

  if (requestOrigin !== allowedOrigin) {
    return { allowed: false, headers: {} };
  }

  return {
    allowed: true,
    headers: {
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Origin": allowedOrigin,
      Vary: "Origin",
    },
  };
}
