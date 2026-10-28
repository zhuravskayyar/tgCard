INSERT INTO cards (
  id, code, display_name, element, collection_id, art_key,
  min_rarity, shop_eligible, description, limited, source
)
VALUES
  ('starter_v5_01', 'starter_v5_01', 'Борсук', 'earth', NULL, 'new-cards/starter_v2_01', 'common', FALSE, 'Істота стихії Земля.', FALSE, 'standard'),
  ('starter_v5_02', 'starter_v5_02', 'Рогач', 'earth', NULL, 'new-cards/starter_v2_02', 'common', FALSE, 'Істота стихії Земля.', FALSE, 'standard'),
  ('starter_v5_03', 'starter_v5_03', 'Корона коренів', 'earth', NULL, 'new-cards/starter_v2_03', 'common', FALSE, 'Артефакт стихії Земля.', FALSE, 'standard'),
  ('starter_v5_04', 'starter_v5_04', 'Вогняний кабан', 'fire', NULL, 'new-cards/starter_v2_04', 'common', FALSE, 'Істота стихії Вогонь.', FALSE, 'standard'),
  ('starter_v5_05', 'starter_v5_05', 'Вугільна ропуха', 'fire', NULL, 'new-cards/starter_v2_05', 'common', FALSE, 'Істота стихії Вогонь.', FALSE, 'standard'),
  ('starter_v5_06', 'starter_v5_06', 'Морський коник', 'water', NULL, 'new-cards/starter_v2_06', 'common', FALSE, 'Істота стихії Вода.', FALSE, 'standard'),
  ('starter_v5_07', 'starter_v5_07', 'Чаша хвиль', 'water', NULL, 'new-cards/starter_v2_07', 'common', FALSE, 'Артефакт стихії Вода.', FALSE, 'standard'),
  ('starter_v5_08', 'starter_v5_08', 'Ластівка', 'air', NULL, 'new-cards/starter_v2_08', 'common', FALSE, 'Істота стихії Повітря.', FALSE, 'standard'),
  ('starter_v5_09', 'starter_v5_09', 'Вихор', 'air', NULL, 'new-cards/starter_v2_09', 'common', FALSE, 'Явище стихії Повітря.', FALSE, 'standard')
ON CONFLICT (id) DO UPDATE SET
  code = EXCLUDED.code,
  display_name = EXCLUDED.display_name,
  element = EXCLUDED.element,
  collection_id = EXCLUDED.collection_id,
  art_key = EXCLUDED.art_key,
  min_rarity = EXCLUDED.min_rarity,
  shop_eligible = EXCLUDED.shop_eligible,
  description = EXCLUDED.description,
  limited = EXCLUDED.limited,
  source = EXCLUDED.source;

DO $$
BEGIN
  IF (
    SELECT COUNT(*)
    FROM cards
    WHERE id = ANY(ARRAY[
      'starter_v5_01', 'starter_v5_02', 'starter_v5_03',
      'starter_v5_04', 'starter_v5_05', 'starter_v5_06',
      'starter_v5_07', 'starter_v5_08', 'starter_v5_09'
    ]::text[])
  ) <> 9 THEN
    RAISE EXCEPTION 'Cannot archive legacy starters before the complete starter_v5 catalog is seeded';
  END IF;
END
$$;

CREATE TABLE archived_legacy_starter_cards AS
SELECT cards.*, CURRENT_TIMESTAMP AS archived_at
FROM cards
WHERE id = ANY(ARRAY[
  'starter_01', 'starter_02', 'starter_03', 'starter_04', 'starter_05',
  'starter_06', 'starter_07', 'starter_08', 'starter_09'
]::text[]);

CREATE TABLE archived_legacy_starter_instances AS
SELECT player_card_instances.*, CURRENT_TIMESTAMP AS archived_at
FROM player_card_instances
WHERE card_id = ANY(ARRAY[
  'starter_01', 'starter_02', 'starter_03', 'starter_04', 'starter_05',
  'starter_06', 'starter_07', 'starter_08', 'starter_09'
]::text[]);

CREATE TABLE archived_legacy_starter_discoveries AS
SELECT player_card_discoveries.*, CURRENT_TIMESTAMP AS archived_at
FROM player_card_discoveries
WHERE card_id = ANY(ARRAY[
  'starter_01', 'starter_02', 'starter_03', 'starter_04', 'starter_05',
  'starter_06', 'starter_07', 'starter_08', 'starter_09'
]::text[]);

