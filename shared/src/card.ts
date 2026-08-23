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
  artKey: string | null;
  code: string;
  collectionId: string | null;
  displayName: string | null;
  element: CardElement;
  id: string;
}

export interface PlayerCardInstance {
  artKey: string | null;
  basePower: number;
  bonusPower: number;
  cardId: string;
  code: string;
  collectionId: string | null;
  displayName: string | null;
  element: CardElement;
  finalPower: number;
  instanceId: string;
  level: number;
  rarity: CardRarity;
}

export type PlayerCard = PlayerCardInstance;

export interface PlayerCardsResponse {
  cards: PlayerCardInstance[];
}

export interface WeakPlayerCardsResponse {
  cards: PlayerCardInstance[];
}
