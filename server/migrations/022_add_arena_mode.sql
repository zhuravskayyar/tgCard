ALTER TABLE players
  ADD COLUMN arena_rating INTEGER NOT NULL DEFAULT 0 CHECK (arena_rating >= 0),
  ADD COLUMN arena_league_index INTEGER NOT NULL DEFAULT 0 CHECK (arena_league_index >= 0 AND arena_league_index < 21),
  ADD COLUMN arena_wins INTEGER NOT NULL DEFAULT 0 CHECK (arena_wins >= 0),
  ADD COLUMN arena_top3_count INTEGER NOT NULL DEFAULT 0 CHECK (arena_top3_count >= 0),
  ADD COLUMN arena_tokens BIGINT NOT NULL DEFAULT 0 CHECK (arena_tokens >= 0),
  ADD COLUMN arena_gold_earned_today INTEGER NOT NULL DEFAULT 0 CHECK (arena_gold_earned_today >= 0 AND arena_gold_earned_today <= 45),
  ADD COLUMN arena_gold_day DATE NOT NULL DEFAULT CURRENT_DATE;

CREATE TABLE arena_queue (
  id UUID PRIMARY KEY,
  player_id UUID NOT NULL UNIQUE REFERENCES players(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE arena_matches (
  id UUID PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('active', 'finished')),
  state JSONB NOT NULL,
  result JSONB,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX arena_matches_one_active_per_player_idx
  ON arena_matches (player_id)
  WHERE status = 'active';
CREATE INDEX arena_matches_player_history_idx
  ON arena_matches (player_id, created_at DESC);

CREATE TABLE arena_shop_purchases (
  id UUID PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  offer_id TEXT NOT NULL,
  price INTEGER NOT NULL CHECK (price > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE player_arena_cosmetics (
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  cosmetic_id TEXT NOT NULL,
  cosmetic_type TEXT NOT NULL CHECK (cosmetic_type IN ('avatar', 'frame', 'card_back', 'title')),
  equipped BOOLEAN NOT NULL DEFAULT FALSE,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, cosmetic_id)
);

CREATE INDEX player_arena_cosmetics_equipped_idx
  ON player_arena_cosmetics (player_id, cosmetic_type, equipped);
