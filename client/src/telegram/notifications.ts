import { NOTIFICATION_KINDS, type NotificationSettingsResponse, type NotificationSettingsUpdate } from "@cardastika/shared";
import { getApiEndpoint } from "../api/config";
import { getPlayerAuthHeader, getTelegramInitData } from "./index";

export class NotificationSettingsApiError extends Error {
  constructor(public readonly status: number) {
    super("Notification settings request failed");
    this.name = "NotificationSettingsApiError";
  }
}

function parseSettings(value: unknown): NotificationSettingsResponse {
  const settings = value as Partial<NotificationSettingsResponse> | null;
  const preferences = settings?.preferences as Record<string, unknown> | undefined;
  if (
    !preferences
    || !NOTIFICATION_KINDS.every((kind) => typeof preferences[kind] === "boolean")
    || typeof settings?.telegramLinked !== "boolean"
    || typeof settings.telegramBlocked !== "boolean"
  ) {
    throw new NotificationSettingsApiError(502);
  }
  return settings as NotificationSettingsResponse;
}

async function request(init: RequestInit, signal: AbortSignal) {
  const credential = getTelegramInitData();
  if (!credential) throw new NotificationSettingsApiError(401);
  const response = await fetch(getApiEndpoint("/api/player/notifications"), {
    ...init,
    cache: "no-store",
    credentials: "same-origin",
    headers: { Authorization: getPlayerAuthHeader(credential), ...(init.body ? { "Content-Type": "application/json" } : {}) },
    signal,
  });
  if (!response.ok) throw new NotificationSettingsApiError(response.status);
  return parseSettings(await response.json());
}

export function loadNotificationSettings(signal: AbortSignal) {
  return request({ method: "GET" }, signal);
}

export function saveNotificationSettings(update: NotificationSettingsUpdate, signal: AbortSignal) {
  return request({ method: "PUT", body: JSON.stringify(update) }, signal);
}
