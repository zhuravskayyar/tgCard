import type { EquippedEquipment, PlayerEquipmentResponse } from "@cardastika/shared";
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
