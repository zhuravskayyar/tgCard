import type {
  BattlePassClaimResponse,
  BattlePassPageResponse,
  DailyLoginClaimResponse,
  DailyTaskClaimResponse,
} from "@cardastika/shared";
import { getApiEndpoint } from "../api/config";
import { getPlayerAuthHeader } from "./index";

export class BattlePassApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super("Battle pass request failed");
    this.name = "BattlePassApiError";
  }
}

async function request<T>(
  initData: string,
  path: string,
  options: { body?: unknown; method?: "GET" | "POST"; signal?: AbortSignal } = {},
) {
  const headers: Record<string, string> = { Authorization: getPlayerAuthHeader(initData) };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(getApiEndpoint(path), {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
    credentials: "same-origin",
    signal: options.signal,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { code?: unknown } } | null;
    throw new BattlePassApiError(
      response.status,
      typeof body?.error?.code === "string" ? body.error.code : "battle_pass_request_failed",
    );
  }
  return response.json() as Promise<T>;
}

export function loadBattlePass(initData: string, signal?: AbortSignal) {
  return request<BattlePassPageResponse>(initData, "/api/player/battle-pass", { signal });
}

export function claimBattlePassMilestone(initData: string, milestoneId: string) {
  return request<BattlePassClaimResponse>(
    initData,
    `/api/player/battle-pass/milestones/${encodeURIComponent(milestoneId)}/claim`,
    { method: "POST" },
  );
}

export function claimDailyBattlePassTask(initData: string, taskId: string) {
  return request<DailyTaskClaimResponse>(
    initData,
    `/api/player/battle-pass/daily/${encodeURIComponent(taskId)}/claim`,
    { method: "POST" },
  );
}

export function claimLariskaDailyReward(initData: string, choiceIndex?: number) {
  return request<DailyLoginClaimResponse>(initData, "/api/player/battle-pass/daily-login/claim", {
    body: { choiceIndex: choiceIndex ?? null },
    method: "POST",
  });
}
