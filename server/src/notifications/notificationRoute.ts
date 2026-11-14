import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import type { NotificationSettingsUpdate } from "@cardastika/shared";
import { authenticateRoutePlayer, isAuthFailure, type RouteAuthDependencies } from "../auth/routeAuth.js";
import { HttpRequestError, readJsonBody, sendJson } from "../http/json.js";
import { NotificationSettingsError, type NotificationService } from "./notificationService.js";

interface NotificationRouteDependencies extends RouteAuthDependencies {
  notifications: Pick<NotificationService, "getSettings" | "updateSettings">;
  responseHeaders?: OutgoingHttpHeaders;
}

function readUpdate(body: unknown): NotificationSettingsUpdate {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpRequestError(400, "invalid_notification_settings", "Body must be an object");
  }
  const { preferences, locale } = body as Record<string, unknown>;
  if (preferences !== undefined && (!preferences || typeof preferences !== "object" || Array.isArray(preferences))) {
    throw new HttpRequestError(400, "invalid_notification_settings", "preferences must be an object");
  }
  return { preferences, locale } as NotificationSettingsUpdate;
}

/** GET and PUT /api/player/notifications: the player's notification switches. */
export async function handlePlayerNotifications(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: NotificationRouteDependencies,
) {
  const headers = dependencies.responseHeaders ?? {};
  if (request.method !== "GET" && request.method !== "PUT") {
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, { ...headers, Allow: "GET, PUT, OPTIONS" });
    return;
  }
  try {
    const { player } = await authenticateRoutePlayer(request, dependencies);
    const result = request.method === "GET"
      ? await dependencies.notifications.getSettings(player.id)
      : await dependencies.notifications.updateSettings(player.id, readUpdate(await readJsonBody(request)));
    sendJson(response, 200, result, headers);
  } catch (error) {
    if (error instanceof HttpRequestError) {
      sendJson(response, error.status, { error: { code: error.code, message: error.message } }, headers);
    } else if (error instanceof NotificationSettingsError) {
      sendJson(response, error.code === "player_missing" ? 404 : 400, { error: { code: error.code, message: error.message } }, headers);
    } else if (isAuthFailure(error)) {
      sendJson(response, 401, { error: { code: "authentication_required", message: "Authentication required" } }, headers);
    } else {
      console.error("Notification settings request failed", error instanceof Error ? error.message : error);
      sendJson(response, 503, { error: { code: "notifications_unavailable", message: "Notification settings are unavailable" } }, headers);
    }
  }
}

export function isSweepAuthorized(authorization: string | undefined, secret: string | undefined) {
  if (!secret || !authorization) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(authorization);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * GET or POST /api/internal/notifications/sweep, called by a scheduler every few minutes.
 * Authorization: `Bearer $CRON_SECRET` (the header Vercel Cron sends). Without the secret the route is closed.
 */
export async function handleNotificationSweep(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: { notifications: Pick<NotificationService, "sweep">; secret: string | undefined },
) {
  if (request.method !== "GET" && request.method !== "POST") {
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, { Allow: "GET, POST" });
    return;
  }
  if (!isSweepAuthorized(request.headers.authorization, dependencies.secret)) {
    sendJson(response, 401, { error: { code: "unauthorized", message: "Unauthorized" } });
    return;
  }
  try {
    sendJson(response, 200, await dependencies.notifications.sweep());
  } catch (error) {
    console.error("Notification sweep failed", error instanceof Error ? error.message : error);
    sendJson(response, 500, { error: { code: "sweep_failed", message: "Notification sweep failed" } });
  }
}
