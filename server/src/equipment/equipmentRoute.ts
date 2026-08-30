import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import {
  type PlayerEquipmentResponse,
  type PlayerEquipmentUpdateRequest,
} from "@cardastika/shared";
import { authenticateRoutePlayer, isAuthFailure, type RouteAuthDependencies } from "../auth/routeAuth.js";
import { HttpRequestError, readJsonBody, sendJson } from "../http/json.js";
import { PlayerPersistenceError, type PlayerRepository } from "../users/playerRepository.js";
import { EquipmentValidationError, toPublicPlayerEquipment } from "./equipmentState.js";

interface EquipmentRouteDependencies extends RouteAuthDependencies {
  players: Pick<PlayerRepository, "findOrCreateFromTelegram" | "updateEquipment" | "getEquipmentInventory">;
  responseHeaders?: OutgoingHttpHeaders;
}

function isEquipmentUpdateRequest(value: unknown): value is PlayerEquipmentUpdateRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 1 && Boolean(record.equipped && typeof record.equipped === "object" && !Array.isArray(record.equipped));
}

function sendEquipmentError(response: ServerResponse, error: unknown, headers: OutgoingHttpHeaders) {
  if (error instanceof HttpRequestError) {
    sendJson(response, error.status, { error: { code: error.code, message: error.message } }, headers);
    return;
  }
  if (isAuthFailure(error)) {
    sendJson(response, 401, { error: { code: error.code, message: "Telegram authentication failed" } }, headers);
    return;
  }
  if (error instanceof EquipmentValidationError) {
    sendJson(response, 400, { error: { code: "invalid_equipment", message: error.message } }, headers);
    return;
  }
  if (error instanceof PlayerPersistenceError) {
    sendJson(response, 503, { error: { code: "database_unavailable", message: "Equipment is unavailable" } }, headers);
    return;
  }
  console.error("Unexpected equipment request failure", error);
  sendJson(response, 500, { error: { code: "internal_error", message: "Unexpected server failure" } }, headers);
}

export async function handlePlayerEquipment(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: EquipmentRouteDependencies,
) {
  const headers = dependencies.responseHeaders ?? {};
  try {
    const { player } = await authenticateRoutePlayer(request, dependencies);
    if (request.method === "GET") {
      const result: PlayerEquipmentResponse = {
        equipment: player.equipment ?? toPublicPlayerEquipment(player.id, null),
        inventory: await dependencies.players.getEquipmentInventory(player.id),
      };
      sendJson(response, 200, result, headers);
      return;
    }
    if (request.method !== "PUT") {
      sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, headers);
      return;
    }
    const body = await readJsonBody(request);
    if (!isEquipmentUpdateRequest(body)) throw new HttpRequestError(400, "invalid_equipment", "equipped is required");
    const equipment = await dependencies.players.updateEquipment(player.id, body.equipped);
    const result: PlayerEquipmentResponse = {
      equipment: { equipped: equipment.equipped },
      inventory: await dependencies.players.getEquipmentInventory(player.id),
    };
    sendJson(response, 200, result, headers);
  } catch (error) {
    sendEquipmentError(response, error, headers);
  }
}
