ALTER TABLE player_card_instances
  DROP CONSTRAINT IF EXISTS player_card_instances_level_progress_elements_check;

ALTER TABLE player_card_instances
  ADD CONSTRAINT player_card_instances_level_progress_elements_non_negative_check
  CHECK (level_progress_elements >= 0);
