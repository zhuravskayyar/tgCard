import type { PlayerCardInstance } from "./card.js";
import type {
  DuelCardSnapshot,
  DuelExchange,
  DuelOutcome,
  DuelSideSnapshot,
  DuelStatus,
} from "./duel.js";
import type { CollectionCompletionNotice } from "./collection.js";
import type { PlayerSummary } from "./player.js";

export type CampaignQuestState = "locked" | "active" | "completed" | "claimed";
export type CampaignStageState = "locked" | "active" | "completed";
export type CampaignBossState = "locked" | "unlocked" | "completed";
export type LariskaEmotion =
  | "neutral"
  | "happy"
  | "angry"
  | "sad"
  | "surprised"
  | "sly";
export type CampaignDialogueEmotion = LariskaEmotion;
export type CampaignDialogueTrigger =
  | "campaign_start"
  | "stage_start"
  | "quest_intro"
  | "quest_completed"
  | "stage_completed"
  | "boss_unlocked"
  | "boss_intro"
  | "boss_victory";
export type CampaignNavigationTarget = "deck" | "duel" | "shop" | "collections" | "weak";

export interface CampaignReward {
  silver: number;
  xp: number;
}

export interface CampaignDialogue {
  action?: CampaignNavigationTarget;
  emotion: CampaignDialogueEmotion;
  id: string;
  mascotId: "lariska";
  mascotName: "Лариска";
  questId?: string;
  stageId?: string;
  text: string[];
  trigger: CampaignDialogueTrigger;
}

export interface CampaignQuestView {
  description: string;
  dialogue: CampaignDialogue;
  id: string;
  navigation?: CampaignNavigationTarget;
  progress: number;
  reward: CampaignReward;
  state: CampaignQuestState;
  target: number;
  title: string;
}

export interface CampaignStageView {
  claimedCount: number;
  dialogue: CampaignDialogue;
  id: string;
  number: number;
  quests: CampaignQuestView[];
  state: CampaignStageState;
  title: string;
}

export interface AccountBoostStatus {
  active: boolean;
  expiresAt: string | null;
  multiplier: 1 | 2;
  type: "account_x2";
}

export interface CampaignBossSummary {
  dialogue: CampaignDialogue;
  deckSize: number;
  hiddenCardCount: number;
  level: number;
  name: "Мантикора";
  reward: CampaignReward & {
    card: {
      level: number;
      name: "Мантикора";
      rarity: "rare";
    };
  };
  state: CampaignBossState;
  warning: string;
}

export interface CampaignReferralView {
  acceptedFriends: number;
  code: string;
  startParam: string;
}

export interface CampaignView {
  boost: AccountBoostStatus;
  boss: CampaignBossSummary;
  campaignId: "campaign_1";
  completedAt: string | null;
  referral: CampaignReferralView;
  stages: CampaignStageView[];
  title: string;
}

export interface CampaignQuestClaimResponse {
  alreadyClaimed: boolean;
  campaign: CampaignView;
  levelUpGold: number;
  player: PlayerSummary;
  questId: string;
  reachedLevels: number[];
  reward: CampaignReward;
}

export interface HiddenBossCardSlot {
  hidden: true;
  slotIndex: 0 | 1 | 2;
}

export interface CampaignBossOpponentView {
  level: number;
  name: "Мантикора";
  photoUrl: null;
  startingHp: number;
}

export interface CampaignBossResult {
  accountBoostMultiplier: 1 | 2;
  boostExpiresAt: string | null;
  collectionCompleted?: CollectionCompletionNotice;
  deckPower?: number;
  dialogues?: CampaignDialogue[];
  gold: number;
  newDiscovery?: boolean;
  outcome: DuelOutcome;
  player: PlayerSummary;
  reachedLevels: number[];
  rewardCard?: PlayerCardInstance;
  silver: number;
  xp: number;
}

export interface CampaignBossView {
  battleId: string;
  battleLog: DuelExchange[];
  enemyActiveCards: [HiddenBossCardSlot, HiddenBossCardSlot, HiddenBossCardSlot];
  enemyHp: number;
  enemyMaxHp: number;
  introDialogues: CampaignDialogue[];
  opponent: CampaignBossOpponentView;
  player: DuelSideSnapshot;
  playerActiveCards: [DuelCardSnapshot, DuelCardSnapshot, DuelCardSnapshot];
  playerHp: number;
  playerMaxHp: number;
  result?: CampaignBossResult;
  status: DuelStatus;
  turnNumber: number;
  version: number;
}

export interface ActiveCampaignBossResponse {
  battle: CampaignBossView | null;
}
