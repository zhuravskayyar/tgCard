ALTER TABLE player_card_instances
  ADD COLUMN protected_from_absorption BOOLEAN NOT NULL DEFAULT FALSE;
