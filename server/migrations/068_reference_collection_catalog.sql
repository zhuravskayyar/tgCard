-- One card may now belong to several collections, so membership gets its own table.
-- cards.collection_id keeps the card's first collection for screens that show a single one.
CREATE TABLE collection_cards (
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position > 0),
  PRIMARY KEY (collection_id, card_id)
);
CREATE INDEX collection_cards_card_idx ON collection_cards(card_id);

INSERT INTO collection_cards (collection_id, card_id, position)
SELECT collection_id, id, ROW_NUMBER() OVER (PARTITION BY collection_id ORDER BY code)
FROM cards
WHERE collection_id IS NOT NULL;

-- Recoverable snapshot of the catalog the seed is about to replace.
CREATE TABLE archived_catalog_v1_collections AS SELECT collections.*, CURRENT_TIMESTAMP AS archived_at FROM collections;
CREATE TABLE archived_catalog_v1_cards AS SELECT cards.*, CURRENT_TIMESTAMP AS archived_at FROM cards;
CREATE TABLE archived_catalog_v1_player_card_instances AS SELECT instances.*, CURRENT_TIMESTAMP AS archived_at FROM player_card_instances instances;
CREATE TABLE archived_catalog_v1_player_card_discoveries AS SELECT discoveries.*, CURRENT_TIMESTAMP AS archived_at FROM player_card_discoveries discoveries;
CREATE TABLE archived_catalog_v1_player_collection_completions AS SELECT completions.*, CURRENT_TIMESTAMP AS archived_at FROM player_collection_completions completions;

-- Which new card took over each retired card a player owned.
CREATE TABLE retired_catalog_card_replacements (
  retired_card_id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE RESTRICT,
  replaced_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
