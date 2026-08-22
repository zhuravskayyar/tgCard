import type { Pool, PoolClient } from "pg";
import { STARTER_CARD_CODES, STARTER_CARD_COUNT } from "./starterCards.js";

interface CountRow {
  count: string;
}

async function requireCanonicalStarterCards(client: PoolClient) {
  const result = await client.query<CountRow>(
    "SELECT count(*) FROM cards WHERE code = ANY($1::text[])",
    [STARTER_CARD_CODES],
  );
  const count = Number(result.rows[0]?.count);

  if (count !== STARTER_CARD_COUNT) {
    throw new Error("Canonical starter cards are not seeded");
  }
}

export async function grantStarterCards(client: PoolClient, playerId: string) {
  await requireCanonicalStarterCards(client);

  await client.query(
    `
      INSERT INTO player_cards (player_id, card_id, quantity)
      SELECT $1, cards.id, 1
      FROM cards
      WHERE cards.code = ANY($2::text[])
      ON CONFLICT (player_id, card_id) DO NOTHING
    `,
    [playerId, STARTER_CARD_CODES],
  );
}

export async function backfillStarterCards(pool: Pool) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await requireCanonicalStarterCards(client);
    const result = await client.query(
      `
        INSERT INTO player_cards (player_id, card_id, quantity)
        SELECT players.id, cards.id, 1
        FROM players
        CROSS JOIN cards
        WHERE cards.code = ANY($1::text[])
        ON CONFLICT (player_id, card_id) DO NOTHING
      `,
      [STARTER_CARD_CODES],
    );
    await client.query("COMMIT");
    return result.rowCount ?? 0;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
