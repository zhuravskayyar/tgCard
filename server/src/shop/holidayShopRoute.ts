import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import type { HolidayBundlePurchaseRequest, HolidayBundlePurchaseResponse, HolidayShopResponse } from "@cardastika/shared";
import { authenticateRoutePlayer, type RouteAuthDependencies } from "../auth/routeAuth.js";
import { HttpRequestError, readJsonBody, sendJson } from "../http/json.js";
import { HolidayLimitReachedError, HolidayNotActiveError } from "./holidayShopService.js";
import { sendShopError } from "./shopRoute.js";

interface HolidayShopRouteDependencies extends RouteAuthDependencies {
  holidayShop: {
    getCatalog(playerId: string): Promise<HolidayShopResponse>;
    purchase(playerId: string, bundleId: string, expectedPrice?: number): Promise<HolidayBundlePurchaseResponse>;
  };
  responseHeaders?: OutgoingHttpHeaders;
}

export function isHolidayBundlePurchaseRequest(value: unknown): value is HolidayBundlePurchaseRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.some((key) => key !== "bundleId" && key !== "expectedPrice")) return false;
  if (record.expectedPrice !== undefined && !(Number.isInteger(record.expectedPrice) && Number(record.expectedPrice) > 0)) return false;
  return typeof record.bundleId === "string" && Boolean(record.bundleId.trim());
}

function sendHolidayError(response: ServerResponse, error: unknown, headers: OutgoingHttpHeaders) {
  if (error instanceof HolidayNotActiveError) {
    sendJson(response, 409, { error: { code: "holiday_not_active", message: error.message } }, headers);
    return;
  }
  if (error instanceof HolidayLimitReachedError) {
    sendJson(response, 409, { error: { code: "holiday_limit_reached", message: error.message } }, headers);
    return;
  }
  sendShopError(response, error, headers);
}

export async function handleHolidayShopCatalog(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: HolidayShopRouteDependencies,
) {
  const headers = dependencies.responseHeaders ?? {};
  if (request.method !== "GET") {
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, headers);
    return;
  }
  try {
    const { player } = await authenticateRoutePlayer(request, dependencies);
    sendJson(response, 200, await dependencies.holidayShop.getCatalog(player.id), headers);
  } catch (error) {
    sendHolidayError(response, error, headers);
  }
}

export async function handleHolidayBundlePurchase(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: HolidayShopRouteDependencies,
) {
  const headers = dependencies.responseHeaders ?? {};
  if (request.method !== "POST") {
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, headers);
    return;
  }
  try {
    const { player } = await authenticateRoutePlayer(request, dependencies);
    const body = await readJsonBody(request);
    if (!isHolidayBundlePurchaseRequest(body)) {
      throw new HttpRequestError(400, "invalid_bundle_purchase_request", "Only bundleId and expectedPrice may be submitted");
    }
    sendJson(response, 200, await dependencies.holidayShop.purchase(player.id, body.bundleId, body.expectedPrice), headers);
  } catch (error) {
    sendHolidayError(response, error, headers);
  }
}
