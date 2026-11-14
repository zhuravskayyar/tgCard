import type { ChestShopOpenChestResponse, ChestShopView } from "@cardastika/shared";
import { getApiEndpoint } from "../api/config";
import { getPlayerAuthHeader } from "./index";

export class ChestShopApiError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super("Chest shop request failed");
    this.name = "ChestShopApiError";
  }
}

async function request<T>(initData: string, path: string, options: { body?: unknown; method?: "GET" | "POST"; signal?: AbortSignal } = {}): Promise<T> {
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
    throw new ChestShopApiError(response.status, typeof body?.error?.code === "string" ? body.error.code : "chest_shop_failed");
  }
  return response.json() as Promise<T>;
}

export function loadChestShop(initData: string, signal?: AbortSignal) {
  return request<ChestShopView>(initData, "/api/chest-shop", { signal });
}

/** Starts this week's four-hour opening. */
export function openChestShop(initData: string) {
  return request<ChestShopView>(initData, "/api/chest-shop/open", { method: "POST" });
}

export function openShopChest(initData: string, chestNumber: number) {
  return request<ChestShopOpenChestResponse>(initData, "/api/chest-shop/chest", { method: "POST", body: { chestNumber } });
}
