CREATE TABLE IF NOT EXISTS guest_creation_rate_limits (
  ip_hash TEXT PRIMARY KEY CHECK (ip_hash ~ '^[a-f0-9]{64}$'),
  hour_started_at TIMESTAMPTZ NOT NULL,
  hour_count INTEGER NOT NULL CHECK (hour_count BETWEEN 1 AND 1000),
  day_started_at TIMESTAMPTZ NOT NULL,
  day_count INTEGER NOT NULL CHECK (day_count BETWEEN 1 AND 1000),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS guest_creation_rate_limits_updated_at_idx
  ON guest_creation_rate_limits (updated_at);

ALTER TABLE player_account_link_rewards
  ADD COLUMN IF NOT EXISTS linked_provider TEXT,
  ADD COLUMN IF NOT EXISTS linked_provider_user_id TEXT;

WITH first_linked_identity AS (
  SELECT DISTINCT ON (player_id)
    player_id,
    provider,
    provider_user_id
  FROM auth_identities
  ORDER BY player_id, created_at, id
)
UPDATE player_account_link_rewards AS rewards
SET linked_provider = identity.provider,
    linked_provider_user_id = identity.provider_user_id
FROM first_linked_identity AS identity
WHERE rewards.player_id = identity.player_id
  AND rewards.linked_provider IS NULL
  AND rewards.linked_provider_user_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'player_account_link_rewards_identity_pair_check'
      AND conrelid = 'player_account_link_rewards'::regclass
  ) THEN
    ALTER TABLE player_account_link_rewards
      ADD CONSTRAINT player_account_link_rewards_identity_pair_check
      CHECK (
        (linked_provider IS NULL AND linked_provider_user_id IS NULL)
        OR (
          linked_provider IN ('telegram', 'google')
          AND linked_provider_user_id IS NOT NULL
          AND length(linked_provider_user_id) > 0
        )
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS player_account_link_rewards_identity_idx
  ON player_account_link_rewards (linked_provider, linked_provider_user_id)
  WHERE linked_provider IS NOT NULL AND linked_provider_user_id IS NOT NULL;
