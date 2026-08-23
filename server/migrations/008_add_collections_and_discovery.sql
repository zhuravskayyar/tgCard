CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  cover_art_key TEXT,
  buff_type TEXT NOT NULL CHECK (buff_type IN (
    'battle_damage_pct',
    'battle_hp_pct',
    'element_damage_pct',
    'silver_reward_pct',
    'experience_reward_pct',
    'absorption_efficiency_pct',
    'deck_power_pct'
  )),
  buff_value INTEGER NOT NULL CHECK (buff_value > 0),
  buff_element TEXT CHECK (buff_element IN ('fire', 'water', 'air', 'earth')),
  bonus_label TEXT NOT NULL,
  position INTEGER NOT NULL UNIQUE CHECK (position > 0)
);
ALTER TABLE cards
  ADD COLUMN min_rarity TEXT NOT NULL DEFAULT 'common' CHECK (
    min_rarity IN ('common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic')
  ),
  ADD COLUMN shop_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  ADD CONSTRAINT cards_collection_id_fkey
    FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE RESTRICT;

CREATE INDEX cards_collection_id_idx ON cards(collection_id);
CREATE INDEX cards_shop_eligibility_idx ON cards(shop_eligible, min_rarity, code);

CREATE TABLE player_card_discoveries (
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE RESTRICT,
  first_discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, card_id)
);

CREATE INDEX player_card_discoveries_card_id_idx
  ON player_card_discoveries(card_id);

INSERT INTO player_card_discoveries (player_id, card_id, first_discovered_at)
SELECT player_id, card_id, MIN(created_at)
FROM player_card_instances
GROUP BY player_id, card_id
ON CONFLICT (player_id, card_id) DO NOTHING;

CREATE TABLE player_collection_completions (
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE RESTRICT,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, collection_id)
);
