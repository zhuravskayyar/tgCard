import type {
  ActiveCampaignBossResponse,
  CampaignBossView,
  CampaignQuestClaimResponse,
  CampaignStageView,
  CampaignView,
  DuelActionRequest,
} from "@cardastika/shared";
import { getApiEndpoint } from "../api/config";
import { getPlayerAuthHeader } from "./index";

export class CampaignApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super("Campaign request failed");
    this.name = "CampaignApiError";
  }
}

async function request<T>(
  initData: string,
  path: string,
  options: { body?: unknown; method?: "GET" | "POST"; signal?: AbortSignal } = {},
): Promise<T> {
  const response = await fetch(getApiEndpoint(path), {
    method: options.method ?? "GET",
    headers: {
      Authorization: getPlayerAuthHeader(initData),
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    cache: "no-store",
    credentials: "same-origin",
    signal: options.signal,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { code?: unknown } } | null;
    throw new CampaignApiError(
      response.status,
      typeof body?.error?.code === "string" ? body.error.code : "campaign_request_failed",
    );
  }
  return response.json() as Promise<T>;
}

export function loadCampaign(initData: string, signal?: AbortSignal) {
  return request<CampaignView>(initData, "/api/player/campaign", { signal });
}

export function loadCampaignStage(initData: string, stageId: string, signal?: AbortSignal) {
  return request<CampaignStageView>(
    initData,
    `/api/player/campaign/stages/${encodeURIComponent(stageId)}`,
    { signal },
  );
}

export function claimCampaignQuest(initData: string, questId: string, signal?: AbortSignal) {
  return request<CampaignQuestClaimResponse>(
    initData,
    `/api/player/campaign/quests/${encodeURIComponent(questId)}/claim`,
    { method: "POST", signal },
  );
}

export function loadActiveCampaignBoss(initData: string, signal?: AbortSignal) {
  return request<ActiveCampaignBossResponse>(initData, "/api/player/campaign/boss/active", { signal });
}

export function startCampaignBoss(initData: string, signal?: AbortSignal) {
  return request<CampaignBossView>(initData, "/api/player/campaign/boss/start", { method: "POST", signal });
}

export function loadCampaignBoss(initData: string, battleId: string, signal?: AbortSignal) {
  return request<CampaignBossView>(
    initData,
    `/api/player/campaign/boss/${encodeURIComponent(battleId)}`,
    { signal },
  );
}

export function submitCampaignBossAction(
  initData: string,
  battleId: string,
  body: DuelActionRequest,
  signal?: AbortSignal,
) {
  return request<CampaignBossView>(
    initData,
    `/api/player/campaign/boss/${encodeURIComponent(battleId)}/action`,
    { method: "POST", body, signal },
  );
}
