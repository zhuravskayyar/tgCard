CREATE TABLE IF NOT EXISTS player_equipment_inventory (
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, item_id)
);

CREATE INDEX IF NOT EXISTS player_equipment_inventory_player_id_idx
  ON player_equipment_inventory (player_id);

ALTER TABLE players
  ALTER COLUMN equipment SET DEFAULT '{"equipped":{"head":null,"cloak":null,"gloves":null,"boots":null,"weapon":null,"shield":null,"amulet":null,"relic":null,"voodoo":null}}'::jsonb;
