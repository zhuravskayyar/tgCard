import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import type {
  PlayerCollectionCardResponse,
  PlayerCollectionResponse,
  PlayerCollectionsResponse,
} from "@cardastika/shared";
import { authenticateRoutePlayer, isAuthFailure, type RouteAuthDependencies } from "../auth/routeAuth.js";
import { sendJson } from "../http/json.js";
import { PlayerPersistenceError } from "../users/playerRepository.js";
import {
  CollectionCardMissingError,
  CollectionMissingError,
  CollectionPersistenceError,
} from "./collectionRepository.js";

interface CollectionLookup {
  card(playerId: string, collectionId: string, cardId: string): Promise<PlayerCollectionCardResponse>;
  detail(playerId: string, collectionId: string): Promise<PlayerCollectionResponse>;
  list(playerId: string): Promise<PlayerCollectionsResponse>;
}

interface CollectionRouteDependencies extends RouteAuthDependencies {
  collections: CollectionLookup;
  responseHeaders?: OutgoingHttpHeaders;
  campaign?: {
    recordExternalEvent(
      playerId: string,
      type: "COLLECTION_OPENED",
      payload: { collectionScope: "detail" | "list" },
    ): Promise<void>;
  };
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
    const { player } = await authenticateRoutePlayer(request, dependencies);
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
    if (isAuthFailure(error)) {
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
