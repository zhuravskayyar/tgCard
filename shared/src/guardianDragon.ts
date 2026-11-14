export type GuardianDragonHikeHoursValue = 2 | 4 | 8;

export interface GuardianDragonHikeView {
  hours: GuardianDragonHikeHoursValue;
  healthGain: number;
  /** ISO time the dragon comes back. */
  endsAt: string;
}

export interface GuardianDragonView {
  /** False until the player reaches the third epic duel league. */
  unlocked: boolean;
  /** `YYYY-MM` (UTC) the dragon belongs to; it is reborn with 0 health next month. */
  monthKey: string;
  /** ISO start of the next month, when health resets. */
  rebirthAt: string;
  health: number;
  maxHealth: number;
  /** 0 = egg, 1…4 = grown looks. */
  stage: number;
  mastery: number;
  progressMinutes: number;
  progressMaxMinutes: number;
  hike: GuardianDragonHikeView | null;
  /** Health the dragon adds in battle now: none while on a hike. */
  battleHealthBonus: number;
  hikes: ReadonlyArray<{ hours: GuardianDragonHikeHoursValue; healthGain: number }>;
  fights: GuardianDragonFightsView;
  flame: GuardianDragonFlameView;
}

export interface GuardianDragonFightsView {
  /** Place in this month's dragon rating, null before the first win. */
  place: number | null;
  rating: number;
  /** Fights the free send plays now (it grows with the dragon's health). */
  freeFights: number;
  freeReady: boolean;
  /** ISO end of the 10-hour cooldown while the free send is spent. */
  cooldownUntil: string | null;
  /** Gold for the next paid send of 100 fights while the cooldown runs. */
  nextPaidPrice: number;
  fightsPerPaidSend: number;
}

export interface GuardianDragonFlameView {
  level: number;
  power: number;
  maxLevel: number;
  powerAtMaxLevel: number;
  /** Completed «Dragon fans» (+10 mastery) and «Dragon whisperers» (×2) collections. */
  dragonFans: boolean;
  dragonWhisperers: boolean;
}

export interface GuardianDragonFightResult {
  fights: number;
  wins: number;
  ratingGain: number;
  masteryGain: number;
  goldSpent: number;
  /** The player's gold after the send, for the top bar. */
  playerGold: number;
}

export interface GuardianDragonFightResponse {
  dragon: GuardianDragonView;
  result: GuardianDragonFightResult;
}

export interface GuardianDragonRatingRow {
  place: number;
  playerId: string;
  displayName: string;
  rating: number;
}

export interface GuardianDragonRatingResponse {
  page: number;
  totalPages: number;
  rows: GuardianDragonRatingRow[];
  viewer: { place: number | null; displayName: string; rating: number } | null;
}

export interface GuardianDragonFeedRequest {
  /** Weak card instances to feed; omit to feed weak cards until the scale is full. */
  instanceIds?: string[];
  /** With "feed all": only weak cards of this element (the open tab). */
  element?: "fire" | "water" | "earth" | "air";
}

export interface GuardianDragonFeedResponse {
  dragon: GuardianDragonView;
  consumedInstanceIds: string[];
}

export interface GuardianDragonHikeRequest {
  hours: GuardianDragonHikeHoursValue;
}
