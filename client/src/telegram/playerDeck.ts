import {
  CARD_ELEMENTS,
  CARD_RARITIES,
  DECK_SIZE,
  type PlayerDeckCard,
  type PlayerDeckResponse,
} from "@cardastika/shared";
import { getApiEndpoint } from "../api/config";

export class PlayerDataError extends Error {
  constructor(public readonly status: number) {
    super("Player data request failed");
    this.name = "PlayerDataError";
  }
}

function isCardElement(value: unknown): value is PlayerDeckCard["element"] {
  return typeof value === "string" && CARD_ELEMENTS.some((element) => element === value);
}

function isCardRarity(value: unknown): value is PlayerDeckCard["rarity"] {
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

async function requestPlayerDeck(initData: string, signal: AbortSignal) {
  const response = await fetch(getApiEndpoint("/api/player/deck"), {
    headers: { Authorization: `tma ${initData}` },
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) throw new PlayerDataError(response.status);
  return response.json() as Promise<unknown>;
}

export async function loadTelegramPlayerDeck(initData: string, signal: AbortSignal) {
  return parseDeck(await requestPlayerDeck(initData, signal));
}
