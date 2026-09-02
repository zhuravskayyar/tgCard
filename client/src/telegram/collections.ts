import type {
  PlayerCollectionCard,
  PlayerCollectionCardResponse,
  PlayerCollectionResponse,
  PlayerCollectionsResponse,
  PlayerCollectionSummary,
} from "@cardastika/shared";
import { getApiEndpoint } from "../api/config";
import { getPlayerAuthHeader } from "./index";
import { PlayerDataError } from "./playerDeck";

function isSummary(value: unknown): value is PlayerCollectionSummary {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<PlayerCollectionSummary>;
  return typeof item.id === "string"
    && typeof item.displayName === "string"
    && typeof item.code === "string"
    && typeof item.completed === "boolean"
    && Number.isSafeInteger(item.discoveredCards)
    && Number.isSafeInteger(item.totalCards)
    && typeof item.bonusLabel === "string"
    && (item.source === "standard" || item.source === "raid");
}

function isCard(value: unknown): value is PlayerCollectionCard {
  if (!value || typeof value !== "object") return false;
  const card = value as Partial<PlayerCollectionCard>;
  return typeof card.id === "string"
    && typeof card.displayName === "string"
    && typeof card.description === "string"
    && (card.collectionId === null || typeof card.collectionId === "string")
    && typeof card.element === "string"
    && typeof card.minRarity === "string"
    && typeof card.discovered === "boolean"
    && Number.isSafeInteger(card.ownedCopies)
    && (card.limited === undefined || typeof card.limited === "boolean");
}

async function request(initData: string, path: string, signal?: AbortSignal) {
  const response = await fetch(getApiEndpoint(path), {
    headers: { Authorization: getPlayerAuthHeader(initData) },
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  const value = await response.json().catch(() => null) as unknown;
  if (!response.ok) throw new PlayerDataError(response.status);
  return value;
}

export async function loadCollections(initData: string, signal?: AbortSignal) {
  const value = await request(initData, "/api/player/collections", signal) as Partial<PlayerCollectionsResponse>;
  if (!Array.isArray(value?.collections) || !value.collections.every(isSummary)) throw new PlayerDataError(502);
  if (value.limitedCards !== undefined && (!Array.isArray(value.limitedCards) || !value.limitedCards.every(isCard))) {
    throw new PlayerDataError(502);
  }
  return { ...value, limitedCards: value.limitedCards ?? [] } as PlayerCollectionsResponse;
}

export async function loadCollection(initData: string, collectionId: string, signal?: AbortSignal) {
  const value = await request(initData, `/api/player/collections/${encodeURIComponent(collectionId)}`, signal) as Partial<PlayerCollectionResponse>;
  if (!isSummary(value?.collection) || !Array.isArray(value.cards) || !value.cards.every(isCard)) throw new PlayerDataError(502);
  return value as PlayerCollectionResponse;
}

export async function loadCollectionCard(
  initData: string,
  collectionId: string,
  cardId: string,
  signal?: AbortSignal,
) {
  const value = await request(
    initData,
    `/api/player/collections/${encodeURIComponent(collectionId)}/cards/${encodeURIComponent(cardId)}`,
    signal,
  ) as Partial<PlayerCollectionCardResponse>;
  if (!isSummary(value?.collection) || !isCard(value?.card)) throw new PlayerDataError(502);
  return value as PlayerCollectionCardResponse;
}
