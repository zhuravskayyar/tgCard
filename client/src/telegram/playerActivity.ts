import { getApiEndpoint } from "../api/config";
import { getPlayerAuthHeader, getTelegramInitData } from "./index";

export async function sendPlayerHeartbeat(signal?: AbortSignal) {
  const credential = getTelegramInitData();
  if (!credential) return;

  const response = await fetch(getApiEndpoint("/api/player/heartbeat"), {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: { Authorization: getPlayerAuthHeader(credential) },
    signal,
  });
  if (!response.ok) throw new Error("player_activity_failed");
}
