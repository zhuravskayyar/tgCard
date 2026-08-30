import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import type {
  ShopCatalogResponse,
  ShopPurchaseRequest,
  ShopPurchaseResponse,
} from "@cardastika/shared";
import { authenticateRoutePlayer, isAuthFailure, type RouteAuthDependencies } from "../auth/routeAuth.js";
import { HttpRequestError, readJsonBody, sendJson } from "../http/json.js";
import { PlayerPersistenceError } from "../users/playerRepository.js";
import {
  InsufficientShopFundsError,
  ShopLevelSelectionPolicyUnavailableError,
  ShopOfferMissingError,
  ShopPersistenceError,
  ShopPlayerMissingError,
} from "./shopService.js";
import { ShopRewardUnavailableError } from "./shopRewardSelector.js";

interface ShopPurchaseService {
  getCardsCatalog(playerId: string): Promise<ShopCatalogResponse>;
  purchase(playerId: string, offerId: string): Promise<ShopPurchaseResponse>;
}

interface ShopRouteDependencies extends RouteAuthDependencies {
  responseHeaders?: OutgoingHttpHeaders;
  shop: ShopPurchaseService;
}

export function isShopPurchaseRequest(value: unknown): value is ShopPurchaseRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 1 && typeof record.offerId === "string" && Boolean(record.offerId.trim());
}

async function authenticatePlayer(request: IncomingMessage, dependencies: ShopRouteDependencies) {
  return (await authenticateRoutePlayer(request, dependencies)).player;
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
  if (isAuthFailure(error)) {
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
  if (error instanceof ShopRewardUnavailableError) {
    sendJson(response, 503, {
      error: { code: "reward_unavailable", message: "No eligible canonical reward is available" },
    }, responseHeaders);
    return;
  }
  if (error instanceof ShopLevelSelectionPolicyUnavailableError) {
    sendJson(response, 503, {
      error: {
        code: "level_policy_unavailable",
        message: "Shop card level-selection policy is not configured",
      },
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
    const player = await authenticatePlayer(request, dependencies);
    sendJson(response, 200, await dependencies.shop.getCardsCatalog(player.id), responseHeaders);
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
