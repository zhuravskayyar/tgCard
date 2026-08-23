import { getBaseBattleHp, getDeckPower } from "@cardastika/game-core";
import type { PlayerDeckCard, PlayerDeckResponse } from "@cardastika/shared";
import type { Pool } from "pg";
import {
  mapCardInstanceRow,
  type CardInstanceProjectionRow,
} from "../cards/cardInstanceMapper.js";

interface DeckIdRow {
  id: string;
}

interface DeckCardRow extends CardInstanceProjectionRow {
  slot: number;
}

export class DeckMissingError extends Error {
  constructor() {
    super("Player deck does not exist");
    this.name = "DeckMissingError";
  }
}

export class DeckPersistenceError extends Error {
  constructor() {
    super("Deck persistence is unavailable");
    this.name = "DeckPersistenceError";
  }
}

async function loadDeck(database: Pool, playerId: string): Promise<PlayerDeckResponse> {
  const deckResult = await database.query<DeckIdRow>(
    "SELECT id FROM player_decks WHERE player_id = $1",
    [playerId],
  );
  const deck = deckResult.rows[0];
  if (!deck) throw new DeckMissingError();

  const cardsResult = await database.query<DeckCardRow>(
    `
      SELECT
        deck_slots.slot,
        player_card_instances.id AS instance_id,
        cards.id AS card_id,
        cards.code,
        cards.display_name,
        cards.art_key,
        cards.element,
        player_card_instances.level,
        player_card_instances.bonus_power,
        cards.collection_id
      FROM deck_slots
      INNER JOIN player_card_instances
        ON player_card_instances.id = deck_slots.card_instance_id
      INNER JOIN cards ON cards.id = player_card_instances.card_id
      WHERE deck_slots.deck_id = $1
      ORDER BY deck_slots.slot
    `,
    [deck.id],
  );
  const cards: PlayerDeckCard[] = cardsResult.rows.map((row) => ({
    ...mapCardInstanceRow(row),
    slot: row.slot,
  }));
  const totalPower = getDeckPower(cards);
  return { cards, totalPower, baseBattleHp: getBaseBattleHp(cards) };
}

export class DeckRepository {
  constructor(private readonly pool: Pool) {}

  async findByPlayerId(playerId: string) {
    try {
      return await loadDeck(this.pool, playerId);
    } catch (error) {
      if (error instanceof DeckMissingError) throw error;
      throw new DeckPersistenceError();
    }
  }
}
