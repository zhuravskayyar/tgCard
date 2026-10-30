import type { PlayerSummary } from "./player.js";

export type StoryTrialState = "active" | "completed" | "claimed";
export type StoryTrialNavigationTarget = "duel" | "shop" | "deck" | "save-profile";

export interface StoryTrialReward {
  gold: number;
  silver: number;
}

export interface StoryTrialView {
  id: string;
  navigation: StoryTrialNavigationTarget;
  progress: number;
  reward: StoryTrialReward;
  state: StoryTrialState;
  target: number;
  title: string;
}

export interface StoryTrialsView {
  campaignUnlocked: boolean;
  completedCount: number;
  story: { caveName: string; text: string[]; title: string };
  totalCount: number;
  trials: StoryTrialView[];
}

export interface StoryTrialClaimResponse {
  alreadyClaimed: boolean;
  player: Pick<PlayerSummary, "gold" | "silver">;
  trials: StoryTrialsView;
}
