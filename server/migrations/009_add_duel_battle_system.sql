ALTER TABLE players
  ADD COLUMN account_xp INTEGER NOT NULL DEFAULT 0 CHECK (account_xp >= 0),
  ADD COLUMN duel_wins INTEGER NOT NULL DEFAULT 0 CHECK (duel_wins >= 0),
  ADD COLUMN duel_losses INTEGER NOT NULL DEFAULT 0 CHECK (duel_losses >= 0),
  ADD COLUMN duel_win_streak INTEGER NOT NULL DEFAULT 0 CHECK (duel_win_streak >= 0);

CREATE TABLE duel_matchmaking_searches (
  id UUID PRIMARY KEY,
  challenger_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  opponent_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  CHECK (challenger_id <> opponent_id)
);

CREATE INDEX duel_matchmaking_searches_challenger_idx
  ON duel_matchmaking_searches (challenger_id, created_at DESC);

CREATE TABLE duels (
  id UUID PRIMARY KEY,
  challenger_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  opponent_id UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('active', 'won', 'lost')),
  challenger_snapshot JSONB NOT NULL,
  opponent_snapshot JSONB NOT NULL,
  player_hp INTEGER NOT NULL CHECK (player_hp >= 0),
  enemy_hp INTEGER NOT NULL CHECK (enemy_hp >= 0),
  player_active_slots JSONB NOT NULL,
  enemy_active_slots JSONB NOT NULL,
  player_reserve_queue JSONB NOT NULL,
  enemy_reserve_queue JSONB NOT NULL,
  battle_log JSONB NOT NULL DEFAULT '[]'::jsonb,
  turn_number INTEGER NOT NULL DEFAULT 0 CHECK (turn_number >= 0),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  result JSONB,
  rewards_granted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  CHECK (challenger_id <> opponent_id),
  CHECK ((status = 'active' AND finished_at IS NULL) OR (status <> 'active' AND finished_at IS NOT NULL)),
  CHECK ((status = 'active' AND rewards_granted = FALSE) OR status <> 'active')
);

CREATE UNIQUE INDEX duels_one_active_per_challenger_idx
  ON duels (challenger_id)
  WHERE status = 'active';

CREATE INDEX duels_challenger_history_idx
  ON duels (challenger_id, created_at DESC);
