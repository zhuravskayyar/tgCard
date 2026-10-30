ALTER TABLE player_account_link_rewards
  DROP CONSTRAINT IF EXISTS player_account_link_rewards_diamonds_awarded_check;

ALTER TABLE player_account_link_rewards
  ALTER COLUMN diamonds_awarded SET DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gold_awarded INTEGER NOT NULL DEFAULT 0 CHECK (gold_awarded >= 0);

CREATE TABLE IF NOT EXISTS player_story_trial_claims (
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  trial_id TEXT NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, trial_id)
);
