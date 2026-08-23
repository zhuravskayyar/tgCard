import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import type { AbsorbCardsRequest, PlayerSummary } from "@cardastika/shared";
import { TelegramInitDataError, validateTelegramInitData } from "../auth/telegramInitData.js";
import { HttpRequestError, readJsonBody, sendJson } from "../http/json.js";
import { InventoryPersistenceError } from "../inventory/inventoryRepository.js";
import { PlayerPersistenceError } from "../users/playerRepository.js";
import {
  CardProgressionDomainError,
  CardProgressionPersistenceError,
  type CardProgressionService,
} from "./cardProgressionService.js";

export type CardProgressionRouteAction =
  | "detail"
  | "absorption-candidates"
  | "absorption-preview"
  | "absorb"
  | "level-up";

interface PlayerLookup {
  findOrCreateFromTelegram(user: ReturnType<typeof validateTelegramInitData>): Promise<PlayerSummary>;
}

interface CardProgressionRouteDependencies {
  botToken: string;
  players: PlayerLookup;
  progression: Pick<
    CardProgressionService,
    "getDetail" | "getAbsorptionCandidates" | "previewAbsorption" | "absorb" | "levelUp"
  >;
  responseHeaders?: OutgoingHttpHeaders;
}

function readTelegramInitData(request: IncomingMessage) {
  const authorization = request.headers.authorization?.trim();
  if (!authorization?.startsWith("tma ")) throw new TelegramInitDataError("missing_init_data");
  return authorization.slice(4).trim();
}

function readPage(request: IncomingMessage) {
  const url = new URL(request.url ?? "/", "http://localhost");
  const page = Number(url.searchParams.get("page") ?? "1");
  const limit = Number(url.searchParams.get("limit") ?? "9");
  if (!Number.isSafeInteger(page) || page < 1 || limit !== 9) {
    throw new HttpRequestError(400, "invalid_pagination", "Absorption candidates use positive pages of exactly 9 cards");
  }
  return page;
}

export function isAbsorbCardsRequest(value: unknown): value is AbsorbCardsRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 1
    && Array.isArray(record.fodderInstanceIds)
    && record.fodderInstanceIds.length > 0
    && record.fodderInstanceIds.every((id) => typeof id === "string" && Boolean(id));
}

function sendError(response: ServerResponse, error: unknown, headers: OutgoingHttpHeaders) {
  if (error instanceof HttpRequestError) {
    sendJson(response, error.status, { error: { code: error.code, message: error.message } }, headers);
    return;
  }
  if (error instanceof TelegramInitDataError) {
    sendJson(response, 401, { error: { code: error.code, message: "Telegram authentication failed" } }, headers);
    return;
  }
  if (error instanceof CardProgressionDomainError) {
    const status = error.code === "target_not_found" ? 404
      : error.code === "unsupported_level_data" ? 422
        : 409;
    sendJson(response, status, { error: { code: error.code, message: error.message } }, headers);
    return;
  }
  if (
    error instanceof PlayerPersistenceError
    || error instanceof InventoryPersistenceError
    || error instanceof CardProgressionPersistenceError
  ) {
    sendJson(response, 503, {
      error: { code: "database_unavailable", message: "Card progression service is unavailable" },
    }, headers);
    return;
  }
  console.error("Unexpected card progression failure");
  sendJson(response, 500, { error: { code: "internal_error", message: "Unexpected server failure" } }, headers);
}

export async function handleCardProgressionRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: CardProgressionRouteDependencies,
  instanceId: string,
  action: CardProgressionRouteAction,
) {
  const headers = dependencies.responseHeaders ?? {};
  try {
    const telegramUser = validateTelegramInitData(readTelegramInitData(request), dependencies.botToken);
    const player = await dependencies.players.findOrCreateFromTelegram(telegramUser);

    if (action === "detail" && request.method === "GET") {
      sendJson(response, 200, await dependencies.progression.getDetail(player.id, instanceId), headers);
      return;
    }
    if (action === "absorption-candidates" && request.method === "GET") {
      sendJson(
        response,
        200,
        await dependencies.progression.getAbsorptionCandidates(player.id, instanceId, readPage(request)),
        headers,
      );
      return;
    }
    if ((action === "absorption-preview" || action === "absorb") && request.method === "POST") {
      const body = await readJsonBody(request);
      if (!isAbsorbCardsRequest(body)) {
        throw new HttpRequestError(400, "invalid_absorption_request", "Only non-empty fodderInstanceIds may be submitted");
      }
      const result = action === "absorption-preview"
        ? await dependencies.progression.previewAbsorption(player.id, instanceId, body.fodderInstanceIds)
        : await dependencies.progression.absorb(player.id, instanceId, body.fodderInstanceIds);
      sendJson(response, 200, result, headers);
      return;
    }
    if (action === "level-up" && request.method === "POST") {
      sendJson(response, 200, await dependencies.progression.levelUp(player.id, instanceId), headers);
      return;
    }
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, headers);
  } catch (error) {
    sendError(response, error, headers);
  }
}
