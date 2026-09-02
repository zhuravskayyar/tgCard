UPDATE guild_witch_raid_bosses bosses
SET max_health = 450000,
    current_health = 450000,
    witch_deck = '[]'::jsonb
FROM guild_witch_raids raids
WHERE raids.id = bosses.raid_id
  AND raids.level = 1;
