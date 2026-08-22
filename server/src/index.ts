import { createServer } from "node:http";
import { handleTelegramAuth } from "./auth/telegramAuthRoute.js";
import { getServerEnvironment } from "./config/environment.js";
import { createDatabasePool } from "./database/pool.js";
import { getCorsPolicy } from "./http/cors.js";
import { sendJson } from "./http/json.js";
import { InventoryRepository } from "./inventory/inventoryRepository.js";
import { handlePlayerCards } from "./inventory/playerCardsRoute.js";
import { PlayerRepository } from "./users/playerRepository.js";

const environment = getServerEnvironment();
const pool = createDatabasePool(environment.databaseUrl);
const players = new PlayerRepository(pool);
const inventory = new InventoryRepository(pool);

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  const cors = getCorsPolicy(request.headers.origin, environment.clientOrigin);

  if (url.pathname.startsWith("/api/") && !cors.allowed) {
    sendJson(response, 403, { error: { code: "origin_not_allowed", message: "Origin is not allowed" } });
    return;
  }

  const isTelegramAuthRoute = url.pathname === "/api/auth/telegram";
  const isPlayerCardsRoute = url.pathname === "/api/player/cards";

  if (request.method === "OPTIONS" && (isTelegramAuthRoute || isPlayerCardsRoute)) {
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
