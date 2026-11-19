-- Duels: only a few free «Шукати іншого» per duel, so endlessly rerolling for a weak opponent is not the best
-- strategy (docs/duel.md). Counts rerolls since the last duel started; starting a duel resets it.
ALTER TABLE players ADD COLUMN IF NOT EXISTS duel_search_rerolls INTEGER NOT NULL DEFAULT 0 CHECK (duel_search_rerolls >= 0);
