import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import type { DungeonCompleteRequest } from "@cardastika/shared";
import { authenticateRoutePlayer, isAuthFailure, type RouteAuthDependencies } from "../auth/routeAuth.js";
import { HttpRequestError, readJsonBody, sendJson } from "../http/json.js";
import { PlayerPersistenceError } from "../users/playerRepository.js";
import {
  DungeonCannotCompleteError,
  DungeonPersistenceError,
  DungeonRunMissingError,
  DungeonService,
} from "./dungeonService.js";
import { InvalidDungeonMovesError } from "./dungeonConfig.js";

interface DungeonRouteDependencies extends RouteAuthDependencies {
  dungeon: DungeonService;
  responseHeaders?: OutgoingHttpHeaders;
}

async function authenticatePlayer(request: IncomingMessage, dependencies: DungeonRouteDependencies) {
  return (await authenticateRoutePlayer(request, dependencies)).player;
}

export function isDungeonCompleteRequest(value: unknown): value is DungeonCompleteRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 1
    && Array.isArray(record.moves)
    && record.moves.length > 0
    && record.moves.length <= 44
    && record.moves.every((move) => typeof move === "string" && Boolean(move.trim()));
}

function sendDungeonError(response: ServerResponse, error: unknown, headers: OutgoingHttpHeaders) {
  if (error instanceof HttpRequestError) {
    sendJson(response, error.status, { error: { code: error.code, message: error.message } }, headers);
    return;
  }
  if (isAuthFailure(error)) {
    sendJson(response, 401, { error: { code: error.code, message: "Telegram authentication failed" } }, headers);
    return;
  }
  if (error instanceof DungeonRunMissingError) {
    sendJson(response, 404, { error: { code: "dungeon_run_not_found", message: error.message } }, headers);
    return;
  }
  if (error instanceof InvalidDungeonMovesError || error instanceof DungeonCannotCompleteError) {
    sendJson(response, 409, { error: { code: "invalid_dungeon_result", message: error.message } }, headers);
    return;
  }
  if (error instanceof PlayerPersistenceError || error instanceof DungeonPersistenceError) {
    console.error("Database unavailable during dungeon request");
    sendJson(response, 503, { error: { code: "database_unavailable", message: "Dungeon service is unavailable" } }, headers);
    return;
  }
  console.error("Unexpected dungeon failure");
  sendJson(response, 500, { error: { code: "internal_error", message: "Unexpected server failure" } }, headers);
}

export async function handleDungeonStart(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: DungeonRouteDependencies,
) {
  const headers = dependencies.responseHeaders ?? {};
  if (request.method !== "POST") {
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, headers);
    return;
  }
  try {
    const player = await authenticatePlayer(request, dependencies);
    sendJson(response, 200, await dependencies.dungeon.start(player.id), headers);
  } catch (error) {
    sendDungeonError(response, error, headers);
  }
}

export async function handleDungeonComplete(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: DungeonRouteDependencies,
  runId: string,
) {
  const headers = dependencies.responseHeaders ?? {};
  if (request.method !== "POST") {
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, headers);
    return;
  }
  try {
    const player = await authenticatePlayer(request, dependencies);
    const body = await readJsonBody(request);
    if (!isDungeonCompleteRequest(body)) {
      throw new HttpRequestError(400, "invalid_dungeon_result", "moves must contain tile ids only");
    }
    sendJson(response, 200, await dependencies.dungeon.complete(player.id, runId, body.moves), headers);
  } catch (error) {
    sendDungeonError(response, error, headers);
  }
}
