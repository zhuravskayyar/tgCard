import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import type { InvasionAttackRequest, InvasionGuildRatingResponse, InvasionStrikeRequest, InvasionSwapRequest, InvasionView } from "@cardastika/shared";
import { authenticateRoutePlayer, isAuthFailure, type RouteAuthDependencies } from "../auth/routeAuth.js";
import { HttpRequestError, readJsonBody, sendJson } from "../http/json.js";
import { PlayerPersistenceError } from "../users/playerRepository.js";
import { InvasionDomainError, InvasionPersistenceError } from "./invasionService.js";

interface InvasionOperations {
  getView(playerId: string): Promise<InvasionView>;
  attack(playerId: string, input: InvasionAttackRequest): Promise<InvasionView>;
  autoBattle(playerId: string, input: InvasionAttackRequest): Promise<InvasionView>;
  strike(playerId: string, input: InvasionStrikeRequest): Promise<InvasionView>;
  swap(playerId: string, input: InvasionSwapRequest): Promise<InvasionView>;
  activatePermit(playerId: string): Promise<InvasionView>;
  getGuildRating(): Promise<InvasionGuildRatingResponse>;
}

interface InvasionRouteDependencies extends RouteAuthDependencies {
  invasion: InvasionOperations;
  responseHeaders?: OutgoingHttpHeaders;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bodyObject(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpRequestError(400, "invalid_request", "Request body must be an object");
  return body as Record<string, unknown>;
}

export function readAttackRequest(body: unknown): InvasionAttackRequest {
  const { expectedGold } = bodyObject(body);
  if (!Number.isSafeInteger(expectedGold) || Number(expectedGold) < 0) throw new HttpRequestError(400, "invalid_request", "expectedGold must be a non-negative whole number");
  return { expectedGold: Number(expectedGold) };
}

function readBattleRequest(body: unknown) {
  const { battleId, expectedVersion } = bodyObject(body);
  if (typeof battleId !== "string" || !UUID.test(battleId)) throw new HttpRequestError(400, "invalid_request", "battleId must be a battle id");
  if (!Number.isSafeInteger(expectedVersion) || Number(expectedVersion) < 1) throw new HttpRequestError(400, "invalid_request", "expectedVersion must be a positive whole number");
  return { battleId, expectedVersion: Number(expectedVersion) };
}

export function readStrikeRequest(body: unknown): InvasionStrikeRequest {
  const slotIndex = bodyObject(body).slotIndex;
  if (slotIndex !== 0 && slotIndex !== 1 && slotIndex !== 2) throw new HttpRequestError(400, "invalid_request", "slotIndex must be 0, 1 or 2");
  return { ...readBattleRequest(body), slotIndex };
}

function sendError(response: ServerResponse, error: unknown, headers: OutgoingHttpHeaders) {
  if (error instanceof HttpRequestError) return sendJson(response, error.status, { error: { code: error.code, message: error.message } }, headers);
  if (isAuthFailure(error)) return sendJson(response, 401, { error: { code: "unauthorized", message: "Authentication failed" } }, headers);
  if (error instanceof InvasionDomainError) return sendJson(response, error.status, { error: { code: error.code, message: error.message } }, headers);
  if (error instanceof InvasionPersistenceError || error instanceof PlayerPersistenceError) {
    return sendJson(response, 503, { error: { code: "database_unavailable", message: "Invasion is unavailable" } }, headers);
  }
  console.error("Invasion request failed", error);
  return sendJson(response, 500, { error: { code: "internal_error", message: "Invasion request failed" } }, headers);
}

export async function handleInvasionRequest(request: IncomingMessage, response: ServerResponse, dependencies: InvasionRouteDependencies) {
  const headers = dependencies.responseHeaders ?? {};
  const { pathname } = new URL(request.url ?? "/api/invasion", "http://localhost");
  try {
    const { player } = await authenticateRoutePlayer(request, dependencies);
    const invasion = dependencies.invasion;
    if (request.method === "GET" && pathname === "/api/invasion") return sendJson(response, 200, await invasion.getView(player.id), headers);
    if (request.method === "GET" && pathname === "/api/invasion/guilds") return sendJson(response, 200, await invasion.getGuildRating(), headers);
    if (request.method === "POST" && pathname === "/api/invasion/attack") {
      return sendJson(response, 200, await invasion.attack(player.id, readAttackRequest(await readJsonBody(request))), headers);
    }
    if (request.method === "POST" && pathname === "/api/invasion/auto") {
      return sendJson(response, 200, await invasion.autoBattle(player.id, readAttackRequest(await readJsonBody(request))), headers);
    }
    if (request.method === "POST" && pathname === "/api/invasion/permit") return sendJson(response, 200, await invasion.activatePermit(player.id), headers);
    if (request.method === "POST" && pathname === "/api/invasion/strike") {
      return sendJson(response, 200, await invasion.strike(player.id, readStrikeRequest(await readJsonBody(request))), headers);
    }
    if (request.method === "POST" && pathname === "/api/invasion/swap") {
      return sendJson(response, 200, await invasion.swap(player.id, readBattleRequest(await readJsonBody(request))), headers);
    }
    sendJson(response, 404, { error: { code: "not_found", message: "Unknown invasion route" } }, headers);
  } catch (error) {
    sendError(response, error, headers);
  }
}
