import type { CardElement, CardRarity } from "./card.js";

export const DECK_SIZE = 9;

export interface DeckSlotInput {
  cardId: string;
  slot: number;
}

export interface PlayerDeckCard {
  cardId: string;
  code: string;
  collectionId: string | null;
  element: CardElement;
  power: number;
  rarity: CardRarity;
  slot: number;
}

export interface PlayerDeckResponse {
  cards: PlayerDeckCard[];
  totalPower: number;
}

export interface UpdatePlayerDeckRequest {
  slots: DeckSlotInput[];
}
