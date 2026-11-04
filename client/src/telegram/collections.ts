import {
  CARD_ELEMENTS,
  CARD_RARITIES,
  COLLECTION_BONUS_SCOPES,
  COLLECTION_MODIFIER_TYPES,
  type PlayerCollectionCard,
  type PlayerCollectionCardResponse,
  type PlayerCollectionResponse,
  type PlayerCollectionsResponse,
  type PlayerCollectionSummary,
} from "@cardastika/shared";
import { getApiEndpoint } from "../api/config";
import { getPlayerAuthHeader } from "./index";
import { PlayerDataError } from "./playerDeck";

export function isSummary(value: unknown): value is PlayerCollectionSummary {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<PlayerCollectionSummary>;
  return typeof item.id === "string"
    && typeof item.displayName === "string"
    && typeof item.code === "string"
    && typeof item.completed === "boolean"
    && (item.completedAt === null || typeof item.completedAt === "string")
    && (item.coverArtKey === null || typeof item.coverArtKey === "string")
    && Number.isSafeInteger(item.discoveredCards)
    && Number(item.discoveredCards) >= 0
    && Number.isSafeInteger(item.totalCards)
    && Number(item.totalCards) >= Number(item.discoveredCards)
    && typeof item.bonusLabel === "string"
    && !!item.bonus && typeof item.bonus === "object"
    && COLLECTION_MODIFIER_TYPES.some((type) => type === item.bonus?.type)
    && typeof item.bonus.value === "number" && Number.isFinite(item.bonus.value)
    && (item.bonus.element === undefined || CARD_ELEMENTS.some((element) => element === item.bonus?.element))
    && (item.bonus.scope === undefined || COLLECTION_BONUS_SCOPES.some((scope) => scope === item.bonus?.scope))
    && (item.source === "standard" || item.source === "raid");
}

export function isCard(value: unknown): value is PlayerCollectionCard {
  if (!value || typeof value !== "object") return false;
  const card = value as Partial<PlayerCollectionCard>;
  return typeof card.id === "string"
    && typeof card.code === "string"
    && typeof card.displayName === "string"
    && typeof card.description === "string"
    && (card.artKey === null || typeof card.artKey === "string")
    && (card.collectionId === null || typeof card.collectionId === "string")
    && CARD_ELEMENTS.some((element) => element === card.element)
    && CARD_RARITIES.some((rarity) => rarity === card.minRarity)
    && typeof card.discovered === "boolean"
    && Number.isSafeInteger(card.ownedCopies)
    && Number(card.ownedCopies) >= 0
    && (card.strongestInstanceId === null || typeof card.strongestInstanceId === "string")
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
