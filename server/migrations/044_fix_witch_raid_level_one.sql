ALTER TABLE guild_witch_raids
  ADD CONSTRAINT guild_witch_raids_level_one_check CHECK (level = 1);
