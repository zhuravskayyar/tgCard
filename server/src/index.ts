import { createServer } from "node:http";
import { handleTelegramAuth } from "./auth/telegramAuthRoute.js";
import { getServerEnvironment } from "./config/environment.js";
import { createDatabasePool } from "./database/pool.js";
import { sendJson } from "./http/json.js";
import { PlayerRepository } from "./users/playerRepository.js";

const environment = getServerEnvironment();
const pool = createDatabasePool(environment.databaseUrl);
const players = new PlayerRepository(pool);

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");

  if (request.method === "POST" && url.pathname === "/api/auth/telegram") {
    await handleTelegramAuth(request, response, {
      botToken: environment.telegramBotToken,
      players,
    });
    return;
  }

  sendJson(response, 404, { error: { code: "not_found", message: "Route not found" } });
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
