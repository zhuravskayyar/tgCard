import {
  CARD_ELEMENTS,
  CARD_RARITIES,
  DECK_SIZE,
  type DeckSlotInput,
  type PlayerCard,
  type PlayerCardsResponse,
  type PlayerDeckCard,
  type PlayerDeckResponse,
  type UpdatePlayerDeckRequest,
} from "@cardastika/shared";
import { getApiEndpoint } from "../api/config";

export class PlayerDataError extends Error {
  constructor(public readonly status: number) {
    super("Player data request failed");
    this.name = "PlayerDataError";
  }
}

function isCardElement(value: unknown): value is PlayerCard["element"] {
  return typeof value === "string" && CARD_ELEMENTS.some((element) => element === value);
}

function isCardRarity(value: unknown): value is PlayerCard["rarity"] {
  return typeof value === "string" && CARD_RARITIES.some((rarity) => rarity === value);
}

function isCanonicalCard(value: unknown): value is Omit<PlayerDeckCard, "slot"> {
  if (!value || typeof value !== "object") return false;
  const card = value as Record<string, unknown>;
  return (
    typeof card.cardId === "string" &&
    typeof card.code === "string" &&
    (card.displayName === null || typeof card.displayName === "string") &&
    (card.artKey === null || typeof card.artKey === "string") &&
    (card.collectionId === null || typeof card.collectionId === "string") &&
    isCardElement(card.element) &&
    Number.isSafeInteger(card.power) &&
    Number(card.power) > 0 &&
    isCardRarity(card.rarity)
  );
}

function isPlayerCard(value: unknown): value is PlayerCard {
  return isCanonicalCard(value) && Number.isSafeInteger((value as PlayerCard).quantity) && (value as PlayerCard).quantity > 0;
}

function isDeckCard(value: unknown): value is PlayerDeckCard {
  const slot = (value as PlayerDeckCard | null)?.slot;
  return isCanonicalCard(value) && Number.isSafeInteger(slot) && Number(slot) >= 1 && Number(slot) <= DECK_SIZE;
}

function parseDeck(value: unknown): PlayerDeckResponse {
  if (!value || typeof value !== "object") throw new PlayerDataError(502);
  const response = value as Partial<PlayerDeckResponse>;
  if (
    !Array.isArray(response.cards) ||
    !response.cards.every(isDeckCard) ||
    !Number.isSafeInteger(response.totalPower) ||
    Number(response.totalPower) < 0
  ) {
    throw new PlayerDataError(502);
  }
  return { cards: response.cards, totalPower: Number(response.totalPower) };
}

function parseInventory(value: unknown): PlayerCardsResponse {
  if (!value || typeof value !== "object") throw new PlayerDataError(502);
  const response = value as Partial<PlayerCardsResponse>;
  if (!Array.isArray(response.cards) || !response.cards.every(isPlayerCard)) {
    throw new PlayerDataError(502);
  }
  return { cards: response.cards };
}

async function requestPlayerData(path: string, initData: string, signal: AbortSignal, init?: RequestInit) {
  const response = await fetch(getApiEndpoint(path), {
    ...init,
    headers: {
      Authorization: `tma ${initData}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) throw new PlayerDataError(response.status);
  return response.json() as Promise<unknown>;
}

export async function loadTelegramPlayerDeck(initData: string, signal: AbortSignal) {
  return parseDeck(await requestPlayerData("/api/player/deck", initData, signal));
}

export async function loadTelegramPlayerCards(initData: string, signal: AbortSignal) {
  return parseInventory(await requestPlayerData("/api/player/cards", initData, signal));
}

export async function saveTelegramPlayerDeck(
  initData: string,
  slots: DeckSlotInput[],
  signal: AbortSignal,
) {
  const body: UpdatePlayerDeckRequest = { slots };
  return parseDeck(await requestPlayerData("/api/player/deck", initData, signal, {
    method: "PUT",
    body: JSON.stringify(body),
  }));
}
