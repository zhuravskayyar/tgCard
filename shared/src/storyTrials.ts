import type { PlayerSummary } from "./player.js";

export type StoryTrialState = "active" | "completed" | "claimed";
export type StoryTrialNavigationTarget = "duel" | "shop" | "deck" | "save-profile" | "collections" | "tasks" | "arena" | "weak" | "guild" | "battle-pass";

export interface StoryTrialReward {
  gold: number;
  silver: number;
}

export interface StoryTrialView {
  /** False when the trial needs a game system that is not built yet; it shows as coming soon. */
  available: boolean;
  id: string;
  kind: "campaign";
  navigation: StoryTrialNavigationTarget | null;
  progress: number;
  reward: StoryTrialReward;
  state: StoryTrialState;
  target: number;
  title: string;
}

/** The current campaign location's story and trials, as on the reference story screen. */
export interface StoryTrialsView {
  /** True once location 1's trials are all claimed (its boss can be fought). */
  campaignUnlocked: boolean;
  completedCount: number;
  location: { giverArtKey: string | null; giverCardId: string | null; giverName: string; number: number };
  story: { caveName: string; text: string[]; title: string };
  totalCount: number;
  trials: StoryTrialView[];
}

export interface StoryTrialClaimResponse {
  alreadyClaimed: boolean;
  player: Pick<PlayerSummary, "gold" | "silver">;
  trials: StoryTrialsView;
}
