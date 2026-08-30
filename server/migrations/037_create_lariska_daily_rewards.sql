CREATE TABLE player_lariska_daily_state (
  player_id UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  total_claims INTEGER NOT NULL DEFAULT 0 CHECK (total_claims >= 0),
  current_streak INTEGER NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
  last_claim_date DATE,
  streak_reward_7_claimed BOOLEAN NOT NULL DEFAULT FALSE,
  streak_reward_14_claimed BOOLEAN NOT NULL DEFAULT FALSE,
  streak_reward_30_claimed BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE player_lariska_daily_claims (
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  claim_date DATE NOT NULL,
  cycle_number INTEGER NOT NULL CHECK (cycle_number >= 1),
  day INTEGER NOT NULL CHECK (day BETWEEN 1 AND 7),
  reward JSONB NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, claim_date),
  UNIQUE (player_id, cycle_number, day)
);

CREATE INDEX player_lariska_daily_claims_history_idx
  ON player_lariska_daily_claims (player_id, claimed_at DESC);

CREATE TABLE player_lariska_daily_options (
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  cycle_number INTEGER NOT NULL CHECK (cycle_number >= 1),
  day INTEGER NOT NULL CHECK (day IN (6, 7)),
  options JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, cycle_number, day)
);
