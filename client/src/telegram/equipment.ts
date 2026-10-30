import type { EquipmentChestOpenResponse, EquippedEquipment, PlayerEquipmentForgeResponse, PlayerEquipmentResponse } from "@cardastika/shared";
import { getApiEndpoint } from "../api/config";
import { getPlayerAuthHeader } from "./index";

export async function loadPlayerEquipment(credential: string, signal?: AbortSignal) {
  const response = await fetch(getApiEndpoint("/api/player/equipment"), {
    headers: { Authorization: getPlayerAuthHeader(credential) },
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) throw new Error("equipment_load_failed");
  return response.json() as Promise<PlayerEquipmentResponse>;
}

export async function forgePlayerEquipment(credential: string, itemIds: readonly string[]) {
  const response = await fetch(getApiEndpoint("/api/player/equipment/forge"), {
    method: "POST",
    headers: { Authorization: getPlayerAuthHeader(credential), "Content-Type": "application/json" },
    body: JSON.stringify({ itemIds }),
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { code?: string } } | null;
    throw new Error(body?.error?.code ?? "forge_failed");
  }
  return response.json() as Promise<PlayerEquipmentForgeResponse>;
}

export async function openEquipmentChest(credential: string, chestId: string) {
  const response = await fetch(getApiEndpoint("/api/shop/equipment-chests"), {
    method: "POST",
    headers: { Authorization: getPlayerAuthHeader(credential), "Content-Type": "application/json" },
    body: JSON.stringify({ chestId }),
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { code?: string } } | null;
    throw new Error(body?.error?.code ?? "chest_failed");
  }
  return response.json() as Promise<EquipmentChestOpenResponse>;
}

export async function savePlayerEquipment(credential: string, equipped: EquippedEquipment, signal?: AbortSignal) {
  const response = await fetch(getApiEndpoint("/api/player/equipment"), {
    method: "PUT",
    headers: { Authorization: getPlayerAuthHeader(credential), "Content-Type": "application/json" },
    body: JSON.stringify({ equipped }),
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) throw new Error("equipment_update_failed");
  return response.json() as Promise<PlayerEquipmentResponse>;
}
