import type { PlayerCardInstance } from "./card.js";

export const DECK_SIZE = 9;

export interface PlayerDeckCard extends PlayerCardInstance {
  slot: number;
}

export interface PlayerDeckResponse {
  baseBattleHp: number;
  cards: PlayerDeckCard[];
  totalPower: number;
}
