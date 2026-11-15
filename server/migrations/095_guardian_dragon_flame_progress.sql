-- Dragon flame level progress (reference elem.mobi /dragon/magic/): the flame levels up like an
-- ordinary card, so it keeps the same two counters as player_card_instances. Permanent: the monthly
-- rebirth never touches flame_level, flame_level_progress_elements or flame_stored_elements.
ALTER TABLE guardian_dragons
  ADD COLUMN flame_level_progress_elements NUMERIC(20, 2) NOT NULL DEFAULT 0 CHECK (flame_level_progress_elements >= 0),
  ADD COLUMN flame_stored_elements NUMERIC(30, 2) NOT NULL DEFAULT 0 CHECK (flame_stored_elements >= 0);
