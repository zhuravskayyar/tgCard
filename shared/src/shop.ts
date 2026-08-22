import type { CardRarity, PlayerCard } from "./card.js";

export const SHOP_CURRENCIES = ["silver", "gold"] as const;

export type ShopCurrency = (typeof SHOP_CURRENCIES)[number];

export interface ShopOffer {
  allowedRarities: CardRarity[];
  currency: ShopCurrency;
  id: string;
  minimumRarity: CardRarity;
  price: number;
}

export interface ShopCatalogResponse {
  offers: ShopOffer[];
}

export interface ShopPurchaseRequest {
  offerId: string;
}

export interface PlayerBalance {
  gold: number;
  silver: number;
}

export interface ShopPurchaseResponse {
  balance: PlayerBalance;
  deckChanged: boolean;
  deckPower?: number;
  reward: PlayerCard;
}
