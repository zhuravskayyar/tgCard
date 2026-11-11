import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import { authenticateRoutePlayer, isAuthFailure, type RouteAuthDependencies } from "../auth/routeAuth.js";
import { sendJson } from "../http/json.js";
import { AchievementProgressPersistenceError, type AchievementProgressService } from "./achievementProgressService.js";

interface AchievementProgressDependencies extends RouteAuthDependencies {
  progress: Pick<AchievementProgressService, "getPlayerProgress">;
  responseHeaders?: OutgoingHttpHeaders;
}

export async function handlePlayerAchievementProgress(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: AchievementProgressDependencies,
) {
  const responseHeaders = dependencies.responseHeaders ?? {};
  if (request.method !== "GET") {
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, responseHeaders);
    return;
  }

  try {
    const { player } = await authenticateRoutePlayer(request, dependencies);
    const progress = await dependencies.progress.getPlayerProgress(player.id);
    sendJson(response, 200, progress, responseHeaders);
  } catch (error) {
    if (isAuthFailure(error)) {
      sendJson(response, 401, { error: { code: error.code, message: "Player authentication failed" } }, responseHeaders);
      return;
    }
    if (error instanceof AchievementProgressPersistenceError) {
      sendJson(response, 503, { error: { code: "database_unavailable", message: "Achievement progress is unavailable" } }, responseHeaders);
      return;
    }
    console.error("Unexpected achievement progress request failure");
    sendJson(response, 500, { error: { code: "internal_error", message: "Unexpected server failure" } }, responseHeaders);
  }
}
