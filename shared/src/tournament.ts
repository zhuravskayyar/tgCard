import type { CardElement } from "./card.js";
import { CHAT_MAX_LENGTH, type ChatMessage, type ChatView } from "./chat.js";
import type { DuelCardSnapshot, DuelExchange, DuelSideSnapshot, ElementMultiplier } from "./duel.js";

/** Keys follow Cardastika's existing league names, not the reference's names. */
export type TournamentLeague = "conqueror" | "champion" | "master" | "ruler" | "crown";
export type TournamentRegularLeague = Exclude<TournamentLeague, "crown">;

export const TOURNAMENT_CHAT_MAX_LENGTH = CHAT_MAX_LENGTH;
export type TournamentChatMessage = ChatMessage;
export type TournamentChatView = ChatView;

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
  /** Duel league that matches the reference's 2000 duel rating (third epic). */
  requiredDuelLeagueName: string;
  duelRating: number;
  rating: number;
  /** True until the first tournament fixes a separate rating. */
  ratingProvisional: boolean;
  /** Sub-league on the reference rating scale, e.g. "Підкорювач III". */
  ratingLeagueIndex: number;
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
  /** The player's league event for the coming start, once registration has opened. */
  event: {
    id: string;
    startsAt: string;
    status: TournamentEventStatus;
    registeredCount: number;
    registered: boolean;
  } | null;
  /** Final places from the latest completed event in this tournament league. */
  lastResults: {
    standings: TournamentStanding[];
  } | null;
  /** True while the player has a running or just-finished event to open. */
  runAvailable: boolean;
  /** True while the player still plays in a running event; registration waits until it ends. */
  runActive: boolean;
  /** Server clock, so lobby countdowns match the round clock. */
  serverNow: number;
  /** Local development only: lets one tester schedule an event in a minute. */
  devScheduleAvailable: boolean;
  rules: {
    registrationMinutes: number;
    cycleSeconds: number;
    roundSeconds: number;
    buffWindowSeconds: number;
    freeCardChanges: number;
    hpMultiplier: number;
    buffGold: number;
    buffPercent: number;
    collectionBuffPercent: number;
  };
}

/** Cups and medals earned in tournaments, for the profile. */
export interface TournamentAwardsView {
  played: number;
  rating: number | null;
  ratingLeagueIndex: number | null;
  cups: number;
  medals: number;
  awards: { league: TournamentRegularLeague; badge: NonNullable<TournamentPrize["badge"]>; count: number }[];
}

/** Cups and medals earned in tournaments, for the profile. */
export interface TournamentAwardsView {
  played: number;
  rating: number | null;
  ratingLeagueIndex: number | null;
  cups: number;
  medals: number;
  awards: { league: TournamentRegularLeague; badge: NonNullable<TournamentPrize["badge"]>; count: number }[];
}

export type TournamentEventStatus = "registration" | "running" | "finished" | "cancelled";

export interface TournamentRunMatchView {
  id: string;
  opponent: DuelSideSnapshot & { id: string };
  playerCards: [DuelCardSnapshot, DuelCardSnapshot, DuelCardSnapshot];
  opponentCards: [DuelCardSnapshot, DuelCardSnapshot, DuelCardSnapshot];
  pairMultipliers: [ElementMultiplier, ElementMultiplier, ElementMultiplier];
  playerUsedSlots: [boolean, boolean, boolean];
  cycleEndsAt: number;
  playerHp: number;
  playerMaxHp: number;
  opponentHp: number;
  opponentMaxHp: number;
  playerDamage: number;
  opponentDamage: number;
  /** Both sides' strikes, newest first, written from this player's side. */
  log: (DuelExchange & { ownStrike: boolean })[];
  freeChangeAvailable: boolean;
  buffElement: CardElement | null;
  outcome: "win" | "loss" | null;
  ratingChange: number | null;
  xp: number | null;
}

export interface TournamentRunView {
  eventId: string;
  league: TournamentRegularLeague;
  leagueName: string;
  /**
   * waiting: registered, the event has not started yet;
   * buff_selection: paired, the battle starts at stage.battleStartsAt;
   * battle: the round is live;
   * round_wait: this match is over and the player waits for the next pairing.
   */
  status: "waiting" | "buff_selection" | "battle" | "round_wait" | "eliminated" | "finished" | "cancelled";
  startsAt: string;
  serverNow: number;
  participants: number;
  stage: { index: number; label: string; pairedAt: number; battleStartsAt: number; endsAt: number } | null;
  player: DuelSideSnapshot | null;
  match: TournamentRunMatchView | null;
  buffOptions?: [TournamentBuffOption, TournamentBuffOption];
  buffCost: number;
  goldAvailable: number;
  rating: number;
  ratingChange: number;
  xpEarned: number;
  standings?: TournamentStanding[];
  placement?: number;
  /** Finish category, e.g. "1/8" or "Відбір", for players without a cup. */
  finishLabel?: string;
  prize?: TournamentPrize;
  /** Sources do not exist in the game yet; such a prize stays recorded but unpaid. */
  prizeGranted?: { cardName: string | null; diamonds: number; sourcePending: boolean };
}

/** A prize winner as the results screen shows them: portrait, name, guild and the mage's element. */
export interface TournamentPodiumParticipant {
  playerId: string;
  name: string;
  photoUrl: string | null;
  level: number;
  guildName: string | null;
  /** Sub-league computed from this player's event-start rating. */
  leagueIndex: number;
  /** Dominant element of the tournament deck; colours the champion's mage. */
  element: CardElement | null;
}

export interface TournamentStanding {
  place: 1 | 2 | 3 | 4;
  participant: TournamentPodiumParticipant;
}

export type TournamentRunAction =
  | { type: "buff"; matchId: string; element: CardElement }
  | { type: "attack"; matchId: string; slotIndex: 0 | 1 | 2 }
  | { type: "change"; matchId: string };

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
