export const CARD_ELEMENTS = ["fire", "water", "air", "earth"] as const;

export type CardElement = (typeof CARD_ELEMENTS)[number];

export const CARD_RARITIES = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
  "mythic",
] as const;

export type CardRarity = (typeof CARD_RARITIES)[number];

export interface CardDefinition {
  code: string;
  collectionId: string | null;
  element: CardElement;
  id: string;
  power: number;
  rarity: CardRarity;
}

export interface PlayerCard {
  cardId: string;
  code: string;
  collectionId: string | null;
  element: CardElement;
  power: number;
  quantity: number;
  rarity: CardRarity;
}

export interface PlayerCardsResponse {
  cards: PlayerCard[];
}
