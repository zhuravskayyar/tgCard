import type { LeaderboardKind, LeaderboardResponse } from "@cardastika/shared";
import { getApiEndpoint } from "../api/config";
import { getPlayerAuthHeader } from "./index";

export class LeaderboardApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super("Leaderboard request failed");
    this.name = "LeaderboardApiError";
  }
}

export async function loadLeaderboard(
  initData: string,
  kind: LeaderboardKind,
  page = 1,
  signal?: AbortSignal,
) {
  const response = await fetch(
    getApiEndpoint(`/api/player/leaderboards?kind=${encodeURIComponent(kind)}&page=${page}`),
    {
      headers: { Authorization: getPlayerAuthHeader(initData) },
      cache: "no-store",
      credentials: "same-origin",
      signal,
    },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { code?: unknown } } | null;
    throw new LeaderboardApiError(
      response.status,
      typeof body?.error?.code === "string" ? body.error.code : "leaderboard_request_failed",
    );
  }
  return response.json() as Promise<LeaderboardResponse>;
}
