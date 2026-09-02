ALTER TABLE guild_witch_raid_bosses
  ALTER COLUMN max_health SET DEFAULT 225000,
  ALTER COLUMN current_health SET DEFAULT 225000;

UPDATE guild_witch_raid_bosses
SET max_health = 225000,
    current_health = LEAST(current_health, 225000)
WHERE max_health = 450000;
