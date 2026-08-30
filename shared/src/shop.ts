import type { CardElement, CardRarity, PlayerCard } from "./card.js";
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
  limitedEvent?: LimitedShopEvent;
  offers: ShopOffer[];
}

export interface LimitedShopEvent {
  artKey: string | null;
  description: string;
  displayName: string;
  element: CardElement;
  endsAt: string;
  id: string;
  limited: true;
  rarity: CardRarity;
  redeemed: boolean;
}

export interface LimitedCardRedeemRequest {
  eventId: string;
  promoCode: string;
}

export interface LimitedCardRedeemResponse {
  deckChanged: boolean;
  deckPower?: number;
  message: "Лімітовану карту отримано";
  previousDeckPower?: number;
  reward: PlayerCard;
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

export interface CardWorkshopCard {
  artKey: string | null;
  cardId: string;
  cost: number;
  displayName: string | null;
  element: CardElement;
  ownedQuantity: number;
  rarity: CardRarity;
}

export interface CardWorkshopResponse {
  cardShards: number;
  cards: CardWorkshopCard[];
  rotationEndsAt: string;
}

export interface CardWorkshopCraftRequest {
  cardId: string;
}

export interface CardWorkshopCraftResponse {
  cardId: string;
  cardShards: number;
  quantity: number;
  shardsSpent: number;
  success: true;
}
