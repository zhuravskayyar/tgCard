import type {
  ArenaActionRequest,
  ActiveArenaResponse,
  ArenaProfileResponse,
  ArenaQueueResponse,
  ArenaShopCatalogResponse,
  ArenaShopPurchaseRequest,
  ArenaShopPurchaseResponse,
  ArenaVersionRequest,
  ArenaView,
} from "@cardastika/shared";
import { getApiEndpoint } from "../api/config";
import { getPlayerAuthHeader } from "./index";

export class ArenaApiError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super("Arena request failed");
    this.name = "ArenaApiError";
  }
}

const ARENA_REQUEST_TIMEOUT_MS = 10_000;

async function request<T>(
  initData: string,
  path: string,
  options: { body?: unknown; method?: "DELETE" | "GET" | "POST"; signal?: AbortSignal } = {},
) {
  const requestController = new AbortController();
  const abortRequest = () => requestController.abort();
  const timeout = window.setTimeout(abortRequest, ARENA_REQUEST_TIMEOUT_MS);
  if (options.signal?.aborted) requestController.abort();
  else options.signal?.addEventListener("abort", abortRequest, { once: true });
  try {
    const response = await fetch(getApiEndpoint(path), {
      method: options.method ?? "GET",
      headers: {
        Authorization: getPlayerAuthHeader(initData),
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      cache: "no-store",
      credentials: "same-origin",
      signal: requestController.signal,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: { code?: unknown } } | null;
      throw new ArenaApiError(response.status, typeof body?.error?.code === "string" ? body.error.code : "arena_request_failed");
    }
    return response.json() as Promise<T>;
  } finally {
    window.clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortRequest);
  }
}

export function loadArenaProfile(initData: string, signal?: AbortSignal) {
  return request<ArenaProfileResponse>(initData, "/api/arena/profile", { signal });
}

export function loadActiveArena(initData: string, signal?: AbortSignal) {
  return request<ActiveArenaResponse>(initData, "/api/arena/active", { signal });
}

export function joinArenaQueue(initData: string, signal?: AbortSignal) {
  return request<ArenaQueueResponse>(initData, "/api/arena/queue", { method: "POST", signal });
}

export function leaveArenaQueue(initData: string, signal?: AbortSignal) {
  return request<{ left: boolean }>(initData, "/api/arena/queue", { method: "DELETE", signal });
}

export function submitArenaAction(initData: string, matchId: string, body: ArenaActionRequest, signal?: AbortSignal) {
  return request<ArenaView>(initData, `/api/arena/matches/${encodeURIComponent(matchId)}/action`, { method: "POST", body, signal });
}

export function changeArenaTarget(initData: string, matchId: string, body: ArenaVersionRequest, signal?: AbortSignal) {
  return request<ArenaView>(initData, `/api/arena/matches/${encodeURIComponent(matchId)}/target`, { method: "POST", body, signal });
}

export function changeArenaCards(initData: string, matchId: string, body: ArenaVersionRequest, signal?: AbortSignal) {
  return request<ArenaView>(initData, `/api/arena/matches/${encodeURIComponent(matchId)}/cards`, { method: "POST", body, signal });
}

export function loadArenaShop(initData: string, signal?: AbortSignal) {
  return request<ArenaShopCatalogResponse>(initData, "/api/arena/shop", { signal });
}

export function purchaseArenaShopItem(initData: string, body: ArenaShopPurchaseRequest, signal?: AbortSignal) {
  return request<ArenaShopPurchaseResponse>(initData, "/api/arena/shop/purchase", { method: "POST", body, signal });
}
