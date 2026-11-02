// Builds one atomic SQL block for the catalog v2 release that can run in the Neon SQL Editor:
// migration 068, the full player reset, the seeded catalog copied from the local database, starter cards and decks.
// Usage (from server/): node ../scripts/build-release-068-sql.cjs <output.sql>
const { Client } = require("pg");
const { readFileSync, writeFileSync } = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
// Starter grants are read from the server config so the release gives exactly what a new account gets.
const starterSource = readFileSync(path.join(root, "server/src/inventory/starterCards.ts"), "utf8");
const starters = [...starterSource.matchAll(/\{ code: "(\w+)", level: (\d+), bonusPower: (\d+) \}/g)]
  .map(([, code, level, bonus]) => ({ code, level: Number(level), bonus: Number(bonus) }));
const deckSize = Number(starterSource.match(/STARTER_DECK_SIZE = (\d+)/)?.[1]);
if (starters.length !== 11 || deckSize !== 9) throw new Error(`Unexpected starter config: ${starters.length} grants, deck ${deckSize}`);
const starterValues = starters.map(({ code, level, bonus }, index) => `('${code}', ${level}, ${bonus}, ${index < deckSize})`).join(", ");
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
  if (cards.count !== 213 || collections.count !== 50) throw new Error(`Unexpected local catalog: ${cards.count} cards, ${collections.count} collections`);

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

-- Starter cards (9 in the deck, 2 weak), discoveries and full decks for every player
CREATE TEMP TABLE release_starters (code text PRIMARY KEY, level int NOT NULL, bonus_power int NOT NULL, in_deck boolean NOT NULL) ON COMMIT DROP;
INSERT INTO release_starters VALUES ${starterValues};
INSERT INTO player_card_instances (id, player_id, card_id, level, bonus_power)
SELECT md5('cardastika:starter:' || p.id::text || ':' || c.id)::uuid, p.id, c.id, s.level, s.bonus_power
FROM players p CROSS JOIN release_starters s JOIN cards c ON c.code = s.code;
INSERT INTO player_card_discoveries (player_id, card_id)
SELECT p.id, c.id FROM players p CROSS JOIN release_starters s JOIN cards c ON c.code = s.code;
INSERT INTO player_decks (id, player_id) SELECT gen_random_uuid(), p.id FROM players p;
INSERT INTO deck_slots (deck_id, slot, card_instance_id)
SELECT d.id, row_number() OVER (PARTITION BY i.player_id ORDER BY i.card_id)::smallint, i.id
FROM player_card_instances i
JOIN cards c ON c.id = i.card_id
JOIN release_starters s ON s.code = c.code AND s.in_deck
JOIN player_decks d ON d.player_id = i.player_id;

IF (SELECT count(*) FROM cards) <> ${cards.count} OR (SELECT count(*) FROM collections) <> ${collections.count}
   OR (SELECT count(*) FROM collection_cards) <> ${members.count} OR (SELECT count(*) FROM cards c JOIN release_starters s ON s.code = c.code) <> ${starters.length}
   OR EXISTS (SELECT 1 FROM cards WHERE id LIKE 'starter_v5_%') THEN
  RAISE EXCEPTION 'Catalog copy incomplete';
END IF;
IF (SELECT count(*) FROM player_card_instances) <> (SELECT count(*) FROM players) * ${starters.length}
   OR (SELECT count(*) FROM deck_slots) <> (SELECT count(*) FROM players) * ${deckSize}
   OR EXISTS (SELECT 1 FROM players WHERE level <> 1 OR silver <> 0 OR gold <> 0) THEN
  RAISE EXCEPTION 'Player reset or starter decks incomplete';
END IF;
END $release$;
`;
  writeFileSync(output, sql);
  console.log(`Wrote ${output}: ${sql.length} chars; ${cards.count} cards, ${collections.count} collections, ${members.count} members`);
})().catch((error) => { console.error(error.message); process.exit(1); });
