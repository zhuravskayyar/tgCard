import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import type {
  PlayerCollectionCardResponse,
  PlayerCollectionResponse,
  PlayerCollectionsResponse,
  PlayerSummary,
} from "@cardastika/shared";
import { TelegramInitDataError, validateTelegramInitData } from "../auth/telegramInitData.js";
import { sendJson } from "../http/json.js";
import { PlayerPersistenceError } from "../users/playerRepository.js";
import {
  CollectionCardMissingError,
  CollectionMissingError,
  CollectionPersistenceError,
} from "./collectionRepository.js";

interface PlayerLookup {
  findOrCreateFromTelegram(user: ReturnType<typeof validateTelegramInitData>): Promise<PlayerSummary>;
}

interface CollectionLookup {
  card(playerId: string, collectionId: string, cardId: string): Promise<PlayerCollectionCardResponse>;
  detail(playerId: string, collectionId: string): Promise<PlayerCollectionResponse>;
  list(playerId: string): Promise<PlayerCollectionsResponse>;
}

interface CollectionRouteDependencies {
  botToken: string;
  collections: CollectionLookup;
  players: PlayerLookup;
  responseHeaders?: OutgoingHttpHeaders;
  campaign?: {
    recordExternalEvent(
      playerId: string,
      type: "COLLECTION_OPENED",
      payload: { collectionScope: "detail" | "list" },
    ): Promise<void>;
  };
}

function readTelegramInitData(request: IncomingMessage) {
  const authorization = request.headers.authorization?.trim();
  if (!authorization?.startsWith("tma ")) throw new TelegramInitDataError("missing_init_data");
  return authorization.slice(4).trim();
}

export async function handlePlayerCollections(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: CollectionRouteDependencies,
  collectionId?: string,
  cardId?: string,
) {
  const responseHeaders = dependencies.responseHeaders ?? {};
  if (request.method !== "GET") {
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, responseHeaders);
    return;
  }

  try {
    const telegramUser = validateTelegramInitData(readTelegramInitData(request), dependencies.botToken);
    const player = await dependencies.players.findOrCreateFromTelegram(telegramUser);
    const body = collectionId
      ? cardId
        ? await dependencies.collections.card(player.id, collectionId, cardId)
        : await dependencies.collections.detail(player.id, collectionId)
      : await dependencies.collections.list(player.id);
    if (!cardId) {
      await dependencies.campaign?.recordExternalEvent(player.id, "COLLECTION_OPENED", {
        collectionScope: collectionId ? "detail" : "list",
      });
    }
    sendJson(response, 200, body, responseHeaders);
  } catch (error) {
    if (error instanceof TelegramInitDataError) {
      sendJson(response, 401, { error: { code: error.code, message: "Telegram authentication failed" } }, responseHeaders);
      return;
    }
    if (error instanceof CollectionMissingError || error instanceof CollectionCardMissingError) {
      sendJson(response, 404, { error: { code: "collection_not_found", message: error.message } }, responseHeaders);
      return;
    }
    if (error instanceof CollectionPersistenceError || error instanceof PlayerPersistenceError) {
      sendJson(response, 503, { error: { code: "database_unavailable", message: "Collections are unavailable" } }, responseHeaders);
      return;
    }
    console.error("Unexpected collection request failure");
    sendJson(response, 500, { error: { code: "internal_error", message: "Unexpected server failure" } }, responseHeaders);
  }
}
