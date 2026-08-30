ALTER TABLE player_card_instances
  ALTER COLUMN level_progress_elements TYPE NUMERIC(20, 2)
    USING level_progress_elements::numeric,
  ALTER COLUMN stored_elements TYPE NUMERIC(30, 2)
    USING stored_elements::numeric;
