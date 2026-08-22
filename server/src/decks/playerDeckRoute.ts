import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import type { PlayerSummary } from "@cardastika/shared";
import { TelegramInitDataError, validateTelegramInitData } from "../auth/telegramInitData.js";
import { HttpRequestError, readJsonBody, sendJson } from "../http/json.js";
import { PlayerPersistenceError } from "../users/playerRepository.js";
import { DeckMissingError, DeckPersistenceError } from "./deckRepository.js";
import { DeckValidationError, parseDeckUpdateRequest } from "./deckRules.js";

interface PlayerLookup {
  findOrCreateFromTelegram(user: ReturnType<typeof validateTelegramInitData>): Promise<PlayerSummary>;
}

interface DeckLookup {
  findByPlayerId(playerId: string): ReturnType<import("./deckRepository.js").DeckRepository["findByPlayerId"]>;
  save(
    playerId: string,
    slots: Parameters<import("./deckRepository.js").DeckRepository["save"]>[1],
  ): ReturnType<import("./deckRepository.js").DeckRepository["save"]>;
}

interface PlayerDeckDependencies {
  botToken: string;
  decks: DeckLookup;
  players: PlayerLookup;
  responseHeaders?: OutgoingHttpHeaders;
}

function readTelegramInitData(request: IncomingMessage) {
  const authorization = request.headers.authorization?.trim();
  if (!authorization?.startsWith("tma ")) {
    throw new TelegramInitDataError("missing_init_data");
  }
  return authorization.slice(4).trim();
}

export async function handlePlayerDeck(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: PlayerDeckDependencies,
) {
  const responseHeaders = dependencies.responseHeaders ?? {};

  try {
    const initData = readTelegramInitData(request);
    const telegramUser = validateTelegramInitData(initData, dependencies.botToken);
    const player = await dependencies.players.findOrCreateFromTelegram(telegramUser);

    if (request.method === "GET") {
      sendJson(response, 200, await dependencies.decks.findByPlayerId(player.id), responseHeaders);
      return;
    }

    if (request.method === "PUT") {
      const slots = parseDeckUpdateRequest(await readJsonBody(request));
      sendJson(response, 200, await dependencies.decks.save(player.id, slots), responseHeaders);
      return;
    }

    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, responseHeaders);
  } catch (error) {
    if (error instanceof TelegramInitDataError) {
      sendJson(response, 401, {
        error: { code: error.code, message: "Telegram authentication failed" },
      }, responseHeaders);
      return;
    }

    if (error instanceof HttpRequestError) {
      sendJson(response, error.status, { error: { code: error.code, message: error.message } }, responseHeaders);
      return;
    }

    if (error instanceof DeckValidationError) {
      sendJson(response, 400, { error: { code: error.code, message: "Deck is invalid" } }, responseHeaders);
      return;
    }

    if (error instanceof DeckMissingError) {
      sendJson(response, 404, { error: { code: "deck_missing", message: "Player deck does not exist" } }, responseHeaders);
      return;
    }

    if (error instanceof PlayerPersistenceError || error instanceof DeckPersistenceError) {
      console.error("Database unavailable while loading player deck");
      sendJson(response, 503, {
        error: { code: "database_unavailable", message: "Deck service is unavailable" },
      }, responseHeaders);
      return;
    }

    console.error("Unexpected player deck failure");
    sendJson(response, 500, {
      error: { code: "internal_error", message: "Unexpected server failure" },
    }, responseHeaders);
  }
}
