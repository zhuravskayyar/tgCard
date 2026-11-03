CREATE TABLE IF NOT EXISTS player_campaign_locations (
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  location_number INTEGER NOT NULL CHECK (location_number BETWEEN 1 AND 10),
  first_win_at TIMESTAMPTZ NOT NULL,
  last_win_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (player_id, location_number),
  CHECK (last_win_at >= first_win_at)
);

ALTER TABLE duels DROP CONSTRAINT IF EXISTS duel_opponent_source_check;
ALTER TABLE duels ADD CONSTRAINT duel_opponent_source_check CHECK (
  (opponent_kind = 'real' AND opponent_id IS NOT NULL AND campaign_id IS NULL)
  OR (opponent_kind = 'bot' AND opponent_id IS NULL AND campaign_id IS NULL)
  OR (opponent_kind = 'campaign_boss' AND opponent_id IS NULL AND campaign_id IS NOT NULL
    AND (campaign_id = 'campaign_1' OR campaign_id ~ '^location_(10|[1-9])$'))
);

-- Existing fairy claims survive; old stage progress and earned rewards stay untouched.
INSERT INTO player_story_trial_claims (player_id, trial_id, claimed_at)
SELECT player_id, 'save-profile', awarded_at FROM player_account_link_rewards
ON CONFLICT (player_id, trial_id) DO NOTHING;

-- Retire only unfinished legacy campaign battles, preserving their history and rewards.
UPDATE duels SET status = 'lost', finished_at = NOW(), updated_at = NOW()
WHERE opponent_kind = 'campaign_boss' AND status = 'active';
