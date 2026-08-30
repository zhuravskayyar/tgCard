ALTER TABLE players
  ADD COLUMN equipped_nickname_skin TEXT;

CREATE TABLE player_cosmetics (
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  cosmetic_type TEXT NOT NULL CHECK (cosmetic_type = 'nickname_skin'),
  cosmetic_id TEXT NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, cosmetic_type, cosmetic_id)
);

CREATE INDEX player_cosmetics_player_type_idx
  ON player_cosmetics (player_id, cosmetic_type, acquired_at);
