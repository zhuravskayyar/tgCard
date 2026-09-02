ALTER TABLE guild_witch_raid_battles
  ADD COLUMN witch_unique_cards JSONB NOT NULL DEFAULT '[]'::jsonb;
