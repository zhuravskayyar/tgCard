import type { CardElement, CardRarity } from "./card.js";

export const COLLECTION_MODIFIER_TYPES = [
  "battle_damage_pct",
  "battle_hp_pct",
  "element_damage_pct",
  "silver_reward_pct",
  "experience_reward_pct",
  "absorption_efficiency_pct",
  "deck_power_pct",
  "altar_gold_levels",
] as const;

export type CollectionModifierType = (typeof COLLECTION_MODIFIER_TYPES)[number];

/**
 * The game mode in which a collection bonus is active. `all_battles` is
 * intentionally separate from `all`: it never leaks into progression or
 * guild utility systems such as absorption and the altar.
 */
export const COLLECTION_BONUS_SCOPES = [
  "all_battles",
  "duel",
  "arena",
  "campaign",
  "guild_raid",
  "absorption",
  "altar",
] as const;

export type CollectionBonusScope = (typeof COLLECTION_BONUS_SCOPES)[number];

export const COLLECTION_SOURCES = ["standard", "raid"] as const;

export type CollectionSource = (typeof COLLECTION_SOURCES)[number];

export interface CollectionModifier {
  element?: CardElement;
  scope?: CollectionBonusScope;
  type: CollectionModifierType;
  value: number;
}

export interface CollectionCompletionNotice {
  bonus: CollectionModifier;
  bonusLabel: string;
  id: string;
  name: string;
}

export interface PlayerCollectionBonus {
  bonus: CollectionModifier;
  bonusLabel: string;
  collectionId: string;
  collectionName: string;
}

export interface PlayerCollectionSummary {
  bonus: CollectionModifier;
  bonusLabel: string;
  code: string;
  completed: boolean;
  completedAt: string | null;
  coverArtKey: string | null;
  discoveredCards: number;
  displayName: string;
  id: string;
  totalCards: number;
  source: CollectionSource;
}

export interface PlayerCollectionCard {
  artKey: string | null;
  code: string;
  collectionId: string | null;
  description: string;
  discovered: boolean;
  displayName: string;
  element: CardElement;
  id: string;
  limited?: boolean;
  minRarity: CardRarity;
  ownedCopies: number;
  strongestInstanceId: string | null;
}

export interface PlayerCollectionsResponse {
  collections: PlayerCollectionSummary[];
  limitedCards?: PlayerCollectionCard[];
}

export interface PlayerCollectionResponse {
  cards: PlayerCollectionCard[];
  collection: PlayerCollectionSummary;
}

export interface PlayerCollectionCardResponse {
  card: PlayerCollectionCard;
  collection: PlayerCollectionSummary;
}
