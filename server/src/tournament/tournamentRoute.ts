import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import { CARD_ELEMENTS, type CardElement, type TournamentRunAction } from "@cardastika/shared";
import { authenticateRoutePlayer, isAuthFailure, type RouteAuthDependencies } from "../auth/routeAuth.js";
import { HttpRequestError, readJsonBody, sendJson } from "../http/json.js";
import { PlayerPersistenceError } from "../users/playerRepository.js";
import { TournamentActionError, TournamentChatError, TournamentDeckError, TournamentRunMissingError, type TournamentService } from "./tournamentService.js";

interface TournamentRouteDependencies extends RouteAuthDependencies {
  tournaments: Pick<TournamentService, "getLobby" | "getAwards" | "getRun" | "register" | "unregister" | "scheduleDevEvent" | "action" | "getChat" | "sendChatMessage">;
  responseHeaders?: OutgoingHttpHeaders;
}

const ROUTES = new Set([
  "GET /api/tournament",
  "GET /api/tournament/run",
  "GET /api/tournament/awards",
  "GET /api/tournament/chat",
  "POST /api/tournament/chat",
  "POST /api/tournament/register",
  "POST /api/tournament/unregister",
  "POST /api/tournament/dev/schedule",
  "POST /api/tournament/run/action",
]);

function readAction(body: Record<string, unknown>): TournamentRunAction | null {
  if (typeof body.matchId !== "string") return null;
  if (body.type === "buff" && CARD_ELEMENTS.includes(body.element as CardElement)) return { type: "buff", matchId: body.matchId, element: body.element as CardElement };
  if (body.type === "attack" && (body.slotIndex === 0 || body.slotIndex === 1 || body.slotIndex === 2)) return { type: "attack", matchId: body.matchId, slotIndex: body.slotIndex };
  if (body.type === "change") return { type: "change", matchId: body.matchId };
  return null;
}

export async function handleTournamentRequest(request: IncomingMessage, response: ServerResponse, dependencies: TournamentRouteDependencies) {
  const headers = dependencies.responseHeaders ?? {};
  const pathname = new URL(request.url ?? "/api/tournament", "http://localhost").pathname;
  const route = `${request.method} ${pathname}`;
  if (!ROUTES.has(route)) {
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, { ...headers, Allow: "GET, POST" });
    return;
  }
  try {
    const { player } = await authenticateRoutePlayer(request, dependencies);
    const service = dependencies.tournaments;
    if (route === "GET /api/tournament") sendJson(response, 200, await service.getLobby(player.id), headers);
    else if (route === "GET /api/tournament/awards") sendJson(response, 200, await service.getAwards(player.id), headers);
    else if (route === "GET /api/tournament/run") sendJson(response, 200, await service.getRun(player.id), headers);
    else if (route === "GET /api/tournament/chat") sendJson(response, 200, await service.getChat(), headers);
    else if (route === "POST /api/tournament/chat") {
      const body = await readJsonBody(request) as Record<string, unknown>;
      if (typeof body.body !== "string") {
        sendJson(response, 400, { error: { code: "invalid_request", message: "Message body is required" } }, headers);
        return;
      }
      sendJson(response, 201, await service.sendChatMessage(player.id, body.body), headers);
    } else if (route === "POST /api/tournament/register") {
      await readJsonBody(request);
      sendJson(response, 200, await service.register(player.id), headers);
    } else if (route === "POST /api/tournament/unregister") {
      await readJsonBody(request);
      sendJson(response, 200, await service.unregister(player.id), headers);
    } else if (route === "POST /api/tournament/dev/schedule") {
      await readJsonBody(request);
      sendJson(response, 200, await service.scheduleDevEvent(player.id), headers);
    } else {
      const action = readAction(await readJsonBody(request) as Record<string, unknown>);
      if (!action) {
        sendJson(response, 400, { error: { code: "invalid_request", message: "Invalid tournament action" } }, headers);
        return;
      }
      sendJson(response, 200, await service.action(player.id, action), headers);
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
    if (error instanceof TournamentRunMissingError) { sendJson(response, 404, { error: { code: "run_missing", message: "No active tournament" } }, headers); return; }
    if (error instanceof TournamentActionError) { sendJson(response, 409, { error: { code: "invalid_action", message: error.message } }, headers); return; }
    if (error instanceof HttpRequestError) { sendJson(response, error.status, { error: { code: error.code, message: error.message } }, headers); return; }
    throw error;
  }
}
