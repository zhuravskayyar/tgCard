ALTER TABLE simulated_bot_profiles
  DROP CONSTRAINT IF EXISTS simulated_bot_profiles_guild_id_key,
  DROP CONSTRAINT IF EXISTS simulated_bot_profiles_avatar_index_check,
  ADD CONSTRAINT simulated_bot_profiles_avatar_index_check
    CHECK (avatar_index BETWEEN 1 AND 40),
  ADD COLUMN IF NOT EXISTS duel_league_seeded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS simulated_bot_profiles_guild_id_idx
  ON simulated_bot_profiles (guild_id);

ALTER TABLE simulated_bot_runs
  DROP CONSTRAINT IF EXISTS simulated_bot_runs_session_window_check,
  ADD CONSTRAINT simulated_bot_runs_session_window_check
    CHECK (session_window IN (
      'slot-1', 'slot-2', 'slot-3', 'slot-4', 'slot-5', 'slot-6',
      'slot-7', 'slot-8', 'slot-9', 'slot-10', 'slot-11', 'slot-12'
    ));

CREATE INDEX IF NOT EXISTS players_duel_leaderboard_idx
  ON players (duel_rating DESC, duel_wins DESC, id)
  WHERE duel_wins >= 10;
