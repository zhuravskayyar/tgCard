import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import { authenticateRoutePlayer, isAuthFailure, type RouteAuthDependencies } from "../auth/routeAuth.js";
import { sendJson } from "../http/json.js";
import { PlayerPersistenceError, type PlayerRepository } from "./playerRepository.js";

interface PlayerTutorialRouteDependencies extends RouteAuthDependencies {
  players: Pick<PlayerRepository, "completeTutorial" | "findOrCreateFromTelegram">;
  responseHeaders?: OutgoingHttpHeaders;
}

function sendTutorialError(response: ServerResponse, error: unknown, headers: OutgoingHttpHeaders) {
  if (isAuthFailure(error)) {
    sendJson(response, 401, { error: { code: error.code, message: "Authentication failed" } }, headers);
    return;
  }
  if (error instanceof PlayerPersistenceError) {
    sendJson(response, 503, { error: { code: "database_unavailable", message: "Tutorial service is unavailable" } }, headers);
    return;
  }
  console.error("Unexpected tutorial completion failure", error);
  sendJson(response, 500, { error: { code: "internal_error", message: "Unexpected server failure" } }, headers);
}

export async function handlePlayerTutorialCompletion(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: PlayerTutorialRouteDependencies,
) {
  const headers = dependencies.responseHeaders ?? {};
  if (request.method !== "POST") {
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, headers);
    return;
  }

  try {
    const { player } = await authenticateRoutePlayer(request, dependencies);
    sendJson(response, 200, { player: await dependencies.players.completeTutorial(player.id) }, headers);
  } catch (error) {
    sendTutorialError(response, error, headers);
  }
}
