import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import type { CardWorkshopCraftRequest } from "@cardastika/shared";
import { authenticateRoutePlayer, isAuthFailure, type RouteAuthDependencies } from "../auth/routeAuth.js";
import { HttpRequestError, readJsonBody, sendJson } from "../http/json.js";
import { PlayerPersistenceError } from "../users/playerRepository.js";
import {
  CardWorkshopPersistenceError,
  CardWorkshopService,
  InsufficientCardShardsError,
  WorkshopCardMissingError,
  WorkshopCatalogUnavailableError,
  WorkshopPlayerMissingError,
} from "./cardWorkshopService.js";

interface CardWorkshopRouteDependencies extends RouteAuthDependencies {
  responseHeaders?: OutgoingHttpHeaders;
  workshop: CardWorkshopService;
}

async function authenticatePlayer(request: IncomingMessage, dependencies: CardWorkshopRouteDependencies) {
  return (await authenticateRoutePlayer(request, dependencies)).player;
}

export function isCardWorkshopCraftRequest(value: unknown): value is CardWorkshopCraftRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 1 && typeof record.cardId === "string" && Boolean(record.cardId.trim());
}

function sendWorkshopError(response: ServerResponse, error: unknown, headers: OutgoingHttpHeaders) {
  if (error instanceof HttpRequestError) {
    sendJson(response, error.status, { error: { code: error.code, message: error.message } }, headers);
    return;
  }
  if (isAuthFailure(error)) {
    sendJson(response, 401, { error: { code: error.code, message: "Telegram authentication failed" } }, headers);
    return;
  }
  if (error instanceof WorkshopCardMissingError) {
    sendJson(response, 409, { error: { code: "card_not_in_rotation", message: error.message } }, headers);
    return;
  }
  if (error instanceof InsufficientCardShardsError) {
    sendJson(response, 409, { error: { code: "insufficient_card_shards", message: error.message } }, headers);
    return;
  }
  if (error instanceof WorkshopCatalogUnavailableError) {
    sendJson(response, 503, { error: { code: "workshop_unavailable", message: "Workshop rotation is unavailable" } }, headers);
    return;
  }
  if (
    error instanceof PlayerPersistenceError ||
    error instanceof WorkshopPlayerMissingError ||
    error instanceof CardWorkshopPersistenceError
  ) {
    console.error("Database unavailable during card workshop request");
    sendJson(response, 503, { error: { code: "database_unavailable", message: "Card workshop is unavailable" } }, headers);
    return;
  }
  console.error("Unexpected card workshop failure");
  sendJson(response, 500, { error: { code: "internal_error", message: "Unexpected server failure" } }, headers);
}

export async function handleCardWorkshopCatalog(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: CardWorkshopRouteDependencies,
) {
  const headers = dependencies.responseHeaders ?? {};
  if (request.method !== "GET") {
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, headers);
    return;
  }
  try {
    const player = await authenticatePlayer(request, dependencies);
    sendJson(response, 200, await dependencies.workshop.getCatalog(player.id), headers);
  } catch (error) {
    sendWorkshopError(response, error, headers);
  }
}

export async function handleCardWorkshopCraft(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: CardWorkshopRouteDependencies,
) {
  const headers = dependencies.responseHeaders ?? {};
  if (request.method !== "POST") {
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, headers);
    return;
  }
  try {
    const player = await authenticatePlayer(request, dependencies);
    const body = await readJsonBody(request);
    if (!isCardWorkshopCraftRequest(body)) {
      throw new HttpRequestError(400, "invalid_craft_request", "Only cardId may be submitted");
    }
    sendJson(response, 200, await dependencies.workshop.craft(player.id, body.cardId), headers);
  } catch (error) {
    sendWorkshopError(response, error, headers);
  }
}
