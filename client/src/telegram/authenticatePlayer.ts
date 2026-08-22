import type { PlayerSummary, TelegramAuthRequest } from "@cardastika/shared";

export class PlayerBootstrapError extends Error {
  constructor(public readonly status: number) {
    super("Player bootstrap failed");
    this.name = "PlayerBootstrapError";
  }
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNonNegativeInteger(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isPlayerSummary(value: unknown): value is PlayerSummary {
  if (!value || typeof value !== "object") {
    return false;
  }

  const player = value as Record<string, unknown>;
  return (
    typeof player.id === "string" &&
    isNullableString(player.username) &&
    typeof player.firstName === "string" &&
    isNullableString(player.photoUrl) &&
    Number.isSafeInteger(player.level) &&
    Number(player.level) >= 1 &&
    isNonNegativeInteger(player.silver) &&
    isNonNegativeInteger(player.gold)
  );
}

export async function authenticateTelegramPlayer(initData: string, signal: AbortSignal) {
  const body: TelegramAuthRequest = { initData };
  const response = await fetch("/api/auth/telegram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });

  if (!response.ok) {
    throw new PlayerBootstrapError(response.status);
  }

  const player: unknown = await response.json();
  if (!isPlayerSummary(player)) {
    throw new PlayerBootstrapError(502);
  }

  return player;
}
