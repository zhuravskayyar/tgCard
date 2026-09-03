ALTER TABLE guild_witch_raids
  DROP CONSTRAINT IF EXISTS guild_witch_raids_level_one_check;

UPDATE guilds
SET emblem_id = 'shield-1'
WHERE emblem_id IS NULL OR emblem_id !~ '^shield-[1-8]$';
