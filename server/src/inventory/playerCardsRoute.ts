import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import type { PlayerCardsResponse, WeakPlayerCardsResponse } from "@cardastika/shared";
import { TelegramInitDataError, validateTelegramInitData } from "../auth/telegramInitData.js";
import { sendJson } from "../http/json.js";
import { PlayerPersistenceError, type PlayerRepository } from "../users/playerRepository.js";
import { InventoryPersistenceError, type InventoryRepository } from "./inventoryRepository.js";

interface PlayerCardsDependencies {
  botToken: string;
  inventory: Pick<InventoryRepository, "findByPlayerId" | "findWeakPageByPlayerId">;
  players: Pick<PlayerRepository, "findOrCreateFromTelegram">;
  responseHeaders?: OutgoingHttpHeaders;
}

const WEAK_PAGE_SIZE = 9 as const;

function readWeakPage(request: IncomingMessage) {
  const url = new URL(request.url ?? "/api/player/cards/weak", "http://localhost");
  const rawPage = url.searchParams.get("page") ?? "1";
  const rawLimit = url.searchParams.get("limit") ?? String(WEAK_PAGE_SIZE);
  const page = Number(rawPage);
  const limit = Number(rawLimit);
  if (!Number.isSafeInteger(page) || page < 1 || limit !== WEAK_PAGE_SIZE) return null;
  return page;
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

export async function handleWeakPlayerCards(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: PlayerCardsDependencies,
) {
  const responseHeaders = dependencies.responseHeaders ?? {};

  try {
    const page = readWeakPage(request);
    if (page === null) {
      sendJson(response, 400, {
        error: { code: "invalid_pagination", message: "Weak cards use positive pages of exactly 9 cards" },
      }, responseHeaders);
      return;
    }
    const initData = readTelegramInitData(request);
    const telegramUser = validateTelegramInitData(initData, dependencies.botToken);
    const player = await dependencies.players.findOrCreateFromTelegram(telegramUser);
    const result = await dependencies.inventory.findWeakPageByPlayerId(player.id, page, WEAK_PAGE_SIZE);
    const body: WeakPlayerCardsResponse = {
      cards: result.cards,
      page,
      pageSize: WEAK_PAGE_SIZE,
      totalCards: result.totalCards,
      totalPages: Math.ceil(result.totalCards / WEAK_PAGE_SIZE),
    };
    sendJson(response, 200, body, responseHeaders);
  } catch (error) {
    if (error instanceof TelegramInitDataError) {
      sendJson(response, 401, {
        error: { code: error.code, message: "Telegram authentication failed" },
      }, responseHeaders);
      return;
    }
    if (error instanceof PlayerPersistenceError || error instanceof InventoryPersistenceError) {
      sendJson(response, 503, {
        error: { code: "database_unavailable", message: "Inventory service is unavailable" },
      }, responseHeaders);
      return;
    }
    sendJson(response, 500, {
      error: { code: "internal_error", message: "Unexpected server failure" },
    }, responseHeaders);
  }
}
