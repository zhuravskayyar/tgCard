ALTER TABLE players
  ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS players_human_duel_leaderboard_idx
  ON players (duel_rating DESC, duel_wins DESC, id)
  WHERE is_bot = FALSE;

CREATE TABLE simulated_bot_profiles (
  bot_key TEXT PRIMARY KEY CHECK (bot_key ~ '^[a-z0-9-]{2,40}$'),
  player_id UUID NOT NULL UNIQUE REFERENCES players(id) ON DELETE CASCADE,
  guild_id UUID UNIQUE REFERENCES guilds(id) ON DELETE SET NULL,
  language TEXT NOT NULL CHECK (language IN ('uk', 'ru', 'en', 'de', 'other')),
  personality TEXT NOT NULL CHECK (personality IN ('tactician', 'rusher', 'collector', 'wanderer', 'guardian')),
  avatar_index SMALLINT NOT NULL UNIQUE CHECK (avatar_index BETWEEN 1 AND 10),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_active_at TIMESTAMPTZ,
  last_social_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX simulated_bot_profiles_active_idx
  ON simulated_bot_profiles (enabled, language, bot_key);

CREATE TABLE simulated_bot_runs (
  bot_key TEXT NOT NULL REFERENCES simulated_bot_profiles(bot_key) ON DELETE CASCADE,
  run_date DATE NOT NULL,
  session_window TEXT NOT NULL CHECK (session_window IN ('slot-1', 'slot-2', 'slot-3', 'slot-4', 'slot-5', 'slot-6')),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'complete', 'failed')),
  target_duels SMALLINT NOT NULL DEFAULT 1 CHECK (target_duels BETWEEN 1 AND 2),
  duels_played SMALLINT NOT NULL DEFAULT 0 CHECK (duels_played BETWEEN 0 AND 2),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (bot_key, run_date, session_window)
);

CREATE INDEX simulated_bot_runs_recent_idx
  ON simulated_bot_runs (run_date DESC, started_at DESC);
