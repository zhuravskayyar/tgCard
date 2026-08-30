import type {
  ActiveDuelResponse,
  DuelActionRequest,
  DuelSearchResponse,
  DuelStartRequest,
  DuelView,
} from "@cardastika/shared";
import { getApiEndpoint } from "../api/config";
import { getPlayerAuthHeader } from "./index";

export class DuelApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super("Duel request failed");
    this.name = "DuelApiError";
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
    throw new DuelApiError(
      response.status,
      typeof body?.error?.code === "string" ? body.error.code : "duel_request_failed",
    );
  }
  return response.json() as Promise<T>;
}

export function searchDuelOpponent(initData: string, signal?: AbortSignal) {
  return request<DuelSearchResponse>(initData, "/api/duel/search", { method: "POST", signal });
}

export function startDuel(initData: string, searchId: string, tutorial = false, signal?: AbortSignal) {
  const body: DuelStartRequest = tutorial ? { searchId, tutorial: true } : { searchId };
  return request<DuelView>(initData, "/api/duel/start", { method: "POST", body, signal });
}

export function loadActiveDuel(initData: string, signal?: AbortSignal) {
  return request<ActiveDuelResponse>(initData, "/api/duel/active", { signal });
}

export function loadDuel(initData: string, duelId: string, signal?: AbortSignal) {
  return request<DuelView>(initData, `/api/duel/${encodeURIComponent(duelId)}`, { signal });
}

export function submitDuelAction(
  initData: string,
  duelId: string,
  body: DuelActionRequest,
  signal?: AbortSignal,
) {
  return request<DuelView>(initData, `/api/duel/${encodeURIComponent(duelId)}/action`, {
    method: "POST",
    body,
    signal,
  });
}
