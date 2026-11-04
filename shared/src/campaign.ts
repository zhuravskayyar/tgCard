import type { CardRarity, PlayerCardInstance } from "./card.js";
import type {
  DuelCardSnapshot,
  DuelExchange,
  DuelOutcome,
  DuelSideSnapshot,
  DuelStatus,
} from "./duel.js";
import type { CollectionCompletionNotice } from "./collection.js";
import type { PlayerSummary } from "./player.js";

/** trials: the trials are not all claimed yet; open: the boss can be fought; passed: the boss was beaten once. */
export type CampaignLocationState = "trials" | "open" | "passed";
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

export interface AccountBoostStatus {
  active: boolean;
  expiresAt: string | null;
  multiplier: 1 | 2;
  type: "account_x2";
}

export interface CampaignBossCardDrop {
  level: number;
  rarity: CardRarity;
}

export interface CampaignLocationBossView {
  /** When a passed boss respawns; null when it can be fought now. */
  availableAt: string | null;
  canFight: boolean;
  drop: CampaignBossCardDrop;
  firstWinReward: { gold: number; silver: number };
  hp: number;
  name: string;
  respawnHours: number;
}

export interface CampaignLocationView {
  boss: CampaignLocationBossView;
  claimableTrials: number;
  name: string;
  number: number;
  state: CampaignLocationState;
  trialsClaimed: number;
  trialsTotal: number;
}

/** The campaign map: the current location first, then passed ones, newest first. */
export interface CampaignMapView {
  activeBattleLocation: number | null;
  locations: CampaignLocationView[];
  totalLocations: number;
}

export interface HiddenBossCardSlot {
  hidden: true;
  slotIndex: 0 | 1 | 2;
}

export interface CampaignBossOpponentView {
  level: number;
  name: string;
  photoUrl: null;
  startingHp: number;
}

export interface CampaignBossResult {
  accountBoostMultiplier: 1 | 2;
  boostExpiresAt: string | null;
  collectionCompleted?: CollectionCompletionNotice;
  cardIsWeak?: boolean;
  deckPower?: number;
  dialogues?: CampaignDialogue[];
  /** True only for the first win over this location's boss: it pays the big gold and silver reward. */
  firstWin?: boolean;
  gold: number;
  /** Hours until this boss can be fought again after a win. */
  respawnHours?: number;
  /** The quest giver's thanks shown on the result plate. */
  thanks?: string[];
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
  locationNumber: number;
  enemyActiveCards: [HiddenBossCardSlot, HiddenBossCardSlot, HiddenBossCardSlot];
  enemyHp: number;
  enemyMaxHp: number;
  introDialogues: CampaignDialogue[];
  opponent: CampaignBossOpponentView;
  player: DuelSideSnapshot;
  playerActiveCards: [DuelCardSnapshot, DuelCardSnapshot, DuelCardSnapshot];
  playerHp: number;
  playerMaxHp: number;
  rewardsGranted: boolean;
  result?: CampaignBossResult;
  status: DuelStatus;
  turnNumber: number;
  version: number;
}

export interface ActiveCampaignBossResponse {
  battle: CampaignBossView | null;
}
