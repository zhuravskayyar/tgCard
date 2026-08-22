import type { CardElement, CardRarity } from "./card.js";

export const DECK_SIZE = 9;

export interface PlayerDeckCard {
  artKey: string | null;
  cardId: string;
  code: string;
  collectionId: string | null;
  displayName: string | null;
  element: CardElement;
  power: number;
  rarity: CardRarity;
  slot: number;
}

export interface PlayerDeckResponse {
  cards: PlayerDeckCard[];
  totalPower: number;
}
