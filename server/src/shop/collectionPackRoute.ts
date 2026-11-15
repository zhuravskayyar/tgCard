import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import type { CollectionPackPurchaseRequest, CollectionPackPurchaseResponse, CollectionPacksResponse } from "@cardastika/shared";
import { authenticateRoutePlayer, type RouteAuthDependencies } from "../auth/routeAuth.js";
import { HttpRequestError, readJsonBody, sendJson } from "../http/json.js";
import { CollectionPackLimitReachedError, CollectionPackNotActiveError } from "./collectionPackService.js";
import { sendShopError } from "./shopRoute.js";

interface CollectionPackRouteDependencies extends RouteAuthDependencies {
  collectionPacks: {
    getCatalog(playerId: string): Promise<CollectionPacksResponse>;
    purchase(playerId: string, offerId: string, expectedPrice?: number): Promise<CollectionPackPurchaseResponse>;
  };
  responseHeaders?: OutgoingHttpHeaders;
}

export function isCollectionPackPurchaseRequest(value: unknown): value is CollectionPackPurchaseRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.some((key) => key !== "offerId" && key !== "expectedPrice")) return false;
  if (record.expectedPrice !== undefined && !(Number.isInteger(record.expectedPrice) && Number(record.expectedPrice) > 0)) return false;
  return typeof record.offerId === "string" && Boolean(record.offerId.trim());
}

function sendPackError(response: ServerResponse, error: unknown, headers: OutgoingHttpHeaders) {
  if (error instanceof CollectionPackNotActiveError) {
    sendJson(response, 409, { error: { code: "pack_not_active", message: error.message } }, headers);
    return;
  }
  if (error instanceof CollectionPackLimitReachedError) {
    sendJson(response, 409, { error: { code: "pack_limit_reached", message: error.message } }, headers);
    return;
  }
  sendShopError(response, error, headers);
}

export async function handleCollectionPackCatalog(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: CollectionPackRouteDependencies,
) {
  const headers = dependencies.responseHeaders ?? {};
  if (request.method !== "GET") {
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, headers);
    return;
  }
  try {
    const { player } = await authenticateRoutePlayer(request, dependencies);
    sendJson(response, 200, await dependencies.collectionPacks.getCatalog(player.id), headers);
  } catch (error) {
    sendPackError(response, error, headers);
  }
}

export async function handleCollectionPackPurchase(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: CollectionPackRouteDependencies,
) {
  const headers = dependencies.responseHeaders ?? {};
  if (request.method !== "POST") {
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, headers);
    return;
  }
  try {
    const { player } = await authenticateRoutePlayer(request, dependencies);
    const body = await readJsonBody(request);
    if (!isCollectionPackPurchaseRequest(body)) {
      throw new HttpRequestError(400, "invalid_pack_purchase_request", "Only offerId and expectedPrice may be submitted");
    }
    sendJson(response, 200, await dependencies.collectionPacks.purchase(player.id, body.offerId, body.expectedPrice), headers);
  } catch (error) {
    sendPackError(response, error, headers);
  }
}
