import type { PlayerCardInstance } from "./card.js";

export const DECK_SIZE = 9;

export interface PlayerDeckCard extends PlayerCardInstance {
  slot: number;
  /** Server-computed arrow: progress is full, or the player's weak cards guarantee the next level. */
  upgradeIndicator?: "element" | "gold";
}

/** The nine battle-deck cards as stored, before the extra-card slots are attached. */
export interface StoredPlayerDeck {
  baseBattleHp: number;
  cards: PlayerDeckCard[];
  totalPower: number;
}

/** One extra-card slot under the deck: closed, or holding a card the player may meet in battle. */
export type ExtraCardSlot = { status: "locked" } | { status: "card"; card: PlayerCardInstance };

/** «Додаткові карти»: ally and goblin cards do not exist yet, so those slots are always closed. */
export interface PlayerDeckExtraCards {
  ally: { status: "locked" };
  guild: ExtraCardSlot;
  goblin: { status: "locked" };
}

export interface PlayerDeckResponse extends StoredPlayerDeck {
  extraCards: PlayerDeckExtraCards;
}
