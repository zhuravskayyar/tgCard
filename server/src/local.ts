import { createServer } from "node:http";
import { environment, guildWars, handleRequest, pool } from "./index.js";

const server = createServer(handleRequest);
let guildWarCycleTimer: NodeJS.Timeout | null = null;

async function startServer() {
  try {
    await pool.query("SELECT 1");
  } catch {
    console.error("Cardastika server did not start because PostgreSQL is unavailable.");
    await pool.end();
    process.exitCode = 1;
    return;
  }

  await guildWars.ensureCurrentCycle().catch((error) => {
    console.error("Guild war cycle initialization failed", error);
    return false;
  });
  guildWarCycleTimer = setInterval(() => {
    void guildWars.ensureCurrentCycle().catch((error) => console.error("Guild war cycle refresh failed", error));
  }, 60_000);
  guildWarCycleTimer.unref();

  server.listen(environment.port, "127.0.0.1", () => {
    console.log(`Cardastika server listening on http://127.0.0.1:${environment.port}`);
  });
}

void startServer();

async function shutdown() {
  if (guildWarCycleTimer) clearInterval(guildWarCycleTimer);
  server.close();
  await pool.end();
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
