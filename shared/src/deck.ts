import type { PlayerCardInstance } from "./card.js";

export const DECK_SIZE = 9;

export interface PlayerDeckCard extends PlayerCardInstance {
  slot: number;
  /** Server-computed arrow: progress is full, or the player's weak cards guarantee the next level. */
  upgradeIndicator?: "element" | "gold";
}

export interface PlayerDeckResponse {
  baseBattleHp: number;
  cards: PlayerDeckCard[];
  totalPower: number;
}
