import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import type { PublicPlayerProfile } from "@cardastika/shared";
import { authenticateRoutePlayer, isAuthFailure, type RouteAuthDependencies } from "../auth/routeAuth.js";
import { sendJson } from "../http/json.js";
import { PlayerPersistenceError } from "../users/playerRepository.js";
import { LeaderboardPersistenceError } from "./leaderboardRepository.js";

interface ProfileLookup {
  findPublicProfile(playerId: string): Promise<PublicPlayerProfile | null>;
}

interface PlayerProfileRouteDependencies extends RouteAuthDependencies {
  profiles: ProfileLookup;
  responseHeaders?: OutgoingHttpHeaders;
}

export async function handlePlayerProfileRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: PlayerProfileRouteDependencies,
  playerId: string,
) {
  const headers = dependencies.responseHeaders ?? {};
  if (request.method !== "GET") {
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, headers);
    return;
  }

  try {
    await authenticateRoutePlayer(request, dependencies);
    const profile = await dependencies.profiles.findPublicProfile(playerId);
    if (!profile) {
      sendJson(response, 404, { error: { code: "player_not_found", message: "Player profile was not found" } }, headers);
      return;
    }
    sendJson(response, 200, profile, headers);
  } catch (error) {
    if (isAuthFailure(error)) {
      sendJson(response, 401, { error: { code: error.code, message: "Telegram authentication failed" } }, headers);
      return;
    }
    if (error instanceof PlayerPersistenceError || error instanceof LeaderboardPersistenceError) {
      sendJson(response, 503, { error: { code: "database_unavailable", message: "Player profile is unavailable" } }, headers);
      return;
    }
    console.error("Unexpected player profile request failure", error);
    sendJson(response, 500, { error: { code: "internal_error", message: "Unexpected server failure" } }, headers);
  }
}
