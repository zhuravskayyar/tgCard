import type { CardRarity, PlayerCard } from "./card.js";
import type { CollectionCompletionNotice } from "./collection.js";

export const SHOP_CURRENCIES = ["silver", "gold"] as const;

export type ShopCurrency = (typeof SHOP_CURRENCIES)[number];

export interface ShopUpgradeChance {
  chance: number;
  increment: number;
  rarity: CardRarity;
}

export interface ShopOffer {
  canAfford: boolean;
  currency: ShopCurrency;
  guaranteedRarity: CardRarity;
  id: string;
  price: number;
  upgrades: ShopUpgradeChance[];
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

export interface ShopChanceState {
  chance: number;
  rarity: CardRarity;
}

export interface ShopPurchaseResponse {
  collectionCompleted?: CollectionCompletionNotice;
  deckChanged: boolean;
  deckPower?: number;
  newDiscovery: boolean;
  previousDeckPower?: number;
  reward: PlayerCard;
  updatedBalance: PlayerBalance;
  updatedChances: ShopChanceState[];
}
