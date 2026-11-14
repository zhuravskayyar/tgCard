-- Paid Duels (reference manual): automatic Duels played today raise the break price every 1000.
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS duel_auto_day DATE,
  ADD COLUMN IF NOT EXISTS duel_auto_count INTEGER NOT NULL DEFAULT 0 CHECK (duel_auto_count >= 0);
