import type { CardElement, CardRarity, PlayerCard } from "./card.js";
import type { CollectionCompletionNotice, PlayerCollectionCard, PlayerCollectionSummary } from "./collection.js";

export const SHOP_CURRENCIES = ["silver", "gold"] as const;

export type ShopCurrency = (typeof SHOP_CURRENCIES)[number];

export interface ShopUpgradeChance {
  chance: number;
  increment: number;
  rarity: CardRarity;
}

export interface ShopPoolCard {
  displayName: string;
  element: CardElement;
  id: string;
}

export interface ShopPoolGroup {
  cards: ShopPoolCard[];
  rarity: CardRarity;
}

export interface ShopOffer {
  canAfford: boolean;
  currency: ShopCurrency;
  /** Today's free card purchase («Шулікова зграя») applies to this offer. */
  free?: boolean;
  guaranteedRarity: CardRarity;
  id: string;
  pool: ShopPoolGroup[];
  price: number;
  upgrades: ShopUpgradeChance[];
}

export interface ShopCatalogResponse {
  bundles: ShopBundleOffer[];
  limitedEvent?: LimitedShopEvent;
  offers: ShopOffer[];
}

export interface ShopCardInfoResponse {
  card: PlayerCollectionCard;
  collections: PlayerCollectionSummary[];
}

export interface ShopBundleOffer {
  canAfford: boolean;
  cardCount: number;
  currency: ShopCurrency;
  id: string;
  price: number;
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

export interface ShopBundlePurchaseRequest {
  bundleId: string;
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

export interface ShopBundlePurchaseResponse {
  collectionCompleted?: CollectionCompletionNotice;
  deckChanged: boolean;
  deckPower?: number;
  newDiscoveryCardIds: string[];
  previousDeckPower?: number;
  rewards: PlayerCard[];
  updatedBalance: PlayerBalance;
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
  collectionCompleted?: CollectionCompletionNotice;
  deckChanged: boolean;
  deckPower?: number;
  newDiscovery: boolean;
  previousDeckPower?: number;
  quantity: number;
  reward: PlayerCard;
  shardsSpent: number;
  success: true;
}

/** A holiday bundle: `cardCount` distinct random cards of one collection at a fixed rarity. */
export interface HolidayShopBundle {
  canAfford: boolean;
  cardCount: number;
  collectionName: string;
  currency: ShopCurrency;
  displayName: string;
  /** A full-collection bundle: only undiscovered cards are granted, so `price` follows `missingCount`. */
  fullSet: boolean;
  id: string;
  /** Cards still to be granted: the undiscovered ones of a full set, otherwise `cardCount`. */
  missingCount: number;
  /** What the buy button costs now; for a full set this is the per-player price. */
  price: number;
  purchaseLimit: number;
  purchased: number;
  rarity: CardRarity;
}

/** One yearly occurrence of a holiday; `endsAt` is exclusive. */
export interface HolidayShopEvent {
  active: boolean;
  bundles: HolidayShopBundle[];
  description: string;
  displayName: string;
  endsAt: string;
  id: string;
  startsAt: string;
}

/** Active holidays first, then the next upcoming one so the tab is never blank. */
export interface HolidayShopResponse {
  holidays: HolidayShopEvent[];
}

export interface HolidayBundlePurchaseRequest {
  bundleId: string;
  /** The price the button showed; the server refuses another price with `price_changed`. */
  expectedPrice?: number;
}

export interface HolidayBundlePurchaseResponse extends ShopBundlePurchaseResponse {
  bundleId: string;
  purchased: number;
}

/** A card of a pack collection and whether the player has discovered it. */
export interface CollectionPackCard {
  cardId: string;
  discovered: boolean;
  displayName: string | null;
  element: CardElement;
  rarity: CardRarity;
}

/** «Повна колекція»: every card of one collection, each at its own minimum rarity. */
export interface CollectionPackSetOffer {
  canAfford: boolean;
  cards: CollectionPackCard[];
  /** The completion bonus text of the collection, as on the collections screen; empty when it has none. */
  bonusLabel: string;
  collectionName: string;
  /** `set:<collection code>` */
  id: string;
  /** Undiscovered cards: the offer grants only these, so `price` is the per-player price. */
  missingCount: number;
  price: number;
  purchaseLimit: number;
  purchased: number;
}

/** «Випадкова карта»: one random card of the pack, undiscovered species first. */
export interface CollectionPackRandomOffer {
  canAfford: boolean;
  discoveredCount: number;
  /** `random:<pack id>` */
  id: string;
  price: number;
  totalCount: number;
}

export interface CollectionPackView {
  displayName: string;
  id: string;
  randomOffer: CollectionPackRandomOffer;
  /** Whole weeks until this pack is on sale again (it leaves at the end of this week). */
  returnsInWeeks: number;
  setOffers: CollectionPackSetOffer[];
}

/** The two packs on sale this ISO week; `endsAt` (next Monday 00:00 UTC) is exclusive. */
export interface CollectionPacksResponse {
  endsAt: string;
  /** Display names of the packs on sale next week. */
  nextWeekPackNames: string[];
  packs: CollectionPackView[];
}

export interface CollectionPackPurchaseRequest {
  /** The price the button showed; the server refuses another price with `price_changed`. */
  expectedPrice?: number;
  offerId: string;
}

export interface CollectionPackPurchaseResponse extends ShopBundlePurchaseResponse {
  offerId: string;
  /** Full-set purchases this week; 0 for a random card. */
  purchased: number;
}
