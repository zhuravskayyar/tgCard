import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import type { LimitedCardRedeemRequest } from "@cardastika/shared";
import { authenticateRoutePlayer, isAuthFailure, type RouteAuthDependencies } from "../auth/routeAuth.js";
import { HttpRequestError, readJsonBody, sendJson } from "../http/json.js";
import {
  InvalidLimitedPromoCodeError,
  LimitedCardAlreadyRedeemedError,
  LimitedCardEventUnavailableError,
  LimitedCardPersistenceError,
  type LimitedCardService,
} from "./limitedCardService.js";

interface LimitedCardRouteDependencies extends RouteAuthDependencies {
  limitedCards: Pick<LimitedCardService, "redeem">;
  responseHeaders?: OutgoingHttpHeaders;
}

export function isLimitedCardRedeemRequest(value: unknown): value is LimitedCardRedeemRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 2
    && typeof record.eventId === "string"
    && Boolean(record.eventId.trim())
    && typeof record.promoCode === "string"
    && Boolean(record.promoCode.trim());
}

export async function handleLimitedCardRedeem(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: LimitedCardRouteDependencies,
) {
  const responseHeaders = dependencies.responseHeaders ?? {};
  if (request.method !== "POST") {
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, responseHeaders);
    return;
  }

  try {
    const { player } = await authenticateRoutePlayer(request, dependencies);
    const body = await readJsonBody(request);
    if (!isLimitedCardRedeemRequest(body)) {
      throw new HttpRequestError(400, "invalid_limited_card_request", "eventId and promoCode are required");
    }
    const result = await dependencies.limitedCards.redeem(player.id, body.eventId, body.promoCode);
    sendJson(response, 200, result, responseHeaders);
  } catch (error) {
    if (error instanceof HttpRequestError) {
      sendJson(response, error.status, { error: { code: error.code, message: error.message } }, responseHeaders);
      return;
    }
    if (isAuthFailure(error)) {
      sendJson(response, 401, { error: { code: error.code, message: "Telegram authentication failed" } }, responseHeaders);
      return;
    }
    if (error instanceof InvalidLimitedPromoCodeError) {
      sendJson(response, 400, { error: { code: "invalid_promo_code", message: error.message } }, responseHeaders);
      return;
    }
    if (error instanceof LimitedCardEventUnavailableError) {
      sendJson(response, 410, { error: { code: "limited_event_inactive", message: error.message } }, responseHeaders);
      return;
    }
    if (error instanceof LimitedCardAlreadyRedeemedError) {
      sendJson(response, 409, { error: { code: "limited_card_already_redeemed", message: error.message } }, responseHeaders);
      return;
    }
    if (error instanceof LimitedCardPersistenceError) {
      console.error("Database unavailable during limited card redemption");
      sendJson(response, 503, { error: { code: "database_unavailable", message: "Limited card service is unavailable" } }, responseHeaders);
      return;
    }
    console.error("Unexpected limited card redemption failure");
    sendJson(response, 500, { error: { code: "internal_error", message: "Unexpected server failure" } }, responseHeaders);
  }
}
