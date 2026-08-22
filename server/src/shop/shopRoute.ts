import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import type { PlayerSummary, ShopPurchaseRequest, ShopPurchaseResponse } from "@cardastika/shared";
import { TelegramInitDataError, validateTelegramInitData } from "../auth/telegramInitData.js";
import { HttpRequestError, readJsonBody, sendJson } from "../http/json.js";
import { PlayerPersistenceError } from "../users/playerRepository.js";
import { getPlayerFacingShopCatalog } from "./shopCatalog.js";
import {
  InsufficientShopFundsError,
  ShopOfferMissingError,
  ShopPersistenceError,
  ShopPlayerMissingError,
} from "./shopService.js";
import {
  ShopRewardPolicyUnavailableError,
  ShopRewardUnavailableError,
} from "./shopRewardSelector.js";

interface PlayerLookup {
  findOrCreateFromTelegram(user: ReturnType<typeof validateTelegramInitData>): Promise<PlayerSummary>;
}

interface ShopPurchaseService {
  purchase(playerId: string, offerId: string): Promise<ShopPurchaseResponse>;
}

interface ShopRouteDependencies {
  botToken: string;
  players: PlayerLookup;
  responseHeaders?: OutgoingHttpHeaders;
  shop: ShopPurchaseService;
}

function readTelegramInitData(request: IncomingMessage) {
  const authorization = request.headers.authorization?.trim();
  if (!authorization?.startsWith("tma ")) {
    throw new TelegramInitDataError("missing_init_data");
  }
  return authorization.slice(4).trim();
}

export function isShopPurchaseRequest(value: unknown): value is ShopPurchaseRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 1 && typeof record.offerId === "string" && Boolean(record.offerId.trim());
}

async function authenticatePlayer(request: IncomingMessage, dependencies: ShopRouteDependencies) {
  const initData = readTelegramInitData(request);
  const telegramUser = validateTelegramInitData(initData, dependencies.botToken);
  return dependencies.players.findOrCreateFromTelegram(telegramUser);
}

function sendShopError(
  response: ServerResponse,
  error: unknown,
  responseHeaders: OutgoingHttpHeaders,
) {
  if (error instanceof HttpRequestError) {
    sendJson(response, error.status, { error: { code: error.code, message: error.message } }, responseHeaders);
    return;
  }
  if (error instanceof TelegramInitDataError) {
    sendJson(response, 401, {
      error: { code: error.code, message: "Telegram authentication failed" },
    }, responseHeaders);
    return;
  }
  if (error instanceof ShopOfferMissingError) {
    sendJson(response, 404, { error: { code: "offer_not_found", message: error.message } }, responseHeaders);
    return;
  }
  if (error instanceof InsufficientShopFundsError) {
    sendJson(response, 409, {
      error: { code: `insufficient_${error.currency}`, message: error.message },
    }, responseHeaders);
    return;
  }
  if (error instanceof ShopRewardPolicyUnavailableError) {
    sendJson(response, 503, {
      error: { code: "reward_policy_unavailable", message: "Shop reward policy is unavailable" },
    }, responseHeaders);
    return;
  }
  if (error instanceof ShopRewardUnavailableError) {
    sendJson(response, 503, {
      error: { code: "reward_unavailable", message: "No eligible canonical reward is available" },
    }, responseHeaders);
    return;
  }
  if (
    error instanceof PlayerPersistenceError ||
    error instanceof ShopPersistenceError ||
    error instanceof ShopPlayerMissingError
  ) {
    console.error("Database unavailable during shop request");
    sendJson(response, 503, {
      error: { code: "database_unavailable", message: "Shop service is unavailable" },
    }, responseHeaders);
    return;
  }

  console.error("Unexpected shop failure");
  sendJson(response, 500, {
    error: { code: "internal_error", message: "Unexpected server failure" },
  }, responseHeaders);
}

export async function handleShopCatalog(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ShopRouteDependencies,
) {
  const responseHeaders = dependencies.responseHeaders ?? {};
  if (request.method !== "GET") {
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, responseHeaders);
    return;
  }

  try {
    await authenticatePlayer(request, dependencies);
    sendJson(response, 200, getPlayerFacingShopCatalog(), responseHeaders);
  } catch (error) {
    sendShopError(response, error, responseHeaders);
  }
}

export async function handleShopPurchase(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ShopRouteDependencies,
) {
  const responseHeaders = dependencies.responseHeaders ?? {};
  if (request.method !== "POST") {
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, responseHeaders);
    return;
  }

  try {
    const player = await authenticatePlayer(request, dependencies);
    const body = await readJsonBody(request);
    if (!isShopPurchaseRequest(body)) {
      throw new HttpRequestError(400, "invalid_purchase_request", "Only offerId may be submitted");
    }
    sendJson(response, 200, await dependencies.shop.purchase(player.id, body.offerId), responseHeaders);
  } catch (error) {
    sendShopError(response, error, responseHeaders);
  }
}
