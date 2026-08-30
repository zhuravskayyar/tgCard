import type { PlayerCardInstance } from "./card.js";
import type {
  LariskaDailyRewardClaimResponse,
  LariskaDailyRewardView,
} from "./dailyRewards.js";
import type { PlayerBalance } from "./shop.js";

export type BattlePassReward =
  | { durationHours: 24; kind: "boost"; label: string; multiplier: 2 }
  | { amount: number; kind: "silver"; label: string }
  | { amount: number; kind: "gold"; label: string }
  | { kind: "card"; label: string; levelSource: "lowest_deck" };

export interface CurrencyBoostStatus {
  active: boolean;
  expiresAt: string | null;
  multiplier: 1 | 2;
  type: "currency_x2";
}

export interface BattlePassMilestoneView {
  claimable: boolean;
  claimed: boolean;
  circle: number;
  id: string;
  reward: BattlePassReward | null;
  threshold: number;
}

export interface BattlePassCircleView {
  completed: boolean;
  circle: number;
  milestones: BattlePassMilestoneView[];
  threshold: number;
}

export interface BattlePassView {
  circles: BattlePassCircleView[];
  currencyBoost: CurrencyBoostStatus;
  currentCircle: number | null;
  diamonds: number;
  endsAt: string;
  nextThreshold: number | null;
  seasonId: string;
  startsAt: string;
}

export interface DailyTaskView {
  claimed: boolean;
  completed: boolean;
  id: string;
  progress: number;
  rewardDiamonds: number;
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
  reward: BattlePassReward;
  updatedBalance?: PlayerBalance;
}

export interface DailyTaskClaimResponse extends BattlePassPageResponse {
  claimedTaskId: string;
}

export type DailyLoginClaimResponse = LariskaDailyRewardClaimResponse & BattlePassPageResponse;
