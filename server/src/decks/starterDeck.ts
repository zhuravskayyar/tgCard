import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { STARTER_CARD_CODES, STARTER_CARD_COUNT } from "../inventory/starterCards.js";

interface IdRow {
  id: string;
}

export async function ensureStarterDeck(client: PoolClient, playerId: string) {
  const deckResult = await client.query<IdRow>(
    `
      INSERT INTO player_decks (id, player_id)
      VALUES ($1, $2)
      ON CONFLICT (player_id) DO NOTHING
      RETURNING id
    `,
    [randomUUID(), playerId],
  );
  const deck = deckResult.rows[0];

  if (!deck) {
    return false;
  }

  const slotResult = await client.query(
    `
      INSERT INTO deck_slots (deck_id, slot, card_id)
      SELECT
        $1,
        row_number() OVER (ORDER BY cards.code),
        cards.id
      FROM cards
      INNER JOIN player_cards
        ON player_cards.card_id = cards.id
       AND player_cards.player_id = $2
      WHERE cards.code = ANY($3::text[])
      ORDER BY cards.code
    `,
    [deck.id, playerId, STARTER_CARD_CODES],
  );

  if (slotResult.rowCount !== STARTER_CARD_COUNT) {
    throw new Error("Starter deck requires all canonical starter cards");
  }

  return true;
}

export async function backfillStarterDecks(pool: Pool) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const players = await client.query<IdRow>(
      `
        SELECT players.id
        FROM players
        WHERE NOT EXISTS (
          SELECT 1 FROM player_decks WHERE player_decks.player_id = players.id
        )
          AND (
            SELECT count(*)
            FROM player_cards
            INNER JOIN cards ON cards.id = player_cards.card_id
            WHERE player_cards.player_id = players.id
              AND cards.code = ANY($1::text[])
          ) = $2
        ORDER BY players.id
      `,
      [STARTER_CARD_CODES, STARTER_CARD_COUNT],
    );
    let created = 0;

    for (const player of players.rows) {
      if (await ensureStarterDeck(client, player.id)) {
        created += 1;
      }
    }

    await client.query("COMMIT");
    return created;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
