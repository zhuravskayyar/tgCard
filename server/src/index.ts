import { createServer } from "node:http";
import { handleTelegramAuth } from "./auth/telegramAuthRoute.js";
import { handleCardProgressionRequest, type CardProgressionRouteAction } from "./cards/cardProgressionRoute.js";
import { CardProgressionService } from "./cards/cardProgressionService.js";
import { getServerEnvironment } from "./config/environment.js";
import { CollectionRepository } from "./collections/collectionRepository.js";
import { handlePlayerCollections } from "./collections/collectionRoute.js";
import { createDatabasePool } from "./database/pool.js";
import { DeckRepository } from "./decks/deckRepository.js";
import { handlePlayerDeck } from "./decks/playerDeckRoute.js";
import { handleDuelRequest } from "./duel/duelRoute.js";
import { DuelService } from "./duel/duelService.js";
import { getCorsPolicy } from "./http/cors.js";
import { sendJson } from "./http/json.js";
import { InventoryRepository } from "./inventory/inventoryRepository.js";
import { handlePlayerCards, handleWeakPlayerCards } from "./inventory/playerCardsRoute.js";
import { handleShopCatalog, handleShopPurchase } from "./shop/shopRoute.js";
import { ShopService } from "./shop/shopService.js";
import { PlayerRepository } from "./users/playerRepository.js";

const environment = getServerEnvironment();
const pool = createDatabasePool(environment.databaseUrl);
const players = new PlayerRepository(pool);
const inventory = new InventoryRepository(pool);
const decks = new DeckRepository(pool);
const shop = new ShopService(pool);
const cardProgression = new CardProgressionService(pool, inventory);
const collections = new CollectionRepository(pool);
const duels = new DuelService(pool);

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  const cors = getCorsPolicy(request.headers.origin, environment.clientOrigin);

  if (url.pathname.startsWith("/api/") && !cors.allowed) {
    sendJson(response, 403, { error: { code: "origin_not_allowed", message: "Origin is not allowed" } });
    return;
  }

  const isTelegramAuthRoute = url.pathname === "/api/auth/telegram";
  const isPlayerCardsRoute = url.pathname === "/api/player/cards";
  const isWeakPlayerCardsRoute = url.pathname === "/api/player/cards/weak";
  const isPlayerDeckRoute = url.pathname === "/api/player/deck";
  const isShopCatalogRoute = url.pathname === "/api/shop/cards";
  const isShopPurchaseRoute = url.pathname === "/api/shop/cards/purchase";
  const isDuelRoute = url.pathname.startsWith("/api/duel/");
  const cardProgressionMatch = url.pathname.match(
    /^\/api\/player\/cards\/([^/]+?)(?:\/(absorption-candidates|absorption-preview|absorb|level-up))?$/,
  );
  const collectionMatch = url.pathname.match(
    /^\/api\/player\/collections(?:\/([^/]+?)(?:\/cards\/([^/]+?))?)?$/,
  );

  if (
    request.method === "OPTIONS" &&
    (isTelegramAuthRoute || isPlayerCardsRoute || isWeakPlayerCardsRoute || isPlayerDeckRoute || isShopCatalogRoute || isShopPurchaseRoute || isDuelRoute || cardProgressionMatch || collectionMatch)
  ) {
    response.writeHead(204, cors.headers);
    response.end();
    return;
  }

  if (request.method === "POST" && isTelegramAuthRoute) {
    await handleTelegramAuth(request, response, {
      botToken: environment.telegramBotToken,
      players,
      responseHeaders: cors.headers,
    });
    return;
  }

  if (request.method === "GET" && isPlayerCardsRoute) {
    await handlePlayerCards(request, response, {
      botToken: environment.telegramBotToken,
      inventory,
      players,
      responseHeaders: cors.headers,
    });
    return;
  }

  if (request.method === "GET" && isWeakPlayerCardsRoute) {
    await handleWeakPlayerCards(request, response, {
      botToken: environment.telegramBotToken,
      inventory,
      players,
      responseHeaders: cors.headers,
    });
    return;
  }

  if (cardProgressionMatch) {
    const instanceId = decodeURIComponent(cardProgressionMatch[1]!);
    const action = (cardProgressionMatch[2] ?? "detail") as CardProgressionRouteAction;
    await handleCardProgressionRequest(request, response, {
      botToken: environment.telegramBotToken,
      players,
      progression: cardProgression,
      responseHeaders: cors.headers,
    }, instanceId, action);
    return;
  }

  if (collectionMatch) {
    await handlePlayerCollections(request, response, {
      botToken: environment.telegramBotToken,
      collections,
      players,
      responseHeaders: cors.headers,
    }, collectionMatch[1] ? decodeURIComponent(collectionMatch[1]) : undefined,
    collectionMatch[2] ? decodeURIComponent(collectionMatch[2]) : undefined);
    return;
  }

  if (isPlayerDeckRoute) {
    await handlePlayerDeck(request, response, {
      botToken: environment.telegramBotToken,
      decks,
      players,
      responseHeaders: cors.headers,
    });
    return;
  }

  if (isShopCatalogRoute) {
    await handleShopCatalog(request, response, {
      botToken: environment.telegramBotToken,
      players,
      shop,
      responseHeaders: cors.headers,
    });
    return;
  }

  if (isShopPurchaseRoute) {
    await handleShopPurchase(request, response, {
      botToken: environment.telegramBotToken,
      players,
      shop,
      responseHeaders: cors.headers,
    });
    return;
  }

  if (isDuelRoute) {
    await handleDuelRequest(request, response, {
      botToken: environment.telegramBotToken,
      duels,
      players,
      responseHeaders: cors.headers,
    });
    return;
  }

  sendJson(response, 404, { error: { code: "not_found", message: "Route not found" } }, cors.headers);
});

server.listen(environment.port, "127.0.0.1", () => {
  console.log(`Cardastika server listening on http://127.0.0.1:${environment.port}`);
});

async function shutdown() {
  server.close();
  await pool.end();
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
