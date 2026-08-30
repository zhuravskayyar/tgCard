ALTER TABLE players
  DROP CONSTRAINT IF EXISTS players_arena_gold_earned_today_check;

ALTER TABLE players
  ADD CONSTRAINT players_arena_gold_earned_today_check
    CHECK (arena_gold_earned_today >= 0 AND arena_gold_earned_today <= 45);
