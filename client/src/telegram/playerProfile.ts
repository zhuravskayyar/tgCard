import type { PublicPlayerProfile } from "@cardastika/shared";
import { getApiEndpoint } from "../api/config";
import { getPlayerAuthHeader } from "./index";

export async function loadPlayerProfile(initData: string, playerId: string, signal?: AbortSignal) {
  const response = await fetch(getApiEndpoint(`/api/player/profiles/${encodeURIComponent(playerId)}`), {
    headers: { Authorization: getPlayerAuthHeader(initData) },
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { code?: unknown } } | null;
    const code = typeof body?.error?.code === "string" ? body.error.code : "player_profile_request_failed";
    throw new Error(code);
  }
  return response.json() as Promise<PublicPlayerProfile>;
}
