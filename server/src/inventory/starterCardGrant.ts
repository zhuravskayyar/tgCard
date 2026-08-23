import type { Pool, PoolClient } from "pg";
import {
  STARTER_CARD_CODES,
  STARTER_CARD_COUNT,
  STARTER_INSTANCE_DEFAULTS,
} from "./starterCards.js";

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
      INSERT INTO player_card_instances (id, player_id, card_id, level, bonus_power)
      SELECT
        md5('cardastika:starter:' || $1::text || ':' || cards.id)::uuid,
        $1::uuid,
        cards.id,
        $3,
        $4
      FROM cards
      WHERE cards.code = ANY($2::text[])
        AND NOT EXISTS (
          SELECT 1
          FROM player_card_instances existing
          WHERE existing.player_id = $1::uuid
            AND existing.card_id = cards.id
        )
      ON CONFLICT (id) DO NOTHING
    `,
    [playerId, STARTER_CARD_CODES, STARTER_INSTANCE_DEFAULTS.level, STARTER_INSTANCE_DEFAULTS.bonusPower],
  );
  await client.query(
    `
      INSERT INTO player_card_discoveries (player_id, card_id)
      SELECT $1::uuid, cards.id
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
        INSERT INTO player_card_instances (id, player_id, card_id, level, bonus_power)
        SELECT
          md5('cardastika:starter:' || players.id::text || ':' || cards.id)::uuid,
          players.id,
          cards.id,
          $2,
          $3
        FROM players
        CROSS JOIN cards
        WHERE cards.code = ANY($1::text[])
          AND NOT EXISTS (
            SELECT 1
            FROM player_card_instances existing
            WHERE existing.player_id = players.id
              AND existing.card_id = cards.id
          )
        ON CONFLICT (id) DO NOTHING
      `,
      [STARTER_CARD_CODES, STARTER_INSTANCE_DEFAULTS.level, STARTER_INSTANCE_DEFAULTS.bonusPower],
    );
    await client.query(
      `
        INSERT INTO player_card_discoveries (player_id, card_id)
        SELECT players.id, cards.id
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
