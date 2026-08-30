ALTER TABLE players
  ADD COLUMN duel_gold_earned_today INTEGER NOT NULL DEFAULT 0
    CHECK (duel_gold_earned_today >= 0),
  ADD COLUMN duel_gold_day DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN duel_gold_level INTEGER NOT NULL DEFAULT 1
    CHECK (duel_gold_level >= 1);
