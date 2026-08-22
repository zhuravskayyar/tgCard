import type { PlayerDeckCard, PlayerDeckResponse } from "@cardastika/shared";
import type { Pool } from "pg";

interface DeckIdRow {
  id: string;
}

interface DeckCardRow {
  art_key: string | null;
  card_id: string;
  code: string;
  collection_id: string | null;
  display_name: string | null;
  element: PlayerDeckCard["element"];
  power: string | number;
  rarity: PlayerDeckCard["rarity"];
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

function toPositiveInteger(value: string | number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("Invalid positive integer returned by database");
  }
  return parsed;
}

async function loadDeck(database: Pool, playerId: string): Promise<PlayerDeckResponse> {
  const deckResult = await database.query<DeckIdRow>(
    "SELECT id FROM player_decks WHERE player_id = $1",
    [playerId],
  );
  const deck = deckResult.rows[0];

  if (!deck) {
    throw new DeckMissingError();
  }

  const cardsResult = await database.query<DeckCardRow>(
    `
      SELECT
        deck_slots.slot,
        cards.id AS card_id,
        cards.code,
        cards.display_name,
        cards.art_key,
        cards.element,
        cards.rarity,
        cards.power,
        cards.collection_id
      FROM deck_slots
      INNER JOIN cards ON cards.id = deck_slots.card_id
      WHERE deck_slots.deck_id = $1
      ORDER BY deck_slots.slot
    `,
    [deck.id],
  );
  const cards = cardsResult.rows.map((row) => ({
    slot: row.slot,
    cardId: row.card_id,
    code: row.code,
    displayName: row.display_name,
    artKey: row.art_key,
    element: row.element,
    rarity: row.rarity,
    power: toPositiveInteger(row.power),
    collectionId: row.collection_id,
  }));

  return { cards, totalPower: cards.reduce((total, card) => total + card.power, 0) };
}

export class DeckRepository {
  constructor(private readonly pool: Pool) {}

  async findByPlayerId(playerId: string) {
    try {
      return await loadDeck(this.pool, playerId);
    } catch (error) {
      if (error instanceof DeckMissingError) {
        throw error;
      }
      throw new DeckPersistenceError();
    }
  }
}
