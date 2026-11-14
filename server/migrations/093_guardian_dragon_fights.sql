-- Guardian dragon fights and magic (reference elem.mobi /dragon/fights/, /dragon/magic/).
-- Mastery is kept in tenths: every fight adds half a point. Rating is per month; the previous
-- month's rating stays on the row after rebirth so the old top 100 can still be ranked.
ALTER TABLE guardian_dragons
  ADD COLUMN mastery_tenths INTEGER NOT NULL DEFAULT 450 CHECK (mastery_tenths >= 0),
  ADD COLUMN rating INTEGER NOT NULL DEFAULT 0 CHECK (rating >= 0),
  ADD COLUMN fights_cooldown_until TIMESTAMPTZ,
  ADD COLUMN paid_sends INTEGER NOT NULL DEFAULT 0 CHECK (paid_sends >= 0),
  ADD COLUMN prev_month_key TEXT,
  ADD COLUMN prev_rating INTEGER,
  ADD COLUMN flame_level SMALLINT NOT NULL DEFAULT 90 CHECK (flame_level BETWEEN 1 AND 180);

UPDATE guardian_dragons SET mastery_tenths = mastery * 10;

CREATE INDEX guardian_dragons_rating_idx ON guardian_dragons (month_key, rating DESC);
