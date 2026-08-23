ALTER TABLE player_card_instances
  ADD COLUMN level_progress_elements INTEGER NOT NULL DEFAULT 0
    CHECK (level_progress_elements BETWEEN 0 AND 100),
  ADD COLUMN stored_elements BIGINT NOT NULL DEFAULT 0
    CHECK (stored_elements >= 0);

CREATE INDEX player_card_instances_weak_sort_idx
  ON player_card_instances (player_id, level DESC, bonus_power DESC, id);
