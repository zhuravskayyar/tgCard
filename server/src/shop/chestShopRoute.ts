import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import type { ChestShopOpenChestResponse, ChestShopView } from "@cardastika/shared";
import { authenticateRoutePlayer, type RouteAuthDependencies } from "../auth/routeAuth.js";
import { HttpRequestError, readJsonBody, sendJson } from "../http/json.js";
import { ChestShopError } from "./chestShopService.js";
import { sendShopError } from "./shopRoute.js";

interface ChestShopRouteDependencies extends RouteAuthDependencies {
  chestShop: {
    getShop(playerId: string): Promise<ChestShopView>;
    openShop(playerId: string): Promise<ChestShopView>;
    openChest(playerId: string, chestNumber: number): Promise<ChestShopOpenChestResponse>;
  };
  responseHeaders?: OutgoingHttpHeaders;
}

const STATUS_BY_CODE: Record<ChestShopError["code"], number> = {
  chest_shop_closed: 409,
  chest_shop_unavailable: 409,
  chest_shop_conflict: 409,
  not_enough_silver: 409,
  player_not_found: 404,
};

/** GET /api/chest-shop, POST /api/chest-shop/open, POST /api/chest-shop/chest `{ chestNumber }`. */
export async function handleChestShopRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ChestShopRouteDependencies,
) {
  const headers = dependencies.responseHeaders ?? {};
  const path = new URL(request.url ?? "/", "http://localhost").pathname;
  try {
    const { player } = await authenticateRoutePlayer(request, dependencies);
    if (request.method === "GET" && path === "/api/chest-shop") {
      sendJson(response, 200, await dependencies.chestShop.getShop(player.id), headers);
      return;
    }
    if (request.method === "POST" && path === "/api/chest-shop/open") {
      sendJson(response, 200, await dependencies.chestShop.openShop(player.id), headers);
      return;
    }
    if (request.method === "POST" && path === "/api/chest-shop/chest") {
      const body = await readJsonBody(request) as { chestNumber?: unknown } | null;
      const chestNumber = body?.chestNumber;
      if (!Number.isSafeInteger(chestNumber) || (chestNumber as number) < 1 || (chestNumber as number) > 15) {
        throw new HttpRequestError(400, "invalid_chest_number", "chestNumber must be 1–15");
      }
      sendJson(response, 200, await dependencies.chestShop.openChest(player.id, chestNumber as number), headers);
      return;
    }
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, headers);
  } catch (error) {
    if (error instanceof ChestShopError) {
      sendJson(response, STATUS_BY_CODE[error.code], { error: { code: error.code, message: error.message } }, headers);
      return;
    }
    sendShopError(response, error, headers);
  }
}