CREATE TABLE archived_legacy_starter_deck_slots AS
SELECT deck_slots.*, CURRENT_TIMESTAMP AS archived_at
FROM deck_slots
INNER JOIN player_card_instances
  ON player_card_instances.id = deck_slots.card_instance_id
WHERE player_card_instances.card_id = ANY(ARRAY[
  'starter_01', 'starter_02', 'starter_03', 'starter_04', 'starter_05',
  'starter_06', 'starter_07', 'starter_08', 'starter_09'
]::text[]);

CREATE TABLE archived_legacy_starter_guild_cards AS
SELECT guild_cards.*, CURRENT_TIMESTAMP AS archived_at
FROM guild_cards
WHERE card_id = ANY(ARRAY[
  'starter_01', 'starter_02', 'starter_03', 'starter_04', 'starter_05',
  'starter_06', 'starter_07', 'starter_08', 'starter_09'
]::text[]);

CREATE TABLE archived_legacy_starter_mail AS
SELECT player_mail.*, CURRENT_TIMESTAMP AS archived_at
FROM player_mail
WHERE card_id = ANY(ARRAY[
  'starter_01', 'starter_02', 'starter_03', 'starter_04', 'starter_05',
  'starter_06', 'starter_07', 'starter_08', 'starter_09'
]::text[]);

CREATE TABLE archived_legacy_starter_raid_bosses AS
SELECT guild_witch_raid_bosses.*, CURRENT_TIMESTAMP AS archived_at
FROM guild_witch_raid_bosses
WHERE card_id = ANY(ARRAY[
  'starter_01', 'starter_02', 'starter_03', 'starter_04', 'starter_05',
  'starter_06', 'starter_07', 'starter_08', 'starter_09'
]::text[]);

CREATE TABLE archived_legacy_starter_limited_events AS
SELECT limited_card_events.*, CURRENT_TIMESTAMP AS archived_at
FROM limited_card_events
WHERE card_id = ANY(ARRAY[
  'starter_01', 'starter_02', 'starter_03', 'starter_04', 'starter_05',
  'starter_06', 'starter_07', 'starter_08', 'starter_09'
]::text[]);

CREATE TABLE archived_legacy_starter_shop_pool AS
SELECT shop_card_pools.*, CURRENT_TIMESTAMP AS archived_at
FROM shop_card_pools
WHERE card_id = ANY(ARRAY[
  'starter_01', 'starter_02', 'starter_03', 'starter_04', 'starter_05',
  'starter_06', 'starter_07', 'starter_08', 'starter_09'
]::text[]);

CREATE TABLE archived_legacy_starter_guild_pointers AS
SELECT guilds.id AS guild_id, guilds.active_guild_card_instance_id, CURRENT_TIMESTAMP AS archived_at
FROM guilds
INNER JOIN player_card_instances
  ON player_card_instances.id = guilds.active_guild_card_instance_id
WHERE player_card_instances.card_id = ANY(ARRAY[
  'starter_01', 'starter_02', 'starter_03', 'starter_04', 'starter_05',
  'starter_06', 'starter_07', 'starter_08', 'starter_09'
]::text[]);

WITH legacy_map(old_id, new_id) AS (
  VALUES
    ('starter_01', 'starter_v5_04'),
    ('starter_02', 'starter_v5_04'),
    ('starter_03', 'starter_v5_05'),
    ('starter_04', 'starter_v5_06'),
    ('starter_05', 'starter_v5_06'),
    ('starter_06', 'starter_v5_08'),
    ('starter_07', 'starter_v5_08'),
    ('starter_08', 'starter_v5_01'),
    ('starter_09', 'starter_v5_02')
)
UPDATE guild_cards
SET card_id = legacy_map.new_id
FROM legacy_map
WHERE guild_cards.card_id = legacy_map.old_id;

