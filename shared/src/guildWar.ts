import type { GuildRole } from "./guild.js";
import type { CardElement } from "./card.js";
import type { DuelBattleModifiers, DuelCardSnapshot, DuelExchange, DuelStatus } from "./duel.js";
import type { PlayerSummary } from "./player.js";

export type GuildWarPhase = "pairing" | "key_duels" | "mass_battle" | "results" | "rest";

export interface GuildWarParticipantView {
  deckPower: number;
  duelRating: number;
  level: number;
  name: string;
  playerId: string;
  role: GuildRole;
}

export interface GuildWarSideView {
  guildId: string | null;
  level: number;
  memberCount: number;
  name: string;
  warRating: number;
  roster: GuildWarParticipantView[];
}

export interface GuildWarMatchView {
  opponentDamage: number;
  opponentMassBattleWins: number;
  ownDamage: number;
  ownMassBattleWins: number;
  guild: GuildWarSideView;
  opponent: GuildWarSideView | null;
  winnerGuildId: string | null;
}

export interface GuildWarView {
  endsAt: string;
  isUnlocked: boolean;
  match: GuildWarMatchView | null;
  phase: GuildWarPhase;
  startsAt: string;
  viewerIsRostered: boolean;
  weekStartsAt: string;
  unlockLevel: number;
  keyDay?: GuildWarKeyDayView;
  battles?: GuildWarBattleView[];
  battleKeys?: number;
  plannedBattles?: { number: number; registrationAt: string; locationAt: string }[];
  history?: GuildWarHistoryView[];
  playerProgress?: GuildWarPlayerProgress;
}

export type GuildWarPlayerProgress = Pick<PlayerSummary, "accountXp" | "accountXpRequired" | "gold" | "level">;

export type GuildWarSlot = 0 | 1 | 2;
export type GuildWarSkill = "normal" | "berserk" | "ancient" | "ancient_crystal";
export type GuildWarCards = [DuelCardSnapshot, DuelCardSnapshot, DuelCardSnapshot];

export interface GuildWarFighterView {
  playerId: string;
  name: string;
  level: number;
  photoUrl: string | null;
  hp: number;
  maxHp: number;
  cards: GuildWarCards;
  readyAt: [number, number, number];
  berserkAvailable: boolean;
  ancientAvailable: boolean;
  crystalAvailable: boolean;
  strikeMultiplierBonus?: DuelBattleModifiers["strikeMultiplierBonus"];
  damage: number;
  version: number;
  lastExchange: DuelExchange | null;
  lastTargetId: string | null;
}

export interface GuildWarKeyDayView {
  attemptsLeft: number;
  keys: number;
  freeKeys: number;
  targets: { playerId: string; keysLeft: number; attacked: boolean }[];
  duel: {
    id: string;
    status: DuelStatus;
    xp: number;
    player: GuildWarFighterView;
    enemy: GuildWarFighterView;
  } | null;
}

export interface GuildWarLocationView {
  id: number;
  elements: [CardElement, CardElement];
}

export interface GuildWarBattleView {
  number: number;
  state: "upcoming" | "registration" | "location" | "wasteland" | "settled";
  registrationAt: string;
  locationAt: string;
  wastelandAt: string;
  endsAt: string;
  locations: [GuildWarLocationView, GuildWarLocationView];
  canJoin: boolean;
  lateJoinGold: number;
  locationId: number | null;
  player: GuildWarFighterView | null;
  targets: GuildWarFighterView[];
  earnedXp: number | null;
  alliesByLocation?: { locationId: number; names: string[] }[];
  winnerGuildId: string | null;
}

export interface GuildWarHistoryView {
  weekStartsAt: string;
  opponentName: string;
  ownWins: number;
  opponentWins: number;
  outcome: "win" | "loss" | "draw";
}

export type GuildWarAction =
  | { type: "start_duel"; targetId: string }
  | { type: "duel_strike"; duelId: string; version: number; slot: GuildWarSlot }
  | { type: "claim_key"; expectedKeys: number }
  | { type: "join_battle"; number: number; locationId: number; acceptLateFee: boolean }
  | { type: "battle_strike"; number: number; targetId: string; version: number; slot: GuildWarSlot; skill: GuildWarSkill };
