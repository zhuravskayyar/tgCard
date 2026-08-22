CREATE TABLE cards (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  element TEXT NOT NULL CHECK (element IN ('fire', 'water', 'air', 'earth')),
  rarity TEXT NOT NULL CHECK (
    rarity IN ('common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic')
  ),
  power INTEGER NOT NULL CHECK (power > 0),
  collection_id TEXT
);

CREATE TABLE player_cards (
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  PRIMARY KEY (player_id, card_id)
);

CREATE INDEX player_cards_card_id_idx ON player_cards(card_id);

CREATE TABLE schema_seeds (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