WITH legacy_map(old_id, new_id) AS (
  VALUES
    ('starter_01', 'starter_v5_04'),
    ('starter_02', 'starter_v5_04'),
    ('starter_03', 'starter_v5_05'),
    ('starter_04', 'starter_v5_06'),
    ('starter_05', 'starter_v5_06'),
    ('starter_06', 'starter_v5_08'),
    ('starter_07', 'starter_v5_08'),
    ('starter_08', 'starter_v5_01'),
    ('starter_09', 'starter_v5_02')
)
UPDATE guild_witch_raid_bosses
SET card_id = legacy_map.new_id
FROM legacy_map
WHERE guild_witch_raid_bosses.card_id = legacy_map.old_id;

WITH legacy_map(old_id, new_id) AS (
  VALUES
    ('starter_01', 'starter_v5_04'),
    ('starter_02', 'starter_v5_04'),
    ('starter_03', 'starter_v5_05'),
    ('starter_04', 'starter_v5_06'),
    ('starter_05', 'starter_v5_06'),
    ('starter_06', 'starter_v5_08'),
    ('starter_07', 'starter_v5_08'),
    ('starter_08', 'starter_v5_01'),
    ('starter_09', 'starter_v5_02')
)
UPDATE limited_card_events
SET card_id = legacy_map.new_id
FROM legacy_map
WHERE limited_card_events.card_id = legacy_map.old_id;

WITH legacy_map(old_id, new_id) AS (
  VALUES
    ('starter_01', 'starter_v5_04'),
    ('starter_02', 'starter_v5_04'),
    ('starter_03', 'starter_v5_05'),
    ('starter_04', 'starter_v5_06'),
    ('starter_05', 'starter_v5_06'),
    ('starter_06', 'starter_v5_08'),
    ('starter_07', 'starter_v5_08'),
    ('starter_08', 'starter_v5_01'),
    ('starter_09', 'starter_v5_02')
)
UPDATE player_mail
SET card_id = legacy_map.new_id
FROM legacy_map
WHERE player_mail.card_id = legacy_map.old_id;

WITH legacy_map(old_id, new_id) AS (
  VALUES
    ('starter_01', 'starter_v5_04'),
    ('starter_02', 'starter_v5_04'),
    ('starter_03', 'starter_v5_05'),
    ('starter_04', 'starter_v5_06'),
    ('starter_05', 'starter_v5_06'),
    ('starter_06', 'starter_v5_08'),
    ('starter_07', 'starter_v5_08'),
    ('starter_08', 'starter_v5_01'),
    ('starter_09', 'starter_v5_02')
)
UPDATE player_card_instances
SET card_id = legacy_map.new_id
FROM legacy_map
WHERE player_card_instances.card_id = legacy_map.old_id
  AND (
    EXISTS (
      SELECT 1 FROM guilds
      WHERE guilds.active_guild_card_instance_id = player_card_instances.id
    )
    OR EXISTS (
      SELECT 1 FROM guild_cards
      WHERE guild_cards.source_player_card_instance_id = player_card_instances.id
    )
  );

DELETE FROM deck_slots
USING player_card_instances
WHERE deck_slots.card_instance_id = player_card_instances.id
  AND player_card_instances.card_id = ANY(ARRAY[
    'starter_01', 'starter_02', 'starter_03', 'starter_04', 'starter_05',
    'starter_06', 'starter_07', 'starter_08', 'starter_09'
  ]::text[]);

DELETE FROM player_card_discoveries
WHERE card_id = ANY(ARRAY[
  'starter_01', 'starter_02', 'starter_03', 'starter_04', 'starter_05',
  'starter_06', 'starter_07', 'starter_08', 'starter_09'
]::text[]);

DELETE FROM player_card_instances
WHERE card_id = ANY(ARRAY[
  'starter_01', 'starter_02', 'starter_03', 'starter_04', 'starter_05',
  'starter_06', 'starter_07', 'starter_08', 'starter_09'
]::text[]);

DELETE FROM shop_card_pools
WHERE card_id = ANY(ARRAY[
  'starter_01', 'starter_02', 'starter_03', 'starter_04', 'starter_05',
  'starter_06', 'starter_07', 'starter_08', 'starter_09'
]::text[]);

DELETE FROM cards
WHERE id = ANY(ARRAY[
  'starter_01', 'starter_02', 'starter_03', 'starter_04', 'starter_05',
  'starter_06', 'starter_07', 'starter_08', 'starter_09'
]::text[]);

UPDATE cards
SET art_key = 'new-cards/' || replace(id, 'starter_v5_', 'starter_v2_')
WHERE id LIKE 'starter_v5_%';
