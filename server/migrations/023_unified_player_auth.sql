ALTER TABLE players
  ALTER COLUMN telegram_user_id DROP NOT NULL;

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS rating INTEGER NOT NULL DEFAULT 0 CHECK (rating >= 0);

UPDATE players
SET rating = duel_rating
WHERE rating = 0 AND duel_rating > 0;

CREATE TABLE IF NOT EXISTS auth_identities (
  id UUID PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('telegram', 'google')),
  provider_user_id TEXT NOT NULL,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_user_id),
  UNIQUE (player_id, provider)
);

CREATE INDEX IF NOT EXISTS auth_identities_player_id_idx
  ON auth_identities (player_id);

INSERT INTO auth_identities (id, player_id, provider, provider_user_id)
SELECT gen_random_uuid(), id, 'telegram', telegram_user_id::TEXT
FROM players
WHERE telegram_user_id IS NOT NULL
ON CONFLICT (provider, provider_user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS player_sessions (
  token_hash TEXT PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('telegram', 'google')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS player_sessions_player_id_idx
  ON player_sessions (player_id);

CREATE INDEX IF NOT EXISTS player_sessions_active_idx
  ON player_sessions (token_hash, expires_at)
  WHERE revoked_at IS NULL;
