import type { CardElement, CardRarity, PlayerCardInstance } from "./card.js";
import type { LariskaEmotion } from "./campaign.js";

export type LariskaDailyRewardKind = "card" | "equipment" | "gold" | "arena_tokens_xp" | "choice";

export interface LariskaDailyCardOption {
  artKey: string | null;
  cardId: string;
  code: string;
  displayName: string | null;
  element: CardElement;
  kind: "card";
  level: number;
  rarity: CardRarity;
}

export interface LariskaDailyEquipmentOption {
  itemId: string;
  kind: "equipment";
  name: string;
  rarity: CardRarity;
  slot: string;
}

export interface LariskaDailyGoldOption {
  amount: number;
  kind: "gold";
  label: string;
}

export type LariskaDailyChoiceOption = LariskaDailyCardOption | LariskaDailyEquipmentOption | LariskaDailyGoldOption;

export interface LariskaDailyRewardSummary {
  amount?: number;
  arenaTokens?: number;
  description: string;
  kind: LariskaDailyRewardKind;
  label: string;
  legendaryChancePct?: number;
  options?: LariskaDailyChoiceOption[];
  rarity?: CardRarity;
  xp?: number;
}

export interface LariskaDailyCalendarDay {
  claimed: boolean;
  day: number;
  isCurrent: boolean;
  reward: LariskaDailyRewardSummary;
}

export interface LariskaStreakRewardView {
  claimed: boolean;
  label: string;
  threshold: 7 | 14 | 30;
}

export interface LariskaDailyRewardView {
  calendar: LariskaDailyCalendarDay[];
  claimDate: string;
  claimable: boolean;
  cycle: number;
  day: number;
  dialogue: {
    emotion: LariskaEmotion;
    text: string;
  };
  reward: LariskaDailyRewardSummary;
  streak: number;
  streakRewards: LariskaStreakRewardView[];
  totalClaims: number;
}

export interface LariskaDailyRewardPlayerState {
  accountXp: number;
  arenaTokens: number;
  gold: number;
  level: number;
  silver: number;
}

export type LariskaDailyRewardGrant =
  | {
      card: PlayerCardInstance;
      kind: "card";
      label: string;
    }
  | {
      equipment: LariskaDailyEquipmentOption;
      kind: "equipment";
      label: string;
    }
  | {
      amount: number;
      kind: "gold";
      label: string;
    }
  | {
      arenaTokens: number;
      kind: "arena_tokens_xp";
      label: string;
      xp: number;
    }
  | {
      cosmetic: {
        id: string;
        label: string;
      };
      kind: "cosmetic";
      label: string;
    };

export interface LariskaDailyRewardClaimRequest {
  choiceIndex?: number | null;
}

export interface LariskaDailyRewardClaimResponse {
  claimedCycle: number;
  claimedDay: number;
  dailyLogin: LariskaDailyRewardView;
  grant: LariskaDailyRewardGrant;
  rewardPlayer: LariskaDailyRewardPlayerState;
  streakBonus?: LariskaDailyRewardGrant;
}
