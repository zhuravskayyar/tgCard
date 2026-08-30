import type { CardRarity } from "./card.js";
import type { DuelBattleModifiers, DuelCardSnapshot, ElementMultiplier } from "./duel.js";
import type { CollectionCompletionNotice } from "./collection.js";
import type { LeagueDefinition } from "./leagues.js";
import type { PlayerSummary } from "./player.js";

export type ArenaStatus = "active" | "finished";
export type ArenaOutcome = "win" | "loss";
export type ArenaCosmeticType = "avatar" | "frame" | "card_back" | "title";

export interface ArenaQueueView {
  createdAt: string;
  maxParticipants: number;
  participantCount: number;
  queueId: string;
  startsAt: string;
}

export interface ArenaCardSlot {
  card: DuelCardSnapshot | null;
  cooldownUntil: string | null;
}

export interface ArenaParticipantView {
  alive: boolean;
  cooldownUntil: [string | null, string | null, string | null];
  effectiveDeckPower: number;
  hp: number;
  id: string;
  isBot: boolean;
  kills: number;
  level: number;
  maxHp: number;
  name: string;
  photoUrl: string | null;
  placement?: number;
  totalDamageDealt: number;
}

export interface ArenaBattleLogEntry {
  attackerCard?: DuelCardSnapshot;
  attackerId: string;
  attackerName: string;
  attackerPhotoUrl: string | null;
  damage: number;
  id: string;
  multiplier: ElementMultiplier;
  slotIndex: 0 | 1 | 2;
  targetCard?: DuelCardSnapshot;
  targetDefeated: boolean;
  targetId: string;
  targetName: string;
}

export interface ArenaLeagueView extends Pick<LeagueDefinition, "accentColor" | "division" | "iconKey" | "key" | "maxRating" | "minRating" | "name"> {
  baseSilver: number;
  index: number;
}

export interface ArenaRewardView {
  arenaTokens: number;
  gold: number;
  goldCapped: boolean;
  placement: number;
  ratingAfter: number;
  ratingBefore: number;
  ratingChange: number;
  silver: number;
  status: ArenaOutcome;
}

export interface ArenaResult {
  leagueAfter: ArenaLeagueView;
  leagueBefore: ArenaLeagueView;
  player: PlayerSummary;
  reward: ArenaRewardView;
}

export interface ArenaView {
  arenaTokens: number;
  battleLog: ArenaBattleLogEntry[];
  changeCardsCost: number;
  matchId: string;
  participants: ArenaParticipantView[];
  playerGold: number;
  playerId: string;
  playerSlots: [ArenaCardSlot, ArenaCardSlot, ArenaCardSlot];
  result?: ArenaResult;
  status: ArenaStatus;
  targetId: string | null;
  targetSlots: [ArenaCardSlot, ArenaCardSlot, ArenaCardSlot] | null;
  version: number;
}

export interface ArenaProfileResponse {
  arenaLeague: ArenaLeagueView;
  arenaRating: number;
  arenaTokens: number;
  arenaTop3Count: number;
  arenaWins: number;
  cardShards: number;
  cosmetics: ArenaCosmetic[];
  equippedCosmetics: Partial<Record<ArenaCosmeticType, string>>;
}

export interface ArenaQueueResponse {
  match: ArenaView | null;
  queue: ArenaQueueView | null;
  queueId: string;
}

export interface ActiveArenaResponse {
  arena: ArenaView | null;
  queue: ArenaQueueView | null;
}

export interface ArenaActionRequest {
  expectedVersion: number;
  slotIndex: 0 | 1 | 2;
}

export interface ArenaVersionRequest {
  expectedVersion: number;
  targetId?: string;
}

export interface ArenaShopItem {
  cosmeticType?: ArenaCosmeticType;
  displayName: string;
  equipmentRarity?: CardRarity;
  id: string;
  price: number;
  quantity?: number;
  rewardType: "card" | "cosmetic" | "equipment" | "shards";
}

export interface ArenaShopCatalogResponse {
  items: ArenaShopItem[];
}

export interface ArenaShopPurchaseRequest {
  offerId: string;
}

export interface ArenaShopPurchaseResponse {
  arenaTokens: number;
  cardShards: number;
  collectionCompleted?: CollectionCompletionNotice;
  message: string;
  playerGold: number;
  silver: number;
}

export interface ArenaCosmetic {
  displayName: string;
  id: string;
  owned: boolean;
  requiredArenaLeague?: number;
  type: ArenaCosmeticType;
}

export interface ArenaBattleParticipantSnapshot {
  activeSlots: [DuelCardSnapshot, DuelCardSnapshot, DuelCardSnapshot];
  cards: DuelCardSnapshot[];
  cooldownUntil: [string | null, string | null, string | null];
  effectiveDeckPower: number;
  hp: number;
  id: string;
  isBot: boolean;
  kills: number;
  lastBotActionAt: string | null;
  level: number;
  maxHp: number;
  modifiers: DuelBattleModifiers;
  name: string;
  photoUrl: string | null;
  placement?: number;
  reserveQueue: DuelCardSnapshot[];
  rotationSeenCardIds: string[];
  targetId: string | null;
  totalDamageDealt: number;
}

export interface ArenaPairInteractionSnapshot {
  attackerActiveSlots: [DuelCardSnapshot, DuelCardSnapshot, DuelCardSnapshot];
  attackerReserveQueue: DuelCardSnapshot[];
  attackerRotationSeenCardIds: string[];
  /** Kept optional only to migrate matches written by the previous pair-cooldown format. */
  cooldownUntil?: [string | null, string | null, string | null];
  targetActiveSlots: [DuelCardSnapshot, DuelCardSnapshot, DuelCardSnapshot];
  targetReserveQueue: DuelCardSnapshot[];
  targetRotationSeenCardIds: string[];
}
