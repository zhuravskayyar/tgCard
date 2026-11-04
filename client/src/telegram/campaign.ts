import type {
  ActiveCampaignBossResponse,
  CampaignBossView,
  CampaignMapView,
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
  return request<CampaignMapView>(initData, "/api/player/campaign", { signal });
}

export function loadActiveCampaignBoss(initData: string, signal?: AbortSignal) {
  return request<ActiveCampaignBossResponse>(initData, "/api/player/campaign/boss/active", { signal });
}

export function startCampaignBoss(initData: string, location: number, signal?: AbortSignal) {
  return request<CampaignBossView>(initData, "/api/player/campaign/boss/start", { method: "POST", body: { location }, signal });
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
