import type { PlayerNicknameUpdateResponse } from "@cardastika/shared";
import { PLAYER_NICKNAME_MAX_LENGTH } from "@cardastika/shared";
import { getApiEndpoint } from "../api/config";
import { getPlayerAuthHeader } from "./index";

export class PlayerNicknameApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super("Nickname update failed");
    this.name = "PlayerNicknameApiError";
  }
}

async function parseError(response: Response): Promise<never> {
  let code = "nickname_update_failed";
  try {
    const body = await response.json() as { error?: { code?: unknown } };
    if (typeof body.error?.code === "string") code = body.error.code;
  } catch {
    // The HTTP status remains the authoritative failure when the body is malformed.
  }
  throw new PlayerNicknameApiError(response.status, code);
}

function parseResponse(value: unknown): PlayerNicknameUpdateResponse {
  if (!value || typeof value !== "object") throw new PlayerNicknameApiError(502, "invalid_response");
  const response = value as Partial<PlayerNicknameUpdateResponse>;
  if (
    typeof response.nickname !== "string" ||
    Array.from(response.nickname).length < 1 ||
    Array.from(response.nickname).length > PLAYER_NICKNAME_MAX_LENGTH
  ) {
    throw new PlayerNicknameApiError(502, "invalid_response");
  }
  return { nickname: response.nickname };
}

export async function updatePlayerNickname(credential: string, nickname: string, signal: AbortSignal) {
  const response = await fetch(getApiEndpoint("/api/player/nickname"), {
    method: "POST",
    headers: { Authorization: getPlayerAuthHeader(credential), "Content-Type": "application/json" },
    body: JSON.stringify({ nickname }),
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) return parseError(response);
  return parseResponse(await response.json());
}
