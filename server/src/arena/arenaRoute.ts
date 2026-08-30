import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import type {
  ArenaActionRequest,
  ActiveArenaResponse,
  ArenaProfileResponse,
  ArenaQueueResponse,
  ArenaShopCatalogResponse,
  ArenaShopPurchaseRequest,
  ArenaShopPurchaseResponse,
  ArenaVersionRequest,
  ArenaView,
} from "@cardastika/shared";
import { authenticateRoutePlayer, isAuthFailure, type RouteAuthDependencies } from "../auth/routeAuth.js";
import { HttpRequestError, readJsonBody, sendJson } from "../http/json.js";
import { PlayerPersistenceError } from "../users/playerRepository.js";
import {
  ArenaAlreadyActiveError,
  ArenaCosmeticUnavailableError,
  ArenaDeckInvalidError,
  ArenaInsufficientGoldError,
  ArenaInsufficientTokensError,
  ArenaMissingError,
  ArenaPlayerMissingError,
  ArenaShopOfferMissingError,
  ArenaStateConflictError,
} from "./arenaService.js";

interface ArenaOperations {
  action(playerId: string, matchId: string, input: ArenaActionRequest): Promise<ArenaView>;
  changeCards(playerId: string, matchId: string, input: ArenaVersionRequest): Promise<ArenaView>;
  changeTarget(playerId: string, matchId: string, input: ArenaVersionRequest): Promise<ArenaView>;
  findActive(playerId: string): Promise<ActiveArenaResponse>;
  getProfile(playerId: string): Promise<ArenaProfileResponse>;
  getShopCatalog(): Promise<ArenaShopCatalogResponse>;
  joinQueue(playerId: string): Promise<ArenaQueueResponse>;
  leaveQueue(playerId: string): Promise<{ left: boolean }>;
  purchase(playerId: string, offerId: string): Promise<ArenaShopPurchaseResponse>;
}

interface ArenaRouteDependencies extends RouteAuthDependencies {
  arena: ArenaOperations;
  responseHeaders?: OutgoingHttpHeaders;
}

function isVersionRequest(value: unknown): value is ArenaVersionRequest {
  if (!Boolean(value) || typeof value !== "object") return false;
  const body = value as unknown as Record<string, unknown>;
  return Number.isSafeInteger(body.expectedVersion)
    && Number(body.expectedVersion) >= 1
    && (body.targetId === undefined || (typeof body.targetId === "string" && Boolean(body.targetId.trim())));
}

function isActionRequest(value: unknown): value is ArenaActionRequest {
  return isVersionRequest(value)
    && ((value as unknown as Record<string, unknown>).slotIndex === 0
      || (value as unknown as Record<string, unknown>).slotIndex === 1
      || (value as unknown as Record<string, unknown>).slotIndex === 2);
}

function isPurchaseRequest(value: unknown): value is ArenaShopPurchaseRequest {
  return Boolean(value) && typeof value === "object"
    && typeof (value as Record<string, unknown>).offerId === "string"
    && Boolean(String((value as Record<string, unknown>).offerId).trim());
}

async function authenticate(request: IncomingMessage, dependencies: ArenaRouteDependencies) {
  return (await authenticateRoutePlayer(request, dependencies)).player;
}

