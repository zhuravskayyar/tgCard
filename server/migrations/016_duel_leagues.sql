ALTER TABLE players
  ADD COLUMN IF NOT EXISTS duel_rating INTEGER NOT NULL DEFAULT 0 CHECK (duel_rating >= 0),
  ADD COLUMN IF NOT EXISTS duel_highest_league_index INTEGER NOT NULL DEFAULT 0 CHECK (duel_highest_league_index >= 0);
