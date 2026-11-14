-- Guardian dragon (reference elem.mobi /forum/3/268062/). One dragon per player and month:
-- health resets to 0 at the start of every UTC month, mastery starts at 45.
-- Rules live in game-core/src/guardianDragon.ts; the server resolves hikes and rebirth lazily.

CREATE TABLE guardian_dragons (
  player_id UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  month_key TEXT NOT NULL CHECK (month_key ~ '^[0-9]{4}-[0-9]{2}$'),
  health INTEGER NOT NULL DEFAULT 0 CHECK (health BETWEEN 0 AND 17600),
  mastery INTEGER NOT NULL DEFAULT 45 CHECK (mastery >= 0),
  progress_minutes INTEGER NOT NULL DEFAULT 0 CHECK (progress_minutes BETWEEN 0 AND 480),
  hike_hours SMALLINT CHECK (hike_hours IN (2, 4, 8)),
  hike_health_gain INTEGER CHECK (hike_health_gain IN (80, 160, 320)),
  hike_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((hike_hours IS NULL) = (hike_ends_at IS NULL) AND (hike_hours IS NULL) = (hike_health_gain IS NULL))
);