function sendArenaError(response: ServerResponse, error: unknown, headers: OutgoingHttpHeaders) {
  if (error instanceof HttpRequestError) {
    sendJson(response, error.status, { error: { code: error.code, message: error.message } }, headers);
    return true;
  }
  if (isAuthFailure(error)) {
    sendJson(response, 401, { error: { code: error.code, message: "Telegram authentication failed" } }, headers);
    return true;
  }
  if (error instanceof ArenaAlreadyActiveError) return sendJson(response, 409, { error: { code: "arena_active_match", message: error.message } }, headers), true;
  if (error instanceof ArenaDeckInvalidError) return sendJson(response, 409, { error: { code: "invalid_battle_deck", message: error.message } }, headers), true;
  if (error instanceof ArenaStateConflictError) return sendJson(response, 409, { error: { code: "arena_state_conflict", message: error.message } }, headers), true;
  if (error instanceof ArenaMissingError) return sendJson(response, 404, { error: { code: "arena_not_found", message: error.message } }, headers), true;
  if (error instanceof ArenaInsufficientGoldError) return sendJson(response, 409, { error: { code: "insufficient_gold", message: error.message } }, headers), true;
  if (error instanceof ArenaShopOfferMissingError) return sendJson(response, 404, { error: { code: "arena_offer_not_found", message: error.message } }, headers), true;
  if (error instanceof ArenaInsufficientTokensError) return sendJson(response, 409, { error: { code: "insufficient_arena_tokens", message: error.message } }, headers), true;
  if (error instanceof ArenaCosmeticUnavailableError) return sendJson(response, 409, { error: { code: "arena_cosmetic_unavailable", message: error.message } }, headers), true;
  if (error instanceof ArenaPlayerMissingError) return sendJson(response, 404, { error: { code: "player_not_found", message: error.message } }, headers), true;
  if (error instanceof PlayerPersistenceError) {
    sendJson(response, 503, { error: { code: "database_unavailable", message: "Arena service is unavailable" } }, headers);
    return true;
  }
  return false;
}

export async function handleArenaRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ArenaRouteDependencies,
) {
  const headers = dependencies.responseHeaders ?? {};
  const url = new URL(request.url ?? "/api/arena", "http://localhost");
  const match = url.pathname.match(/^\/api\/arena\/matches\/([^/]+)(?:\/(action|target|cards))?$/);
  try {
    if (request.method === "GET" && url.pathname === "/api/arena/shop") {
      sendJson(response, 200, await dependencies.arena.getShopCatalog(), headers);
      return;
    }
    const player = await authenticate(request, dependencies);
    if (request.method === "GET" && url.pathname === "/api/arena/profile") {
      sendJson(response, 200, await dependencies.arena.getProfile(player.id), headers);
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/arena/active") {
      sendJson(response, 200, await dependencies.arena.findActive(player.id), headers);
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/arena/queue") {
      sendJson(response, 201, await dependencies.arena.joinQueue(player.id), headers);
      return;
    }
    if (request.method === "DELETE" && url.pathname === "/api/arena/queue") {
      sendJson(response, 200, await dependencies.arena.leaveQueue(player.id), headers);
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/arena/shop/purchase") {
      const body = await readJsonBody(request);
      if (!isPurchaseRequest(body)) throw new HttpRequestError(400, "invalid_arena_purchase", "offerId is required");
      sendJson(response, 200, await dependencies.arena.purchase(player.id, body.offerId), headers);
      return;
    }
    if (request.method === "POST" && match?.[1] && match[2]) {
      const body = await readJsonBody(request);
      if (match[2] === "action") {
        if (!isActionRequest(body)) throw new HttpRequestError(400, "invalid_arena_action", "slotIndex and expectedVersion are required");
        sendJson(response, 200, await dependencies.arena.action(player.id, decodeURIComponent(match[1]), body), headers);
        return;
      }
      if (!isVersionRequest(body)) throw new HttpRequestError(400, "invalid_arena_action", "expectedVersion is required");
      const result = match[2] === "target"
        ? await dependencies.arena.changeTarget(player.id, decodeURIComponent(match[1]), body)
        : await dependencies.arena.changeCards(player.id, decodeURIComponent(match[1]), body);
      sendJson(response, 200, result, headers);
      return;
    }
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, headers);
  } catch (error) {
    if (sendArenaError(response, error, headers)) return;
    console.error("Unexpected Arena request failure", error);
    sendJson(response, 500, { error: { code: "internal_error", message: "Unexpected server failure" } }, headers);
  }
}
