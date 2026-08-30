ALTER TABLE players
  ADD COLUMN card_shards BIGINT NOT NULL DEFAULT 0 CHECK (card_shards >= 0);

CREATE TABLE player_dungeon_runs (
  id UUID PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  seed BIGINT NOT NULL,
  board JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'failed')),
  moves_used INTEGER NOT NULL DEFAULT 0 CHECK (moves_used >= 0),
  matched_pairs INTEGER NOT NULL DEFAULT 0 CHECK (matched_pairs >= 0),
  reward_shards INTEGER NOT NULL DEFAULT 0 CHECK (reward_shards >= 0),
  stars INTEGER NOT NULL DEFAULT 0 CHECK (stars BETWEEN 0 AND 3),
  claimed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX player_dungeon_runs_player_id_idx
  ON player_dungeon_runs (player_id, created_at DESC);
