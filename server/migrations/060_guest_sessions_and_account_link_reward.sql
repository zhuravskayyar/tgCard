ALTER TABLE player_sessions
  DROP CONSTRAINT IF EXISTS player_sessions_provider_check;

ALTER TABLE player_sessions
  ADD CONSTRAINT player_sessions_provider_check
    CHECK (provider IN ('telegram', 'google', 'guest'));

CREATE TABLE player_account_link_rewards (
  player_id UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  diamonds_awarded INTEGER NOT NULL DEFAULT 5 CHECK (diamonds_awarded = 5),
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
