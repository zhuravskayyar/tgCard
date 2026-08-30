CREATE TABLE player_battle_pass_state (
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  season_id TEXT NOT NULL,
  diamonds INTEGER NOT NULL DEFAULT 0 CHECK (diamonds >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, season_id)
);

CREATE TABLE player_battle_pass_claims (
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  season_id TEXT NOT NULL,
  milestone_id TEXT NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, season_id, milestone_id)
);

CREATE TABLE player_daily_task_claims (
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  task_date DATE NOT NULL,
  task_id TEXT NOT NULL,
  reward_diamonds INTEGER NOT NULL CHECK (reward_diamonds > 0),
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, task_date, task_id)
);

CREATE INDEX player_daily_task_claims_history_idx
  ON player_daily_task_claims (player_id, task_date);
