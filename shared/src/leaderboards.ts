export const LEADERBOARD_REQUIRED_DUEL_WINS = 10;

export type LeaderboardKind = "duels" | "deck";

export interface LeaderboardEntry {
  displayName: string;
  id: string;
  level: number;
  photoUrl: string | null;
  rank: number;
  score: number;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  kind: LeaderboardKind;
  page: number;
  pageSize: number;
  totalEntries: number;
  totalPages: number;
  duelWins: number;
  requiredDuelWins: number;
  eligible: boolean;
}
