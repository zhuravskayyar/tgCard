import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import { authenticateRoutePlayer, isAuthFailure, type RouteAuthDependencies } from "../auth/routeAuth.js";
import { HttpRequestError, readJsonBody, sendJson } from "../http/json.js";
import { PlayerPersistenceError } from "../users/playerRepository.js";
import { TournamentActionError, TournamentChatError, TournamentDeckError, TournamentRunMissingError, type TournamentService } from "./tournamentService.js";

interface TournamentRouteDependencies extends RouteAuthDependencies {
  tournaments: Pick<TournamentService, "getLobby" | "getRun" | "enter" | "action" | "getChat" | "sendChatMessage">;
  responseHeaders?: OutgoingHttpHeaders;
}

export async function handleTournamentRequest(request: IncomingMessage, response: ServerResponse, dependencies: TournamentRouteDependencies) {
  const headers = dependencies.responseHeaders ?? {};
  const pathname = new URL(request.url ?? "/api/tournament", "http://localhost").pathname;
  const validRoute = pathname === "/api/tournament" && request.method === "GET"
    || pathname === "/api/tournament/run" && request.method === "GET"
    || pathname === "/api/tournament/chat" && request.method === "GET"
    || pathname === "/api/tournament/chat" && request.method === "POST"
    || pathname === "/api/tournament/enter" && request.method === "POST"
    || pathname === "/api/tournament/run/action" && request.method === "POST";
  if (!validRoute) {
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, { ...headers, Allow: "GET, POST" });
    return;
  }
  try {
    const { player } = await authenticateRoutePlayer(request, dependencies);
    if (request.method === "GET" && pathname === "/api/tournament") {
      sendJson(response, 200, await dependencies.tournaments.getLobby(player.id), headers);
    } else if (request.method === "GET" && pathname === "/api/tournament/run") {
      sendJson(response, 200, await dependencies.tournaments.getRun(player.id), headers);
    } else if (request.method === "GET" && pathname === "/api/tournament/chat") {
      sendJson(response, 200, await dependencies.tournaments.getChat(), headers);
    } else if (request.method === "POST" && pathname === "/api/tournament/chat") {
      const body = await readJsonBody(request) as Record<string, unknown>;
      if (typeof body.body !== "string") {
        sendJson(response, 400, { error: { code: "invalid_request", message: "Message body is required" } }, headers);
        return;
      }
      sendJson(response, 201, await dependencies.tournaments.sendChatMessage(player.id, body.body), headers);
    } else if (request.method === "POST" && pathname === "/api/tournament/enter") {
      await readJsonBody(request);
      sendJson(response, 200, await dependencies.tournaments.enter(player.id), headers);
    } else if (request.method === "POST" && pathname === "/api/tournament/run/action") {
      const body = await readJsonBody(request) as Record<string, unknown>;
      if (body.type === "buff" && typeof body.matchId === "string" && typeof body.element === "string") {
        sendJson(response, 200, await dependencies.tournaments.action(player.id, { type: "buff", matchId: body.matchId, element: body.element }), headers);
      } else if (body.type === "attack" && typeof body.matchId === "string" && typeof body.slotIndex === "number") {
        sendJson(response, 200, await dependencies.tournaments.action(player.id, { type: "attack", matchId: body.matchId, slotIndex: body.slotIndex }), headers);
      } else sendJson(response, 400, { error: { code: "invalid_request", message: "Invalid tournament action" } }, headers);
    } else {
      sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, { ...headers, Allow: "GET, POST" });
    }
  } catch (error) {
    if (isAuthFailure(error)) {
      sendJson(response, 401, { error: { code: error.code, message: "Authentication required" } }, headers);
      return;
    }
    if (error instanceof PlayerPersistenceError) {
      sendJson(response, 503, { error: { code: "database_unavailable", message: "Tournament is temporarily unavailable" } }, headers);
      return;
    }
    if (error instanceof TournamentChatError) {
      sendJson(response, error.status, { error: { code: error.code, message: error.message } }, headers);
      return;
    }
    if (error instanceof TournamentDeckError) { sendJson(response, 409, { error: { code: "invalid_deck", message: "A valid saved 9-card deck is required" } }, headers); return; }
    if (error instanceof TournamentRunMissingError) { sendJson(response, 404, { error: { code: "run_missing", message: "No active tournament run" } }, headers); return; }
    if (error instanceof TournamentActionError) { sendJson(response, 409, { error: { code: "invalid_action", message: error.message } }, headers); return; }
    if (error instanceof HttpRequestError) { sendJson(response, error.status, { error: { code: error.code, message: error.message } }, headers); return; }
    throw error;
  }
}
