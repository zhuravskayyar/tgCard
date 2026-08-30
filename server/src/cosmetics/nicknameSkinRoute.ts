import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import {
  NICKNAME_SKIN_IDS,
  type EquipNicknameSkinRequest,
  type NicknameSkinId,
} from "@cardastika/shared";
import { authenticateRoutePlayer, isAuthFailure, type RouteAuthDependencies } from "../auth/routeAuth.js";
import { HttpRequestError, readJsonBody, sendJson } from "../http/json.js";
import {
  NicknameSkinAlreadyOwnedError,
  NicknameSkinChoiceInvalidError,
  NicknameSkinInsufficientTokensError,
  NicknameSkinNotOwnedError,
  NicknameSkinPersistenceError,
  NicknameSkinPlayerMissingError,
  type NicknameSkinService,
} from "./nicknameSkinService.js";

interface NicknameSkinRouteDependencies extends RouteAuthDependencies {
  responseHeaders?: OutgoingHttpHeaders;
  skins: Pick<NicknameSkinService, "equip" | "getCatalog" | "getInventory" | "purchase">;
}

function isNicknameSkinId(value: unknown): value is NicknameSkinId {
  return typeof value === "string" && NICKNAME_SKIN_IDS.some((skinId) => skinId === value);
}

export function isNicknameSkinPurchaseRequest(value: unknown): value is { choiceId: NicknameSkinId } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 1 && isNicknameSkinId(record.choiceId);
}

export function isEquipNicknameSkinRequest(value: unknown): value is EquipNicknameSkinRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 1 && (record.skinId === null || isNicknameSkinId(record.skinId));
}

function sendNicknameSkinError(response: ServerResponse, error: unknown, headers: OutgoingHttpHeaders) {
  if (error instanceof HttpRequestError) {
    sendJson(response, error.status, { error: { code: error.code, message: error.message } }, headers);
    return;
  }
  if (isAuthFailure(error)) {
    sendJson(response, 401, { error: { code: error.code, message: "Telegram authentication failed" } }, headers);
    return;
  }
  if (error instanceof NicknameSkinChoiceInvalidError) {
    sendJson(response, 400, { error: { code: "invalid_nickname_skin", message: error.message } }, headers);
    return;
  }
  if (error instanceof NicknameSkinAlreadyOwnedError) {
    sendJson(response, 409, { error: { code: "nickname_skin_already_owned", message: error.message } }, headers);
    return;
  }
  if (error instanceof NicknameSkinInsufficientTokensError) {
    sendJson(response, 409, { error: { code: "insufficient_arena_tokens", message: error.message } }, headers);
    return;
  }
  if (error instanceof NicknameSkinNotOwnedError) {
    sendJson(response, 409, { error: { code: "nickname_skin_not_owned", message: error.message } }, headers);
    return;
  }
  if (error instanceof NicknameSkinPlayerMissingError || error instanceof NicknameSkinPersistenceError) {
    console.error("Database unavailable during nickname skin request");
    sendJson(response, 503, { error: { code: "database_unavailable", message: "Cosmetics service is unavailable" } }, headers);
    return;
  }
  console.error("Unexpected nickname skin failure");
  sendJson(response, 500, { error: { code: "internal_error", message: "Unexpected server failure" } }, headers);
}

export async function handleNicknameSkinCatalog(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: NicknameSkinRouteDependencies,
) {
  const headers = dependencies.responseHeaders ?? {};
  if (request.method !== "GET") {
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, headers);
    return;
  }
  try {
    const { player } = await authenticateRoutePlayer(request, dependencies);
    sendJson(response, 200, await dependencies.skins.getCatalog(player.id), headers);
  } catch (error) {
    sendNicknameSkinError(response, error, headers);
  }
}

export async function handlePlayerInventory(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: NicknameSkinRouteDependencies,
) {
  const headers = dependencies.responseHeaders ?? {};
  if (request.method !== "GET") {
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, headers);
    return;
  }
  try {
    const { player } = await authenticateRoutePlayer(request, dependencies);
    sendJson(response, 200, await dependencies.skins.getInventory(player.id), headers);
  } catch (error) {
    sendNicknameSkinError(response, error, headers);
  }
}

export async function handleNicknameSkinPurchase(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: NicknameSkinRouteDependencies,
) {
  const headers = dependencies.responseHeaders ?? {};
  if (request.method !== "POST") {
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, headers);
    return;
  }
  try {
    const { player } = await authenticateRoutePlayer(request, dependencies);
    const body = await readJsonBody(request);
    if (!isNicknameSkinPurchaseRequest(body)) {
      throw new HttpRequestError(400, "invalid_nickname_skin_purchase", "choiceId is required");
    }
    sendJson(response, 200, await dependencies.skins.purchase(player.id, body.choiceId), headers);
  } catch (error) {
    sendNicknameSkinError(response, error, headers);
  }
}

export async function handleEquipNicknameSkin(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: NicknameSkinRouteDependencies,
) {
  const headers = dependencies.responseHeaders ?? {};
  if (request.method !== "POST") {
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, headers);
    return;
  }
  try {
    const { player } = await authenticateRoutePlayer(request, dependencies);
    const body = await readJsonBody(request);
    if (!isEquipNicknameSkinRequest(body)) {
      throw new HttpRequestError(400, "invalid_nickname_skin_equip", "skinId must be a known skin or null");
    }
    sendJson(response, 200, await dependencies.skins.equip(player.id, body.skinId), headers);
  } catch (error) {
    sendNicknameSkinError(response, error, headers);
  }
}
