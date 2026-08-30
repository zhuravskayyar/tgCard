import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import { authenticateRoutePlayer, isAuthFailure, type RouteAuthDependencies } from "../auth/routeAuth.js";
import { sendJson } from "../http/json.js";
import { PlayerPersistenceError } from "../users/playerRepository.js";
import { DeckMissingError, DeckPersistenceError } from "./deckRepository.js";

interface DeckLookup {
  findByPlayerId(playerId: string): ReturnType<import("./deckRepository.js").DeckRepository["findByPlayerId"]>;
}

interface PlayerDeckDependencies extends RouteAuthDependencies {
  decks: DeckLookup;
  responseHeaders?: OutgoingHttpHeaders;
  campaign?: {
    recordExternalEvent(playerId: string, type: "DECK_OPENED"): Promise<void>;
  };
}

export async function handlePlayerDeck(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: PlayerDeckDependencies,
) {
  const responseHeaders = dependencies.responseHeaders ?? {};

  if (request.method !== "GET") {
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, responseHeaders);
    return;
  }

  try {
    const { player } = await authenticateRoutePlayer(request, dependencies);

    const deck = await dependencies.decks.findByPlayerId(player.id);
    await dependencies.campaign?.recordExternalEvent(player.id, "DECK_OPENED");
    sendJson(response, 200, deck, responseHeaders);
  } catch (error) {
    if (isAuthFailure(error)) {
      sendJson(response, 401, {
        error: { code: error.code, message: "Telegram authentication failed" },
      }, responseHeaders);
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
