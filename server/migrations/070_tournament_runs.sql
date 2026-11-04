CREATE TABLE IF NOT EXISTS tournament_runs (
  player_id UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  run_id UUID NOT NULL UNIQUE,
  state JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tournament_runs_updated_at_idx ON tournament_runs(updated_at);
