import type { CardElement, GuardianDragonFeedResponse, GuardianDragonFightResponse, GuardianDragonHikeHoursValue, GuardianDragonRatingResponse, GuardianDragonView } from "@cardastika/shared";
import { getApiEndpoint } from "../api/config";
import { getPlayerAuthHeader } from "./index";

export class GuardianDragonApiError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super("Guardian dragon request failed");
    this.name = "GuardianDragonApiError";
  }
}

const REQUEST_TIMEOUT_MS = 10_000;

async function request<T>(initData: string, path: string, options: { body?: unknown; method?: "GET" | "POST"; signal?: AbortSignal } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timeout = window.setTimeout(abort, REQUEST_TIMEOUT_MS);
  if (options.signal?.aborted) controller.abort();
  else options.signal?.addEventListener("abort", abort, { once: true });
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
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: { code?: unknown } } | null;
      throw new GuardianDragonApiError(response.status, typeof body?.error?.code === "string" ? body.error.code : "guardian_dragon_request_failed");
    }
    return response.json() as Promise<T>;
  } finally {
    window.clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
  }
}

export function loadGuardianDragon(initData: string, signal?: AbortSignal) {
  return request<GuardianDragonView>(initData, "/api/guardian-dragon", { signal });
}

/** Without ids the server feeds weak cards, weakest first, until the scale is full. */
export function feedGuardianDragon(initData: string, instanceIds?: string[], element?: CardElement) {
  return request<GuardianDragonFeedResponse>(initData, "/api/guardian-dragon/feed", { method: "POST", body: instanceIds ? { instanceIds } : element ? { element } : {} });
}

export function startGuardianDragonHike(initData: string, hours: GuardianDragonHikeHoursValue) {
  return request<GuardianDragonView>(initData, "/api/guardian-dragon/hike", { method: "POST", body: { hours } });
}

export function cancelGuardianDragonHike(initData: string) {
  return request<GuardianDragonView>(initData, "/api/guardian-dragon/hike/cancel", { method: "POST", body: {} });
}

/** `expectedPrice` is the price the button showed (0 for the free send); the server refuses another price. */
export function fightGuardianDragon(initData: string, expectedPrice: number) {
  return request<GuardianDragonFightResponse>(initData, "/api/guardian-dragon/fight", { method: "POST", body: { expectedPrice } });
}

export function loadGuardianDragonRating(initData: string, page: number, signal?: AbortSignal) {
  return request<GuardianDragonRatingResponse>(initData, `/api/guardian-dragon/rating?page=${page}`, { signal });
}
