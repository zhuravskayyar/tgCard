import { createServer } from "node:http";
import { environment, handleRequest, pool } from "./index.js";

const server = createServer(handleRequest);

async function startServer() {
  try {
    await pool.query("SELECT 1");
  } catch {
    console.error("Cardastika server did not start because PostgreSQL is unavailable.");
    await pool.end();
    process.exitCode = 1;
    return;
  }

  server.listen(environment.port, "127.0.0.1", () => {
    console.log(`Cardastika server listening on http://127.0.0.1:${environment.port}`);
  });
}

void startServer();

async function shutdown() {
  server.close();
  await pool.end();
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
