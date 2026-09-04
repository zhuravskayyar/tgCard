import { createDatabasePool } from "../database/pool.js";
import { getServerEnvironment } from "../config/environment.js";
import { PlayerRepository } from "../users/playerRepository.js";
import { handleTelegramUpdate } from "./telegramBot.js";
import { TelegramApiClient } from "./telegramApi.js";

const environment = getServerEnvironment();
const configuredMiniAppUrl = process.env.CARDASTIKA_MINI_APP_URL?.trim() || environment.clientOrigin;

if (!configuredMiniAppUrl) {
  throw new Error("CLIENT_ORIGIN or CARDASTIKA_MINI_APP_URL is required for the Telegram bot.");
}
const miniAppUrl = configuredMiniAppUrl;
const parsedMiniAppUrl = new URL(miniAppUrl);
if (parsedMiniAppUrl.protocol !== "https:") {
  throw new Error("The Telegram Mini App URL must use HTTPS.");
}

const pool = createDatabasePool(environment.databaseUrl);
const players = new PlayerRepository(pool);
const api = new TelegramApiClient(environment.telegramBotToken);
let stopping = false;

async function run() {
  const bot = await api.getMe();
  console.log(`Cardastika Telegram bot polling as @${bot.username ?? bot.id}.`);
  console.log(`Mini App URL: ${miniAppUrl}`);

  let offset: number | undefined;
  while (!stopping) {
    try {
      const updates = await api.getUpdates(offset, 25);
      for (const update of updates) {
        offset = update.update_id + 1;
        try {
          await handleTelegramUpdate(update, { api, miniAppUrl, players });
        } catch (error) {
          console.error(`Failed to process Telegram update ${update.update_id}.`, error);
        }
      }
    } catch (error) {
      console.error("Telegram polling failed; retrying in 5 seconds.", error);
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }
}

async function shutdown() {
  if (stopping) return;
  stopping = true;
  await pool.end();
}

process.once("SIGINT", () => { void shutdown(); });
process.once("SIGTERM", () => { void shutdown(); });

void run().catch(async (error) => {
  console.error("Cardastika Telegram bot stopped unexpectedly.", error);
  await shutdown();
  process.exitCode = 1;
});
