import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import { isGuardianDragonHikeHours } from "@cardastika/game-core";
import type { CardElement, GuardianDragonFeedResponse, GuardianDragonFightResponse, GuardianDragonHikeHoursValue, GuardianDragonRatingResponse, GuardianDragonView } from "@cardastika/shared";
import { authenticateRoutePlayer, isAuthFailure, type RouteAuthDependencies } from "../auth/routeAuth.js";
import { HttpRequestError, readJsonBody, sendJson } from "../http/json.js";
import { PlayerPersistenceError } from "../users/playerRepository.js";
import { GuardianDragonLockedError, GuardianDragonPersistenceError, GuardianDragonStateError } from "./guardianDragonService.js";

interface GuardianDragonOperations {
  getDragon(playerId: string): Promise<GuardianDragonView>;
  feed(playerId: string, instanceIds?: readonly string[], element?: CardElement): Promise<GuardianDragonFeedResponse>;
  startHike(playerId: string, hours: GuardianDragonHikeHoursValue): Promise<GuardianDragonView>;
  cancelHike(playerId: string): Promise<GuardianDragonView>;
  fight(playerId: string, expectedPrice?: number): Promise<GuardianDragonFightResponse>;
  getRating(playerId: string, page: number): Promise<GuardianDragonRatingResponse>;
}

interface GuardianDragonRouteDependencies extends RouteAuthDependencies {
  guardianDragon: GuardianDragonOperations;
  responseHeaders?: OutgoingHttpHeaders;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ELEMENTS = new Set(["fire", "water", "earth", "air"]);

export function readFeedElement(body: unknown): CardElement | undefined {
  const element = body && typeof body === "object" ? (body as Record<string, unknown>).element : undefined;
  if (element === undefined) return undefined;
  if (typeof element !== "string" || !ELEMENTS.has(element)) throw new HttpRequestError(400, "invalid_request", "element must be fire, water, earth or air");
  return element as CardElement;
}

export function readFeedInstanceIds(body: unknown): string[] | undefined {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpRequestError(400, "invalid_request", "Feed body must be an object");
  const ids = (body as Record<string, unknown>).instanceIds;
  if (ids === undefined) return undefined;
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || !ids.every((id) => typeof id === "string" && UUID.test(id))) {
    throw new HttpRequestError(400, "invalid_request", "instanceIds must be 1-100 card instance ids");
  }
  return ids as string[];
}

function sendError(response: ServerResponse, error: unknown, headers: OutgoingHttpHeaders) {
  if (error instanceof HttpRequestError) return sendJson(response, error.status, { error: { code: error.code, message: error.message } }, headers);
  if (isAuthFailure(error)) return sendJson(response, 401, { error: { code: error.code, message: "Telegram authentication failed" } }, headers);
  if (error instanceof GuardianDragonLockedError) return sendJson(response, 403, { error: { code: "guardian_dragon_locked", message: error.message } }, headers);
  if (error instanceof GuardianDragonStateError) return sendJson(response, 409, { error: { code: error.code, message: error.message } }, headers);
  if (error instanceof GuardianDragonPersistenceError || error instanceof PlayerPersistenceError) {
    return sendJson(response, 503, { error: { code: "database_unavailable", message: "Guardian dragon is unavailable" } }, headers);
  }
  return sendJson(response, 500, { error: { code: "internal_error", message: "Guardian dragon request failed" } }, headers);
}

export async function handleGuardianDragonRequest(request: IncomingMessage, response: ServerResponse, dependencies: GuardianDragonRouteDependencies) {
  const headers = dependencies.responseHeaders ?? {};
  const { pathname, searchParams } = new URL(request.url ?? "/api/guardian-dragon", "http://localhost");
  try {
    const { player } = await authenticateRoutePlayer(request, dependencies);
    const dragon = dependencies.guardianDragon;
    if (request.method === "GET" && pathname === "/api/guardian-dragon") {
      return sendJson(response, 200, await dragon.getDragon(player.id), headers);
    }
    if (request.method === "POST" && pathname === "/api/guardian-dragon/feed") {
      const body = await readJsonBody(request);
      return sendJson(response, 200, await dragon.feed(player.id, readFeedInstanceIds(body), readFeedElement(body)), headers);
    }
    if (request.method === "POST" && pathname === "/api/guardian-dragon/hike") {
      const body = await readJsonBody(request);
      const hours = body && typeof body === "object" ? (body as Record<string, unknown>).hours : undefined;
      if (!isGuardianDragonHikeHours(hours)) throw new HttpRequestError(400, "invalid_request", "hours must be 2, 4 or 8");
      return sendJson(response, 200, await dragon.startHike(player.id, hours), headers);
    }
    if (request.method === "POST" && pathname === "/api/guardian-dragon/fight") {
      const body = await readJsonBody(request);
      const expected = body && typeof body === "object" ? (body as Record<string, unknown>).expectedPrice : undefined;
      if (expected !== undefined && (!Number.isSafeInteger(expected) || Number(expected) < 0)) throw new HttpRequestError(400, "invalid_request", "expectedPrice must be a non-negative whole number");
      return sendJson(response, 200, await dragon.fight(player.id, expected as number | undefined), headers);
    }
    if (request.method === "GET" && pathname === "/api/guardian-dragon/rating") {
      const page = Number(searchParams.get("page") ?? "1");
      if (!Number.isSafeInteger(page) || page < 1) throw new HttpRequestError(400, "invalid_request", "page must be a positive whole number");
      return sendJson(response, 200, await dragon.getRating(player.id, page), headers);
    }
    if (request.method === "POST" && pathname === "/api/guardian-dragon/hike/cancel") {
      return sendJson(response, 200, await dragon.cancelHike(player.id), headers);
    }
    sendJson(response, 404, { error: { code: "not_found", message: "Unknown guardian dragon route" } }, headers);
  } catch (error) {
    sendError(response, error, headers);
  }
}
