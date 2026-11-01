-- Arena gets its own rating scale: players enter at 1400, league thresholds differ
-- from duels, and the one-time promotion silver needs the highest league reached.
ALTER TABLE players
  ALTER COLUMN arena_rating SET DEFAULT 1400,
  ALTER COLUMN arena_league_index SET DEFAULT 6,
  ADD COLUMN arena_highest_league_index INTEGER NOT NULL DEFAULT 6
    CHECK (arena_highest_league_index >= 0 AND arena_highest_league_index < 21);

UPDATE players SET arena_rating = arena_rating + 1400;

UPDATE players SET arena_league_index = CASE
  WHEN arena_rating >= 4200 THEN 20
  WHEN arena_rating >= 800 THEN 3 + (arena_rating - 800) / 200
  WHEN arena_rating >= 600 THEN 2
  WHEN arena_rating >= 500 THEN 1
  ELSE 0
END;

UPDATE players SET arena_highest_league_index = arena_league_index;

CREATE INDEX players_arena_league_rating_idx ON players (arena_league_index, arena_rating DESC);
