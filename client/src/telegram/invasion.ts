import type {
  InvasionAttackRequest,
  InvasionGuildRatingResponse,
  InvasionStrikeRequest,
  InvasionSwapRequest,
  InvasionView,
} from "@cardastika/shared";
import { getApiEndpoint } from "../api/config";
import { getTelegramInitData, getPlayerAuthHeader } from "./index";

export class InvasionApiError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super("Invasion request failed");
    this.name = "InvasionApiError";
  }
}

async function request<T>(path: string, options: { body?: unknown; method?: "GET" | "POST"; signal?: AbortSignal } = {}) {
  const credential = getTelegramInitData();
  if (!credential) throw new InvasionApiError(401, "authentication_required");
  const response = await fetch(getApiEndpoint(path), {
    method: options.method ?? "GET",
    headers: {
      Authorization: getPlayerAuthHeader(credential),
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    cache: "no-store",
    credentials: "same-origin",
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { code?: unknown } } | null;
    throw new InvasionApiError(response.status, typeof body?.error?.code === "string" ? body.error.code : "invasion_request_failed");
  }
  return response.json() as Promise<T>;
}

export function loadInvasion(signal?: AbortSignal) {
  return request<InvasionView>("/api/invasion", signal ? { signal } : {});
}

export function attackInvasion(body: InvasionAttackRequest) {
  return request<InvasionView>("/api/invasion/attack", { method: "POST", body });
}

export function autoAttackInvasion(body: InvasionAttackRequest) {
  return request<InvasionView>("/api/invasion/auto", { method: "POST", body });
}

export function strikeInvasion(body: InvasionStrikeRequest) {
  return request<InvasionView>("/api/invasion/strike", { method: "POST", body });
}

export function swapInvasionCards(body: InvasionSwapRequest) {
  return request<InvasionView>("/api/invasion/swap", { method: "POST", body });
}

export function activateInvasionPermit() {
  return request<InvasionView>("/api/invasion/permit", { method: "POST" });
}

export function loadInvasionGuilds(signal?: AbortSignal) {
  return request<InvasionGuildRatingResponse>("/api/invasion/guilds", signal ? { signal } : {});
}
