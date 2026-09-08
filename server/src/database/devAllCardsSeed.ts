import { Pool } from "pg";
import { DEV_ACCOUNT_IDS } from "../dev/devAuthRoute.js";

if (process.env.NODE_ENV === "production" || process.env.CARDASTIKA_DEV_AUTH !== "true") {
  throw new Error("Dev all-cards seed is disabled unless CARDASTIKA_DEV_AUTH=true and NODE_ENV is not production");
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is required to run the dev all-cards seed");

const pool = new Pool({ connectionString: databaseUrl });
const playerId = DEV_ACCOUNT_IDS.guild_leader;

try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const player = await client.query("SELECT id FROM players WHERE id = $1 FOR UPDATE", [playerId]);
    if (!player.rowCount) throw new Error("The dev_leader account is not seeded; run npm run dev:guild-seed first");

    const instances = await client.query(
      `
        INSERT INTO player_card_instances (id, player_id, card_id, level, bonus_power)
        SELECT
          md5('cardastika:dev-all-cards:' || $1::text || ':' || cards.id)::uuid,
          $1::uuid,
          cards.id,
          1,
          2
        FROM cards
        WHERE NOT EXISTS (
          SELECT 1
          FROM player_card_instances existing
          WHERE existing.player_id = $1::uuid
            AND existing.card_id = cards.id
        )
        ON CONFLICT (id) DO NOTHING
      `,
      [playerId],
    );

    const discoveries = await client.query(
      `
        INSERT INTO player_card_discoveries (player_id, card_id)
        SELECT $1::uuid, cards.id
        FROM cards
        ON CONFLICT (player_id, card_id) DO NOTHING
      `,
      [playerId],
    );

    const completions = await client.query(
      `
        INSERT INTO player_collection_completions (player_id, collection_id)
        SELECT $1::uuid, cards.collection_id
        FROM cards
        WHERE cards.collection_id IS NOT NULL
        GROUP BY cards.collection_id
        ON CONFLICT (player_id, collection_id) DO NOTHING
      `,
      [playerId],
    );

    const totals = await client.query<{ cards: string; instances: string; discoveries: string; completions: string }>(
      `
        SELECT
          (SELECT COUNT(*) FROM cards) AS cards,
          (SELECT COUNT(*) FROM player_card_instances WHERE player_id = $1) AS instances,
          (SELECT COUNT(*) FROM player_card_discoveries WHERE player_id = $1) AS discoveries,
          (SELECT COUNT(*) FROM player_collection_completions WHERE player_id = $1) AS completions
      `,
      [playerId],
    );

    await client.query("COMMIT");
    console.log(JSON.stringify({
      account: "dev_leader",
      cards: Number(totals.rows[0]?.cards ?? 0),
      completionsAdded: completions.rowCount ?? 0,
      discoveriesAdded: discoveries.rowCount ?? 0,
      instancesAdded: instances.rowCount ?? 0,
      ownedInstances: Number(totals.rows[0]?.instances ?? 0),
      discoveredCards: Number(totals.rows[0]?.discoveries ?? 0),
      completedCollections: Number(totals.rows[0]?.completions ?? 0),
    }));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
