import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import type { PlayerCardsResponse } from "@cardastika/shared";
import { TelegramInitDataError, validateTelegramInitData } from "../auth/telegramInitData.js";
import { sendJson } from "../http/json.js";
import { PlayerPersistenceError, type PlayerRepository } from "../users/playerRepository.js";
import { InventoryPersistenceError, type InventoryRepository } from "./inventoryRepository.js";

interface PlayerCardsDependencies {
  botToken: string;
  inventory: InventoryRepository;
  players: PlayerRepository;
  responseHeaders?: OutgoingHttpHeaders;
}

function readTelegramInitData(request: IncomingMessage) {
  const authorization = request.headers.authorization?.trim();

  if (!authorization?.startsWith("tma ")) {
    throw new TelegramInitDataError("missing_init_data");
  }

  return authorization.slice(4).trim();
}

export async function handlePlayerCards(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: PlayerCardsDependencies,
) {
  const responseHeaders = dependencies.responseHeaders ?? {};

  try {
    const initData = readTelegramInitData(request);
    const telegramUser = validateTelegramInitData(initData, dependencies.botToken);
    const player = await dependencies.players.findOrCreateFromTelegram(telegramUser);
    const cards = await dependencies.inventory.findByPlayerId(player.id);
    const body: PlayerCardsResponse = { cards };
    sendJson(response, 200, body, responseHeaders);
  } catch (error) {
    if (error instanceof TelegramInitDataError) {
      sendJson(response, 401, {
        error: { code: error.code, message: "Telegram authentication failed" },
      }, responseHeaders);
      return;
    }

    if (error instanceof PlayerPersistenceError || error instanceof InventoryPersistenceError) {
      console.error("Database unavailable while loading player inventory");
      sendJson(response, 503, {
        error: { code: "database_unavailable", message: "Inventory service is unavailable" },
      }, responseHeaders);
      return;
    }

    console.error("Unexpected player inventory failure");
    sendJson(response, 500, {
      error: { code: "internal_error", message: "Unexpected server failure" },
    }, responseHeaders);
  }
}
