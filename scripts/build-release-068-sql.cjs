// Builds one atomic SQL block for the catalog v2 release that can run in the Neon SQL Editor:
// migration 068, the full player reset, the seeded catalog copied from the local database, starter cards and decks.
// Usage (from server/): node ../scripts/build-release-068-sql.cjs <output.sql>
const { Client } = require("pg");
const { readFileSync, writeFileSync } = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const output = process.argv[2];
if (!output) throw new Error("Output path is required");

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const dump = async (table, order) => {
    const { rows } = await client.query(`SELECT coalesce(json_agg(t ORDER BY ${order}), '[]') AS j FROM ${table} t`);
    const json = JSON.stringify(rows[0].j);
    if (json.includes("$cat$")) throw new Error(`${table} contains the quote tag`);
    return { count: JSON.parse(json).length, json };
  };
  const collections = await dump("collections", "id");
  const cards = await dump("cards", "id");
  const members = await dump("collection_cards", "collection_id, position");
  await client.end();
  if (cards.count !== 222 || collections.count !== 50) throw new Error(`Unexpected local catalog: ${cards.count} cards, ${collections.count} collections`);

  const migration = readFileSync(path.join(root, "server/migrations/068_reference_collection_catalog.sql"), "utf8");
  const reset = readFileSync(path.join(root, "scripts/release-068-reset.sql"), "utf8");
  const sql = `DO $release$
BEGIN
IF EXISTS (SELECT 1 FROM schema_migrations WHERE name = '068_reference_collection_catalog.sql') THEN
  RAISE EXCEPTION '068 already applied';
END IF;
IF (SELECT max(name) FROM schema_migrations) <> '067_arena_own_league_rating.sql' THEN
  RAISE EXCEPTION 'Expected 067 to be the last applied migration';
END IF;

-- Migration 068
${migration}
INSERT INTO schema_migrations (name) VALUES ('068_reference_collection_catalog.sql');

-- Player reset
${reset}
-- Catalog v2, copied from the seeded local database
DELETE FROM collection_cards;
DELETE FROM shop_card_pools;
UPDATE cards SET collection_id = NULL;
DELETE FROM cards;
DELETE FROM collections;
INSERT INTO collections SELECT * FROM json_populate_recordset(NULL::collections, $cat$${collections.json}$cat$);
INSERT INTO cards SELECT * FROM json_populate_recordset(NULL::cards, $cat$${cards.json}$cat$);
INSERT INTO collection_cards SELECT * FROM json_populate_recordset(NULL::collection_cards, $cat$${members.json}$cat$);

-- Starter cards, discoveries and full decks for every player
INSERT INTO player_card_instances (id, player_id, card_id, level, bonus_power)
SELECT md5('cardastika:starter:' || p.id::text || ':' || c.id)::uuid, p.id, c.id, 1, 2
FROM players p CROSS JOIN cards c WHERE c.id LIKE 'starter_v5_%';
INSERT INTO player_card_discoveries (player_id, card_id)
SELECT p.id, c.id FROM players p CROSS JOIN cards c WHERE c.id LIKE 'starter_v5_%';
INSERT INTO player_decks (id, player_id) SELECT gen_random_uuid(), p.id FROM players p;
INSERT INTO deck_slots (deck_id, slot, card_instance_id)
SELECT d.id, row_number() OVER (PARTITION BY i.player_id ORDER BY i.card_id)::smallint, i.id
FROM player_card_instances i JOIN player_decks d ON d.player_id = i.player_id;

IF (SELECT count(*) FROM cards) <> ${cards.count} OR (SELECT count(*) FROM collections) <> ${collections.count}
   OR (SELECT count(*) FROM collection_cards) <> ${members.count} OR (SELECT count(*) FROM cards WHERE id LIKE 'starter_v5_%') <> 9 THEN
  RAISE EXCEPTION 'Catalog copy incomplete';
END IF;
IF (SELECT count(*) FROM player_card_instances) <> (SELECT count(*) FROM players) * 9
   OR (SELECT count(*) FROM deck_slots) <> (SELECT count(*) FROM players) * 9
   OR EXISTS (SELECT 1 FROM players WHERE level <> 1 OR silver <> 0 OR gold <> 0) THEN
  RAISE EXCEPTION 'Player reset or starter decks incomplete';
END IF;
END $release$;
`;
  writeFileSync(output, sql);
  console.log(`Wrote ${output}: ${sql.length} chars; ${cards.count} cards, ${collections.count} collections, ${members.count} members`);
})().catch((error) => { console.error(error.message); process.exit(1); });
