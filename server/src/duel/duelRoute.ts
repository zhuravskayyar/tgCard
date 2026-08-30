import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import type {
  DuelActionRequest,
  DuelSearchResponse,
  DuelStartRequest,
  DuelView,
} from "@cardastika/shared";
import { authenticateRoutePlayer, isAuthFailure, type RouteAuthDependencies } from "../auth/routeAuth.js";
import { HttpRequestError, readJsonBody, sendJson } from "../http/json.js";
import { PlayerPersistenceError } from "../users/playerRepository.js";
import {
  DuelAlreadyActiveError,
  DuelDeckInvalidError,
  DuelMissingError,
  DuelNoOpponentFoundError,
  DuelSearchInvalidError,
  DuelStateConflictError,
  DuelTutorialActionError,
} from "./duelService.js";

interface DuelOperations {
  action(playerId: string, duelId: string, input: DuelActionRequest): Promise<DuelView>;
  findActive(playerId: string): Promise<DuelView | null>;
  findById(playerId: string, duelId: string): Promise<DuelView>;
  search(playerId: string): Promise<DuelSearchResponse>;
  start(playerId: string, searchId: string, tutorial?: boolean): Promise<DuelView>;
}

interface DuelRouteDependencies extends RouteAuthDependencies {
  duels: DuelOperations;
  responseHeaders?: OutgoingHttpHeaders;
}

function isStartRequest(value: unknown): value is DuelStartRequest {
  return Boolean(value)
    && typeof value === "object"
    && typeof (value as Record<string, unknown>).searchId === "string"
    && Boolean(String((value as Record<string, unknown>).searchId).trim())
    && ((value as Record<string, unknown>).tutorial === undefined || typeof (value as Record<string, unknown>).tutorial === "boolean");
}

function isActionRequest(value: unknown): value is DuelActionRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return (body.slotIndex === 0 || body.slotIndex === 1 || body.slotIndex === 2)
    && Number.isSafeInteger(body.expectedVersion)
    && Number(body.expectedVersion) >= 1;
}

function sendDuelError(
  response: ServerResponse,
  error: unknown,
  headers: OutgoingHttpHeaders,
) {
  if (error instanceof HttpRequestError) {
    sendJson(response, error.status, { error: { code: error.code, message: error.message } }, headers);
    return true;
  }
  if (isAuthFailure(error)) {
    sendJson(response, 401, { error: { code: error.code, message: "Telegram authentication failed" } }, headers);
    return true;
  }
  if (error instanceof DuelNoOpponentFoundError) {
    sendJson(response, 404, { error: { code: "no_opponent_found", message: error.message } }, headers);
    return true;
  }
  if (error instanceof DuelAlreadyActiveError) {
    sendJson(response, 409, { error: { code: "active_duel_exists", message: error.message } }, headers);
    return true;
  }
  if (error instanceof DuelDeckInvalidError) {
    sendJson(response, 409, { error: { code: "invalid_battle_deck", message: error.message } }, headers);
    return true;
  }
  if (error instanceof DuelSearchInvalidError) {
    sendJson(response, 409, { error: { code: "duel_search_invalid", message: error.message } }, headers);
    return true;
  }
  if (error instanceof DuelStateConflictError) {
    sendJson(response, 409, { error: { code: "duel_state_conflict", message: error.message } }, headers);
    return true;
  }
  if (error instanceof DuelTutorialActionError) {
    sendJson(response, 409, { error: { code: "tutorial_action_invalid", message: error.message } }, headers);
    return true;
  }
  if (error instanceof DuelMissingError) {
    sendJson(response, 404, { error: { code: "duel_not_found", message: error.message } }, headers);
    return true;
  }
  if (error instanceof PlayerPersistenceError) {
    sendJson(response, 503, { error: { code: "database_unavailable", message: "Duel service is unavailable" } }, headers);
    return true;
  }
  return false;
}

export async function handleDuelRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: DuelRouteDependencies,
) {
  const headers = dependencies.responseHeaders ?? {};
  const url = new URL(request.url ?? "/api/duel", "http://localhost");
  const duelMatch = url.pathname.match(/^\/api\/duel\/([^/]+)$/);
  const actionMatch = url.pathname.match(/^\/api\/duel\/([^/]+)\/action$/);

  try {
    const { player } = await authenticateRoutePlayer(request, dependencies);

    if (request.method === "POST" && url.pathname === "/api/duel/search") {
      sendJson(response, 200, await dependencies.duels.search(player.id), headers);
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/duel/start") {
      const body = await readJsonBody(request);
      if (!isStartRequest(body)) throw new HttpRequestError(400, "invalid_duel_start", "searchId is required");
      sendJson(response, 201, await dependencies.duels.start(player.id, body.searchId, body.tutorial === true), headers);
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/duel/active") {
      sendJson(response, 200, { duel: await dependencies.duels.findActive(player.id) }, headers);
      return;
    }
    if (request.method === "POST" && actionMatch) {
      const body = await readJsonBody(request);
      if (!isActionRequest(body)) {
        throw new HttpRequestError(400, "invalid_duel_action", "slotIndex and expectedVersion are required");
      }
      sendJson(
        response,
        200,
        await dependencies.duels.action(player.id, decodeURIComponent(actionMatch[1]!), body),
        headers,
      );
      return;
    }
    if (request.method === "GET" && duelMatch && duelMatch[1] !== "active") {
      sendJson(response, 200, await dependencies.duels.findById(player.id, decodeURIComponent(duelMatch[1]!)), headers);
      return;
    }
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, headers);
  } catch (error) {
    if (sendDuelError(response, error, headers)) return;
    console.error("Unexpected Duel request failure", error);
    sendJson(response, 500, { error: { code: "internal_error", message: "Unexpected server failure" } }, headers);
  }
}
