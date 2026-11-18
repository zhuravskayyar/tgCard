import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJson } from "../http/json.js";
import { isSweepAuthorized } from "../notifications/notificationRoute.js";
import type { GuildWarService } from "./guildWarService.js";

export async function handleGuildWarTick(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: { wars: Pick<GuildWarService, "ensureCurrentCycle">; secret: string | undefined },
) {
  if (request.method !== "GET") {
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, { Allow: "GET" });
    return;
  }
  if (!isSweepAuthorized(request.headers.authorization, dependencies.secret)) {
    sendJson(response, 401, { error: { code: "unauthorized", message: "Unauthorized" } });
    return;
  }
  try {
    const ready = await dependencies.wars.ensureCurrentCycle();
    sendJson(response, ready ? 200 : 503, { ready });
  } catch (error) {
    console.error("Guild war tick failed", error);
    sendJson(response, 503, { error: { code: "war_tick_failed", message: "Guild war tick failed" } });
  }
}
