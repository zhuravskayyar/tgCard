import type { CardElement, CardRarity } from "./card.js";
import type { EquipmentBattleModifiers, EquipmentBattleState } from "./equipment.js";
import type { PlayerSummary } from "./player.js";
import type { LeagueProgressionResult } from "./leagues.js";

export type DuelStatus = "active" | "won" | "lost";
export type DuelOutcome = "win" | "loss";
export type ElementMultiplier = 0.5 | 1 | 1.5;
export type DuelCardSource = "deck" | "guild";

export interface DuelBattleModifiers {
  battleDamagePct: number;
  battleHpPct: number;
  deckPowerPct: number;
  elementDamagePct: Record<CardElement, number>;
  experienceRewardPct: number;
  silverRewardPct: number;
  equipment?: EquipmentBattleModifiers;
  equipmentState?: EquipmentBattleState;
}

export interface DuelCardSnapshot {
  artKey: string | null;
  basePower: number;
  bonusPower: number;
  cardId: string;
  code: string;
  displayName: string | null;
  element: CardElement;
  finalPower: number;
  instanceId: string;
  level: number;
  limited?: boolean;
  rarity: CardRarity;
  source?: DuelCardSource;
}

export interface DuelSideSnapshot {
  /** Real players only; bots have none. Keys the default portrait. */
  playerId?: string;
  cards: DuelCardSnapshot[];
  effectiveDeckPower: number;
  level: number;
  modifiers: DuelBattleModifiers;
  name: string;
  photoUrl: string | null;
  startingHp: number;
  /** Equipped artifact ids, shown to everyone in battles where artifacts work. */
  artifactItemIds?: string[];
}

export interface DuelOpponentPreview {
  effectiveDeckPower: number;
  level: number;
  name: string;
  photoUrl: string | null;
  powerDifferencePct: number;
}

export interface DuelPlayerPowerPreview {
  /** Unmodified deck power, identical to the value shown in TopHud. */
  deckPower: number;
  equipmentPowerBonus: number;
  collectionPowerBonus: number;
  effectiveDeckPower: number;
}

export interface DuelSearchResponse {
  opponent: DuelOpponentPreview;
  player: DuelPlayerPowerPreview;
  searchId: string;
}

export interface DuelStartRequest {
  searchId: string;
  tutorial?: boolean;
}

export interface DuelActionRequest {
  expectedVersion: number;
  slotIndex: 0 | 1 | 2;
}

export interface DuelExchange {
  enemyCard: DuelCardSnapshot;
  enemyDamage: number;
  enemyMultiplier: ElementMultiplier;
  playerCard: DuelCardSnapshot;
  playerDamage: number;
  playerMultiplier: ElementMultiplier;
  slotIndex: 0 | 1 | 2;
  turnNumber: number;
  visualState: DuelLogVisualState;
}

export type DuelLogVisualState = "player_strong" | "enemy_strong" | "neutral";

export interface DuelResult {
  accountBoostMultiplier: 1 | 2;
  boostExpiresAt: string | null;
  duelGoldReward?: number;
  gold: number;
  levelUpGoldReward?: number;
  outcome: DuelOutcome;
  player: PlayerSummary;
  leagueProgression?: LeagueProgressionResult;
  reachedLevels: number[];
  promotionReward?: number;
  silver: number;
  silverReward?: number;
  totalSilverEarned?: number;
  winStreak: number;
  xp: number;
}

export interface DuelView {
  battleLog: DuelExchange[];
  duelId: string;
  enemyActiveCards: [DuelCardSnapshot, DuelCardSnapshot, DuelCardSnapshot];
  enemyHp: number;
  enemyMaxHp: number;
  opponent: DuelSideSnapshot;
  pairMultipliers: [ElementMultiplier, ElementMultiplier, ElementMultiplier];
  player: DuelSideSnapshot;
  playerActiveCards: [DuelCardSnapshot, DuelCardSnapshot, DuelCardSnapshot];
  playerHp: number;
  playerMaxHp: number;
  result?: DuelResult;
  status: DuelStatus;
  turnNumber: number;
  version: number;
}

export interface ActiveDuelResponse {
  duel: DuelView | null;
  availability: DuelAvailability;
}

export interface DuelAvailability {
  remaining: number;
  max: number;
  refillAt: string | null;
  /** Gold won in Duels today; resets daily and on level-up. */
  goldEarnedToday: number;
  goldDailyLimit: number;
  /** Gold to play the remaining charges automatically (1 per Duel); 0 when none remain. */
  autoRemainingPrice: number;
  /** Gold to reopen ten Duels or play ten automatically during the break; null outside it. */
  breakPrice: number | null;
}

/** "remaining" plays the charges left; "pack" plays ten during the break. */
export type DuelAutoMode = "remaining" | "pack";

export interface DuelAutoRequest {
  mode: DuelAutoMode;
}

export interface DuelAutoResult {
  played: number;
  wins: number;
  losses: number;
  xp: number;
  silver: number;
  /** Duel and level-up gold earned by the fights. */
  gold: number;
  goldSpent: number;
  ratingChange: number;
  reachedLevels: number[];
  player: PlayerSummary;
  availability: DuelAvailability;
}

export interface DuelResetResponse {
  availability: DuelAvailability;
  gold: number;
}
