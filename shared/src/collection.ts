import type { CardElement, CardRarity } from "./card.js";

export const COLLECTION_MODIFIER_TYPES = [
  "none",
  "battle_damage_pct",
  "battle_hp_pct",
  "element_damage_pct",
  "silver_reward_pct",
  "experience_reward_pct",
  "absorption_efficiency_pct",
  "deck_power_pct",
  "altar_gold_levels",
  "duel_cooldown_minutes",
  "duel_gold_limit",
  "duel_gold_share_pct",
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

export const COLLECTION_BONUS_STATUSES = ["active", "partial", "pending", "unassigned"] as const;

export type CollectionBonusStatus = (typeof COLLECTION_BONUS_STATUSES)[number];

export interface CollectionModifier {
  element?: CardElement;
  scope?: CollectionBonusScope;
  type: CollectionModifierType;
  value: number;
}

export interface CollectionCompletionNotice {
  bonus: CollectionModifier;
  bonusLabel: string;
  completionReward: { diamonds: number; silver: number };
  completedCollections: Array<{ bonus: CollectionModifier; bonusLabel: string; id: string; name: string }>;
  id: string;
  name: string;
  winterFestiveUntil?: string;
}

export interface PlayerCollectionBonus {
  bonus: CollectionModifier;
  bonusLabel: string;
  collectionId: string;
  collectionName: string;
}

export interface PlayerCollectionSummary {
  bonus: CollectionModifier;
  bonusStatus: CollectionBonusStatus;
  bonusLabel: string;
  code: string;
  completed: boolean;
  completedAt: string | null;
  coverArtKey: string | null;
  description: string;
  discoveredCards: number;
  displayName: string;
  displayPrefix: string;
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
