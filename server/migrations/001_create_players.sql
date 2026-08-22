CREATE TABLE players (
  id UUID PRIMARY KEY,
  telegram_user_id BIGINT NOT NULL UNIQUE,
  username TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT,
  photo_url TEXT,
  level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  silver BIGINT NOT NULL DEFAULT 1500 CHECK (silver >= 0),
  gold BIGINT NOT NULL DEFAULT 0 CHECK (gold >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
