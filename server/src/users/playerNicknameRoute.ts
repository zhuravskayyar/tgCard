import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import { parsePlayerAvatarId, toPlayerAvatarId, type PlayerAvatarUpdateResponse, type PlayerNicknameUpdateResponse } from "@cardastika/shared";
import { authenticateRoutePlayer, isAuthFailure, type RouteAuthDependencies } from "../auth/routeAuth.js";
import { HttpRequestError, readJsonBody, sendJson } from "../http/json.js";
import { PlayerNicknameValidationError, PlayerPersistenceError, type PlayerRepository } from "./playerRepository.js";

interface PlayerNicknameRouteDependencies extends RouteAuthDependencies {
  players: Pick<PlayerRepository, "findOrCreateFromTelegram" | "updateAvatar" | "updateNickname">;
  responseHeaders?: OutgoingHttpHeaders;
}

function readNickname(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body) || typeof (body as { nickname?: unknown }).nickname !== "string") {
    throw new HttpRequestError(400, "invalid_nickname", "nickname is required");
  }
  return (body as { nickname: string }).nickname;
}

function sendNicknameError(response: ServerResponse, error: unknown, headers: OutgoingHttpHeaders) {
  if (error instanceof HttpRequestError) {
    sendJson(response, error.status, { error: { code: error.code, message: error.message } }, headers);
    return;
  }
  if (isAuthFailure(error)) {
    sendJson(response, 401, { error: { code: error.code, message: "Authentication failed" } }, headers);
    return;
  }
  if (error instanceof PlayerNicknameValidationError) {
    sendJson(response, 400, {
      error: {
        code: error.code,
        message: error.code === "nickname_too_long" ? "Nickname must be 10 characters or fewer" : "Nickname is required",
      },
    }, headers);
    return;
  }
  if (error instanceof PlayerPersistenceError) {
    sendJson(response, 503, { error: { code: "database_unavailable", message: "Player profile service is unavailable" } }, headers);
    return;
  }
  console.error("Unexpected nickname update failure", error);
  sendJson(response, 500, { error: { code: "internal_error", message: "Unexpected server failure" } }, headers);
}

export async function handlePlayerNickname(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: PlayerNicknameRouteDependencies,
) {
  const headers = dependencies.responseHeaders ?? {};
  if (request.method !== "POST") {
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, headers);
    return;
  }

  try {
    const { player } = await authenticateRoutePlayer(request, dependencies);
    const nickname = readNickname(await readJsonBody(request));
    const result: PlayerNicknameUpdateResponse = await dependencies.players.updateNickname(player.id, nickname);
    sendJson(response, 200, result, headers);
  } catch (error) {
    sendNicknameError(response, error, headers);
  }
}

function readAvatar(body: unknown) {
  const value = body && typeof body === "object" && !Array.isArray(body) ? (body as { avatar?: unknown }).avatar : undefined;
  const index = typeof value === "string" ? parsePlayerAvatarId(value) : null;
  if (index === null) throw new HttpRequestError(400, "invalid_avatar", "avatar must be one of the game portraits");
  return toPlayerAvatarId(index);
}

export async function handlePlayerAvatar(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: PlayerNicknameRouteDependencies,
) {
  const headers = dependencies.responseHeaders ?? {};
  if (request.method !== "POST") {
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, headers);
    return;
  }

  try {
    const { player } = await authenticateRoutePlayer(request, dependencies);
    const avatar = readAvatar(await readJsonBody(request));
    const result: PlayerAvatarUpdateResponse = await dependencies.players.updateAvatar(player.id, avatar);
    sendJson(response, 200, result, headers);
  } catch (error) {
    sendNicknameError(response, error, headers);
  }
}
