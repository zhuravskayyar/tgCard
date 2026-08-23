ALTER TABLE players ADD COLUMN referral_code TEXT;

UPDATE players
SET referral_code = LOWER(SUBSTRING(REPLACE(id::text, '-', '') FROM 1 FOR 12))
WHERE referral_code IS NULL;

ALTER TABLE players
  ALTER COLUMN referral_code SET NOT NULL,
  ALTER COLUMN referral_code SET DEFAULT LOWER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', '') FROM 1 FOR 12)),
  ADD CONSTRAINT players_referral_code_unique UNIQUE (referral_code),
  ADD CONSTRAINT players_referral_code_format CHECK (referral_code ~ '^[a-z0-9]{8,24}$');

CREATE TABLE player_campaign_state (
  player_id UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL DEFAULT 'campaign_1' CHECK (campaign_id = 'campaign_1'),
  current_stage SMALLINT NOT NULL DEFAULT 1 CHECK (current_stage BETWEEN 1 AND 6),
  current_stage_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  boss_reward_granted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (boss_reward_granted_at IS NULL OR completed_at IS NOT NULL)
);

CREATE TABLE player_campaign_quest_progress (
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  quest_id TEXT NOT NULL,
  stage_number SMALLINT NOT NULL CHECK (stage_number BETWEEN 1 AND 6),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, quest_id),
  CHECK (claimed_at IS NULL OR completed_at IS NOT NULL)
);

CREATE INDEX player_campaign_quest_stage_idx
  ON player_campaign_quest_progress (player_id, stage_number, quest_id);

CREATE TABLE player_campaign_events (
  id BIGSERIAL PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX player_campaign_events_progress_idx
  ON player_campaign_events (player_id, occurred_at, id);

CREATE TABLE player_referrals (
  id UUID PRIMARY KEY,
  inviter_player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  invited_player_id UUID NOT NULL UNIQUE REFERENCES players(id) ON DELETE CASCADE,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL DEFAULT 'telegram_start' CHECK (source = 'telegram_start'),
  CHECK (inviter_player_id <> invited_player_id)
);

CREATE INDEX player_referrals_inviter_idx
  ON player_referrals (inviter_player_id, accepted_at);

CREATE TABLE player_friends (
  player_a_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  player_b_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL DEFAULT 'referral' CHECK (source = 'referral'),
  PRIMARY KEY (player_a_id, player_b_id),
  CHECK (player_a_id < player_b_id)
);

CREATE TABLE player_boosts (
  id UUID PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  boost_type TEXT NOT NULL CHECK (boost_type = 'account_x2'),
  starts_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL CHECK (source = 'campaign_referral'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_id, boost_type, source),
  CHECK (expires_at = starts_at + INTERVAL '24 hours')
);

CREATE INDEX player_boosts_active_idx
  ON player_boosts (player_id, boost_type, expires_at);

ALTER TABLE duels DROP CONSTRAINT IF EXISTS duels_opponent_kind_check;
ALTER TABLE duels DROP CONSTRAINT IF EXISTS duel_opponent_source_check;
ALTER TABLE duels
  ADD COLUMN campaign_id TEXT,
  ADD CONSTRAINT duels_opponent_kind_check
    CHECK (opponent_kind IN ('real', 'bot', 'campaign_boss')),
  ADD CONSTRAINT duel_opponent_source_check CHECK (
    (opponent_kind = 'real' AND opponent_id IS NOT NULL AND campaign_id IS NULL)
    OR (opponent_kind = 'bot' AND opponent_id IS NULL AND campaign_id IS NULL)
    OR (opponent_kind = 'campaign_boss' AND opponent_id IS NULL AND campaign_id = 'campaign_1')
  );

CREATE UNIQUE INDEX duels_one_active_campaign_boss_idx
  ON duels (challenger_id, campaign_id)
  WHERE opponent_kind = 'campaign_boss' AND status = 'active';
