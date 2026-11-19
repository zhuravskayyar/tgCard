import type { CardElement, CardRarity, PlayerCardInstance } from "./card.js";
import type {
  LariskaDailyRewardClaimResponse,
  LariskaDailyRewardView,
} from "./dailyRewards.js";
import type { PlayerBalance } from "./shop.js";

/** Magic items of «Алмазні нагороди». Unsupported entries remain listed but locked. */
export type BattlePassItemKind =
  | "chest_discount"
  | "dragon_heart"
  | "element_tincture"
  | "fourth_key"
  | "gold_legacy"
  | "hunting_permit"
  | "magic_crystal"
  | "magic_shovel"
  | "master_charter"
  | "miracle_heal"
  | "shuffle"
  | "stone_skin";

export type BattlePassReward =
  | { durationHours: 24; kind: "boost"; label: string; multiplier: 2 | 3 | 4 }
  | { available: boolean; item: BattlePassItemKind; kind: "item"; label: string }
  | { amount: number; kind: "silver"; label: string }
  | { amount: number; kind: "gold"; label: string }
  | { kind: "card"; label: string; levelSource: "lowest_deck" }
  | { kind: "equipment"; label: string; rarity: CardRarity };

/** One line of «Що може випасти»: what a reward or magic item does and how it is used. */
export interface BattlePassCatalogEntry {
  available: boolean;
  effect: string;
  /** Icon key: a reward kind, or the item kind for magic items. */
  icon: BattlePassReward["kind"] | BattlePassItemKind;
  id: string;
  title: string;
  usage: string;
}

export interface BattlePassCatalog {
  free: BattlePassCatalogEntry[];
  /** The one-of-each rule for magic items, with the gold paid for a duplicate. */
  uniqueRule: string;
  vip: BattlePassCatalogEntry[];
}

/** A magic item the player holds now. */
export interface BattlePassOwnedItem {
  item: BattlePassItemKind;
  quantity: number;
}

export interface CurrencyBoostStatus {
  active: boolean;
  expiresAt: string | null;
  multiplier: 1 | 2 | 3 | 4;
  type: "currency_x2";
}

/** The VIP reward on the same stop as a free one; claimable only with VIP bought this season. */
export interface BattlePassVipRewardView {
  claimable: boolean;
  claimed: boolean;
  id: string;
  reward: BattlePassReward;
}

export interface BattlePassMilestoneView {
  claimable: boolean;
  claimed: boolean;
  circle: number;
  id: string;
  reward: BattlePassReward | null;
  threshold: number;
  vip: BattlePassVipRewardView | null;
}

/** The circle's final card, shown before it is claimed (reference «Карта в колоду»). */
export interface BattlePassFinalCardPreview {
  artKey: string | null;
  cardId: string;
  code: string;
  displayName: string | null;
  element: CardElement;
  finalPower: number;
  level: number;
  rarity: CardRarity;
  /** True when VIP is bought: the card comes in the VIP frame. */
  vip: boolean;
}

export interface BattlePassCircleView {
  completed: boolean;
  circle: number;
  /** Only on the active circle; null while it cannot be shown (no deck yet). */
  finalCard?: BattlePassFinalCardPreview | null;
  /** Diamonds at which this circle starts: the final threshold of the previous circle. */
  fromDiamonds: number;
  milestones: BattlePassMilestoneView[];
  threshold: number;
}

export interface BattlePassVipStatus {
  active: boolean;
  /** Gold price of VIP for the current season. */
  price: number;
  purchasable: boolean;
}

export interface BattlePassView {
  /** Every reward and magic item of the season with its description. */
  catalog: BattlePassCatalog;
  circles: BattlePassCircleView[];
  currencyBoost: CurrencyBoostStatus;
  currentCircle: number | null;
  diamonds: number;
  endsAt: string;
  /** «Мої магічні предмети»: only items whose game system stores them. */
  ownedItems: BattlePassOwnedItem[];
  nextThreshold: number | null;
  seasonId: string;
  startsAt: string;
  totalCircles: number;
  vip: BattlePassVipStatus;
}

/** What one daily task pays today; currencies already include today's multiplier. */
export interface DailyTaskReward {
  card: { maxLevel: number; minLevel: number } | null;
  diamonds: number;
  equipment: CardRarity | null;
  gold: number;
  silver: number;
}

export interface DailyTaskView {
  claimed: boolean;
  completed: boolean;
  id: string;
  kind: "daily";
  progress: number;
  reward: DailyTaskReward;
  target: number;
  title: string;
}

export interface BattlePassPageResponse {
  battlePass: BattlePassView;
  daily: {
    completedCount: number;
    currentRewardMultiplier: 1 | 2 | 3;
    multiplierForTomorrow: 1 | 2 | 3;
    taskDate: string;
      tasks: DailyTaskView[];
    };
  dailyLogin: LariskaDailyRewardView;
}

export interface BattlePassClaimResponse extends BattlePassPageResponse {
  card?: PlayerCardInstance;
  /** Gold paid instead of an item the player already owns (max one of each kind). */
  convertedToGold?: number;
  equipmentItemId?: string;
  reward: BattlePassReward;
  updatedBalance?: PlayerBalance;
}

export interface BattlePassVipPurchaseResponse extends BattlePassPageResponse {
  updatedBalance: PlayerBalance;
}

export interface DailyTaskClaimResponse extends BattlePassPageResponse {
  card?: PlayerCardInstance;
  claimedTaskId: string;
  equipmentItemId?: string;
  updatedBalance: PlayerBalance;
}

export type DailyLoginClaimResponse = LariskaDailyRewardClaimResponse & BattlePassPageResponse;
