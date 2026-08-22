import type {
  DeckSlotInput,
  PlayerCard,
  PlayerDeckCard,
  PlayerDeckResponse,
} from "@cardastika/shared";
import type { Pool, PoolClient } from "pg";
import { calculateDeckTotalPower, DeckValidationError, validateDeckOwnership } from "./deckRules.js";

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

interface OwnershipRow {
  card_id: string;
  quantity: string | number;
}

type DatabaseClient = Pool | PoolClient;

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

async function loadDeck(database: DatabaseClient, playerId: string): Promise<PlayerDeckResponse> {
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

  return { cards, totalPower: calculateDeckTotalPower(cards) };
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

  async save(playerId: string, slots: readonly DeckSlotInput[]) {
    const client = await this.pool.connect().catch(() => {
      throw new DeckPersistenceError();
    });

    try {
      await client.query("BEGIN");
      const deckResult = await client.query<DeckIdRow>(
        "SELECT id FROM player_decks WHERE player_id = $1 FOR UPDATE",
        [playerId],
      );
      const deck = deckResult.rows[0];
      if (!deck) {
        throw new DeckMissingError();
      }

      const requestedCardIds = [...new Set(slots.map(({ cardId }) => cardId))];
      const ownershipResult = await client.query<OwnershipRow>(
        `
          SELECT card_id, quantity
          FROM player_cards
          WHERE player_id = $1
            AND card_id = ANY($2::text[])
          FOR SHARE
        `,
        [playerId, requestedCardIds],
      );
      const inventory: Pick<PlayerCard, "cardId" | "quantity">[] = ownershipResult.rows.map((row) => ({
        cardId: row.card_id,
        quantity: toPositiveInteger(row.quantity),
      }));
      validateDeckOwnership(slots, inventory);

      await client.query("DELETE FROM deck_slots WHERE deck_id = $1", [deck.id]);
      await client.query(
        `
          INSERT INTO deck_slots (deck_id, slot, card_id)
          SELECT $1, input.slot, input.card_id
          FROM unnest($2::smallint[], $3::text[]) AS input(slot, card_id)
        `,
        [deck.id, slots.map(({ slot }) => slot), slots.map(({ cardId }) => cardId)],
      );
      await client.query("UPDATE player_decks SET updated_at = NOW() WHERE id = $1", [deck.id]);
      const saved = await loadDeck(client, playerId);
      await client.query("COMMIT");
      return saved;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof DeckMissingError || error instanceof DeckValidationError) {
        throw error;
      }
      throw new DeckPersistenceError();
    } finally {
      client.release();
    }
  }
}
