import type { Pool, PoolClient } from "pg";
import { STARTER_CARD_CODES, STARTER_CARD_COUNT, STARTER_CARD_GRANTS, TUTORIAL_REWARD_GRANT } from "./starterCards.js";

interface CountRow {
  count: string;
}

const grantParams = () => [
  STARTER_CARD_GRANTS.map(({ code }) => code),
  STARTER_CARD_GRANTS.map(({ level }) => level),
  STARTER_CARD_GRANTS.map(({ bonusPower }) => bonusPower),
];

// Each starter grant joined to its card; the instance id is stable per player and card.
const starterGrantsSql = (first: number) => `
  SELECT cards.id AS card_id, grants.level, grants.bonus_power
  FROM unnest($${first}::text[], $${first + 1}::int[], $${first + 2}::int[]) AS grants(code, level, bonus_power)
  JOIN cards ON cards.code = grants.code
`;

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
        md5('cardastika:starter:' || $1::text || ':' || starter.card_id)::uuid,
        $1::uuid,
        starter.card_id,
        starter.level,
        starter.bonus_power
      FROM (${starterGrantsSql(2)}) starter
      WHERE NOT EXISTS (
          SELECT 1
          FROM player_card_instances existing
          WHERE existing.player_id = $1::uuid
            AND existing.card_id = starter.card_id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM player_card_discoveries discovered
          WHERE discovered.player_id = $1::uuid
            AND discovered.card_id = starter.card_id
        )
      ON CONFLICT (id) DO NOTHING
    `,
    [playerId, ...grantParams()],
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

/**
 * Gives the tutorial reward card once (stable instance id per player); returns its instance id,
 * or null when the player already owns that card.
 */
export async function grantTutorialRewardCard(client: PoolClient, playerId: string): Promise<string | null> {
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO player_card_instances (id, player_id, card_id, level, bonus_power)
      SELECT md5('cardastika:tutorial-reward:' || $1::text || ':' || cards.id)::uuid, $1::uuid, cards.id, $3::int, $4::int
      FROM cards
      WHERE cards.code = $2
        AND NOT EXISTS (
          SELECT 1 FROM player_card_instances existing
          WHERE existing.player_id = $1::uuid AND existing.card_id = cards.id
        )
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `,
    [playerId, TUTORIAL_REWARD_GRANT.code, TUTORIAL_REWARD_GRANT.level, TUTORIAL_REWARD_GRANT.bonusPower],
  );
  await client.query(
    `
      INSERT INTO player_card_discoveries (player_id, card_id)
      SELECT $1::uuid, cards.id FROM cards WHERE cards.code = $2
      ON CONFLICT (player_id, card_id) DO NOTHING
    `,
    [playerId, TUTORIAL_REWARD_GRANT.code],
  );
  return result.rows[0]?.id ?? null;
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
          md5('cardastika:starter:' || players.id::text || ':' || starter.card_id)::uuid,
          players.id,
          starter.card_id,
          starter.level,
          starter.bonus_power
        FROM players
        CROSS JOIN (${starterGrantsSql(1)}) starter
        WHERE NOT EXISTS (
            SELECT 1
            FROM player_card_instances existing
            WHERE existing.player_id = players.id
              AND existing.card_id = starter.card_id
          )
        ON CONFLICT (id) DO NOTHING
      `,
      grantParams(),
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
