import type { CardElement } from "./card.js";
import type { DuelCardSnapshot, DuelExchange, DuelSideSnapshot, ElementMultiplier } from "./duel.js";

/** Keys follow Cardastika's existing league names, not the reference's names. */
export type TournamentLeague = "conqueror" | "champion" | "master" | "ruler" | "crown";
export type TournamentRegularLeague = Exclude<TournamentLeague, "crown">;

export const TOURNAMENT_CHAT_MAX_LENGTH = 240;

export interface TournamentChatMessage {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

export interface TournamentChatView {
  messages: TournamentChatMessage[];
}

export interface TournamentSchedule {
  league: TournamentLeague;
  startsAt: string;
  registrationOpensAt: string;
  registrationOpen: boolean;
  /** Tournament clock offset; Cardastika uses GMT (UTC+0). */
  utcOffsetMinutes: number;
}

export interface TournamentPrize {
  badge: "cup_1" | "cup_2" | "cup_3" | "cup_4" | "quarterfinal" | "eighthfinal" | "participant" | null;
  diamonds: number;
  reward: { kind: "card" | "source"; level: number; cardCodes: readonly string[] } | null;
}

export interface TournamentLobbyView {
  eligible: boolean;
  requiredDuelRating: number;
  duelRating: number;
  rating: number;
  ratingProvisional: boolean;
  league: TournamentRegularLeague;
  leagueName: string;
  schedule: TournamentSchedule;
  prizes: { label: string; prize: TournamentPrize }[];
  leagues: {
    league: TournamentLeague;
    name: string;
    minimumRating: number;
    hours: readonly number[];
    requiresMasterCup: boolean;
    weeklyQualification: boolean;
  }[];
  /** Registration stays closed until the persistent PvP coordinator is implemented. */
  registrationAvailable: boolean;
  rules: {
    registrationMinutes: number;
    cycleSeconds: number;
    roundSeconds: number;
    freeCardChanges: number;
    hpMultiplier: number;
    buffGold: number;
    buffPercent: number;
    collectionBuffPercent: number;
  };
}

export interface TournamentRunView {
  id: string;
  status: "buff_selection" | "battle" | "between_rounds" | "finished" | "eliminated";
  league: TournamentRegularLeague;
  round: number;
  playerDeck: DuelCardSnapshot[];
  player: DuelSideSnapshot;
  match: {
    id: string;
    opponent: DuelSideSnapshot & { id: string };
    playerCards: [DuelCardSnapshot | null, DuelCardSnapshot | null, DuelCardSnapshot | null];
    opponentCards: [DuelCardSnapshot | null, DuelCardSnapshot | null, DuelCardSnapshot | null];
    pairMultipliers: [ElementMultiplier, ElementMultiplier, ElementMultiplier];
    playerUsedSlots: [boolean, boolean, boolean];
    playerCycleEndsAt: number;
    playerHp: number;
    playerMaxHp: number;
    opponentHp: number;
    opponentMaxHp: number;
    log: DuelExchange[];
  } | null;
  bracket: { id: string; round: number; participants: [string, string]; winner: string | null }[];
  lastExchange: DuelExchange | null;
  standings?: { place: 1 | 2 | 3 | 4; participant: DuelSideSnapshot }[];
  placement?: number;
  prize?: TournamentPrize;
  buffOptions?: [TournamentBuffOption, TournamentBuffOption];
  buffCost?: number;
  goldAvailable?: number;
  buffTestMode?: boolean;
}

export interface TournamentSeed {
  playerId: string;
  rating: number;
}

export type TournamentMatchSource =
  | { kind: "player"; playerId: string }
  | { kind: "winner" | "loser"; matchId: string };

export interface TournamentBracketMatch {
  id: string;
  lane: "upper" | "lower" | "final" | "bronze" | "reset";
  round: number;
  sides: [TournamentMatchSource, TournamentMatchSource];
}

export interface TournamentMatchResult {
  winnerId: string;
  loserId: string;
}

export interface TournamentBuffOption {
  element: CardElement;
  addedPower: number;
}
