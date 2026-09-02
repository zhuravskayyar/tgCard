ALTER TABLE player_mail
  ADD COLUMN card_id TEXT REFERENCES cards(id) ON DELETE RESTRICT,
  ADD COLUMN card_level INTEGER,
  ADD COLUMN source_key TEXT;

ALTER TABLE player_mail
  ADD CONSTRAINT player_mail_card_reward_check
  CHECK (
    (card_id IS NULL AND card_level IS NULL)
    OR (card_id IS NOT NULL AND card_level BETWEEN 1 AND 180)
  );

CREATE UNIQUE INDEX player_mail_source_key_idx
  ON player_mail (source_key)
  WHERE source_key IS NOT NULL;

ALTER TABLE guild_witch_raid_result_participants
  ADD COLUMN duel_rating INTEGER NOT NULL DEFAULT 0
    CHECK (duel_rating >= 0);

ALTER TABLE guild_witch_raid_bosses
  ALTER COLUMN max_health SET DEFAULT 450000,
  ALTER COLUMN current_health SET DEFAULT 450000;

UPDATE guild_witch_raid_bosses bosses
SET max_health = 450000,
    current_health = 450000,
    witch_deck = '[]'::jsonb
FROM guild_witch_raids raids
WHERE raids.id = bosses.raid_id
  AND raids.level = 1;
