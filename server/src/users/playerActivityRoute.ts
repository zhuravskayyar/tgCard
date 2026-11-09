import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import type { PlayerRepository } from "./playerRepository.js";
import { authenticateRoutePlayer, isAuthFailure, type RouteAuthDependencies } from "../auth/routeAuth.js";
import { sendJson } from "../http/json.js";

interface PlayerActivityRouteDependencies extends RouteAuthDependencies {
  players: RouteAuthDependencies["players"] & Pick<PlayerRepository, "recordActivity">;
  responseHeaders?: OutgoingHttpHeaders;
}

export async function handlePlayerHeartbeat(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: PlayerActivityRouteDependencies,
) {
  const headers = dependencies.responseHeaders ?? {};
  if (request.method !== "POST") {
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, { ...headers, Allow: "POST, OPTIONS" });
    return;
  }

  try {
    const { player } = await authenticateRoutePlayer(request, dependencies);
    await dependencies.players.recordActivity(player.id);
    sendJson(response, 200, { ok: true }, headers);
  } catch (error) {
    if (isAuthFailure(error)) {
      sendJson(response, 401, { error: { code: "authentication_required", message: "Authentication required" } }, headers);
      return;
    }
    console.error("Could not record player activity", error);
    sendJson(response, 500, { error: { code: "activity_tracking_unavailable", message: "Could not update player activity" } }, headers);
  }
}
