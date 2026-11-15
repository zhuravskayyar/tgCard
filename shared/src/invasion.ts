import type { DuelCardSnapshot } from "./duel.js";

/** API contract for «Навала Шуліки» (docs/reference-elem-invasion.md). */

export interface InvasionBossView {
  /** 1–24. */
  number: number;
  total: number;
  cardId: string;
  name: string;
  artKey: string | null;
  health: number;
  maxHealth: number;
  /** ISO; in the future while the boss is in its 15-minute pause or the invasion has not started. */
  appearsAt: string;
}

export interface InvasionStandingView {
  place: number;
  damage: number;
  ahead: { place: number; gap: number } | null;
  behind: { place: number; gap: number } | null;
}

export interface InvasionAttackQuoteView {
  attackNumber: number;
  /** ISO time when a free attack becomes available, or null when it already is. */
  readyAt: string | null;
  gold: number;
  autoGold: number;
}

export interface InvasionBattleSlotView {
  card: DuelCardSnapshot;
  readyCycle: number;
}

export interface InvasionLogEntry {
  slotIndex: 0 | 1 | 2;
  turnNumber: number;
  playerCard: DuelCardSnapshot;
  bossCard: DuelCardSnapshot;
  playerDamage: number;
  playerMultiplier: number;
  bossDamage: number;
  bossMultiplier: number;
  superStrike: boolean;
}

export interface InvasionBattleView {
  id: string;
  version: number;
  bossNumber: number;
  /** ISO start of the fight; cycles count from here. */
  startedAt: string;
  /** Server clock at response time, ISO, so the client can sync the cycle timer. */
  serverNow: string;
  cycleMs: number;
  cycleIndex: number;
  playerHp: number;
  playerMaxHp: number;
  playerSlots: InvasionBattleSlotView[];
  bossSlots: DuelCardSnapshot[];
  /** Last 6 strikes, newest last. */
  log: InvasionLogEntry[];
  damageDealt: number;
  finished: boolean;
}

export interface InvasionAttackResultView {
  bossNumber: number;
  damage: number;
  superStrikes: number;
  xp: number;
  silver: number;
  /** Diamonds into «Алмазні нагороди» for this attack (norm + random bonus). */
  diamonds: number;
  bossKilled: boolean;
}

export type InvasionPrizeKindView = "first_place" | "damage" | "super_strike";

export interface InvasionPrizeView {
  bossNumber: number;
  kind: InvasionPrizeKindView;
  cardId: string;
  cardName: string;
  level: number;
  finalPower: number;
}

/** Shown once when the player first opens the page after a boss they fought died. */
export interface InvasionBossDefeatView {
  bossNumber: number;
  bossName: string;
  attacks: number;
  lastAttack: { xp: number; silver: number } | null;
  prizes: InvasionPrizeView[];
}

export interface InvasionTopRow {
  place: number;
  playerId: string;
  name: string;
  damage: number;
}

export interface InvasionView {
  unlocked: boolean;
  /** Name of the league that opens the invasion (for the gate screen). */
  requiredLeagueName: string;
  invasionNumber: number;
  /** ISO start of the current invasion (in the future between invasions). */
  startsAt: string;
  boss: InvasionBossView | null;
  /** Server clock at response time (ISO); the client syncs all countdowns to it. */
  serverNow: string;
  /** Current gold balance after the action, so the HUD stays in sync. Null on the gate screen. */
  gold: number | null;
  /** Deck power used for HP and silver: battle deck + extra cards, with bonuses. */
  deckPower: number;
  powerBonusPct: number;
  attacksMade: number;
  /** «Дозвіл на полювання»: permits owned and whether one is active on the current boss (−50% prices). */
  huntingPermit: { owned: number; activeOnBoss: boolean };
  /** Diamonds earned today toward the daily norm, and the norm itself (8, or 16 with «Шукачі скарбів»). */
  diamondsToday: { norm: number; limit: number };
  quote: InvasionAttackQuoteView | null;
  standing: InvasionStandingView | null;
  top: InvasionTopRow[];
  battle: InvasionBattleView | null;
  lastResult: InvasionAttackResultView | null;
  defeats: InvasionBossDefeatView[];
}

export interface InvasionAttackRequest {
  /** Gold the client showed; the server refuses if the real price is higher. */
  expectedGold: number;
}

export interface InvasionStrikeRequest {
  battleId: string;
  expectedVersion: number;
  slotIndex: 0 | 1 | 2;
}

export interface InvasionSwapRequest {
  battleId: string;
  expectedVersion: number;
}

export interface InvasionGuildRatingRow {
  place: number;
  guildId: string;
  name: string;
  damage: number;
}

export interface InvasionGuildRatingResponse {
  invasionNumber: number;
  rows: InvasionGuildRatingRow[];
}
