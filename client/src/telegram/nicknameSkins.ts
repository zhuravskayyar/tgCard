import type {
  EquipNicknameSkinResponse,
  NicknameSkinCatalogResponse,
  NicknameSkinId,
  NicknameSkinPurchaseResponse,
  PlayerInventoryResponse,
} from "@cardastika/shared";
import { getApiEndpoint } from "../api/config";
import { getPlayerAuthHeader } from "./index";

export class NicknameSkinApiError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super("Nickname skin request failed");
    this.name = "NicknameSkinApiError";
  }
}

async function parseError(response: Response): Promise<never> {
  let code = "nickname_skin_request_failed";
  try {
    const body = await response.json() as { error?: { code?: unknown } };
    if (typeof body.error?.code === "string") code = body.error.code;
  } catch {
    // The HTTP status remains useful when the body is malformed.
  }
  throw new NicknameSkinApiError(response.status, code);
}

async function request<T>(initData: string, path: string, options: RequestInit = {}) {
  const response = await fetch(getApiEndpoint(path), {
    ...options,
    headers: {
      Authorization: getPlayerAuthHeader(initData),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) return parseError(response);
  return response.json() as Promise<T>;
}

export function loadNicknameSkinCatalog(initData: string, signal?: AbortSignal) {
  return request<NicknameSkinCatalogResponse>(initData, "/api/shop/nickname-skins", { signal });
}

export function purchaseNicknameSkin(initData: string, choiceId: NicknameSkinId, signal?: AbortSignal) {
  return request<NicknameSkinPurchaseResponse>(initData, "/api/shop/nickname-skins/purchase", {
    body: JSON.stringify({ choiceId }),
    method: "POST",
    signal,
  });
}

export function loadPlayerInventory(initData: string, signal?: AbortSignal) {
  return request<PlayerInventoryResponse>(initData, "/api/player/inventory", { signal });
}

export function equipNicknameSkin(initData: string, skinId: NicknameSkinId | null, signal?: AbortSignal) {
  return request<EquipNicknameSkinResponse>(initData, "/api/player/inventory/nickname-skin/equip", {
    body: JSON.stringify({ skinId }),
    method: "POST",
    signal,
  });
}
