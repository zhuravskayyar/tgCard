-- Real-player tournaments replace the local bot harness from 070.
DROP TABLE IF EXISTS tournament_runs;

-- A separate rating fixed at the first participation; global leagues never demote.
CREATE TABLE tournament_profiles (
  player_id UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 0),
  highest_league TEXT NOT NULL CHECK (highest_league IN ('conqueror', 'champion', 'master', 'ruler')),
  -- Sub-league index on the reference scale, for one-time promotion silver.
  highest_league_index INTEGER NOT NULL CHECK (highest_league_index BETWEEN 0 AND 20),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tournament_events (
  id UUID PRIMARY KEY,
  league TEXT NOT NULL CHECK (league IN ('conqueror', 'champion', 'master', 'ruler')),
  starts_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('registration', 'running', 'finished', 'cancelled')),
  plan JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (league, starts_at)
);

CREATE INDEX tournament_events_open_idx ON tournament_events (status, starts_at) WHERE status IN ('registration', 'running');

CREATE TABLE tournament_entries (
  event_id UUID NOT NULL REFERENCES tournament_events(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rating_at_start INTEGER,
  snapshot JSONB,
  status TEXT NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'playing', 'eliminated', 'finished', 'cancelled')),
  placement SMALLINT CHECK (placement BETWEEN 1 AND 4),
  finish_label TEXT,
  prize JSONB,
  prize_granted JSONB,
  rating_change INTEGER NOT NULL DEFAULT 0,
  xp_earned INTEGER NOT NULL DEFAULT 0,
  rewarded_at TIMESTAMPTZ,
  PRIMARY KEY (event_id, player_id)
);

CREATE INDEX tournament_entries_player_idx ON tournament_entries (player_id, registered_at DESC);

CREATE TABLE tournament_matches (
  event_id UUID NOT NULL REFERENCES tournament_events(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  stage INTEGER NOT NULL CHECK (stage >= 0),
  player_a UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  player_b UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  state JSONB NOT NULL,
  winner_id UUID REFERENCES players(id) ON DELETE SET NULL,
  settled_at TIMESTAMPTZ,
  PRIMARY KEY (event_id, id)
);

CREATE INDEX tournament_matches_player_a_idx ON tournament_matches (player_a, event_id);
CREATE INDEX tournament_matches_player_b_idx ON tournament_matches (player_b, event_id);
