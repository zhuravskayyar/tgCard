import { ACHIEVEMENT_STATISTIC_KEYS, type AchievementStatisticKey, type PlayerAchievementProgressResponse } from "@cardastika/shared";
import { getApiEndpoint } from "../api/config";
import { getPlayerAuthHeader } from "../telegram";

export class AchievementProgressRequestError extends Error {
  constructor(public readonly status: number) {
    super("Achievement progress request failed");
    this.name = "AchievementProgressRequestError";
  }
}

function parseProgress(value: unknown): PlayerAchievementProgressResponse {
  if (!value || typeof value !== "object" || !("statistics" in value)) throw new AchievementProgressRequestError(502);
  const raw = (value as { statistics?: unknown }).statistics;
  if (!raw || typeof raw !== "object") throw new AchievementProgressRequestError(502);

  const statistics = {} as Record<AchievementStatisticKey, number | null>;
  for (const key of ACHIEVEMENT_STATISTIC_KEYS) {
    if (!(key in raw)) throw new AchievementProgressRequestError(502);
    const current = (raw as Record<string, unknown>)[key];
    if (current !== null && (typeof current !== "number" || !Number.isFinite(current) || current < 0)) {
      throw new AchievementProgressRequestError(502);
    }
    statistics[key] = current;
  }
  return { statistics };
}

export async function loadAchievementProgress(credential: string, signal: AbortSignal) {
  const response = await fetch(getApiEndpoint("/api/player/achievements"), {
    headers: { Authorization: getPlayerAuthHeader(credential) },
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) throw new AchievementProgressRequestError(response.status);
  return parseProgress(await response.json());
}
