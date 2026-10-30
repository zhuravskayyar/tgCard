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
    RAISE EXCEPTION 'Cannot activate the new catalog before all nine starter_v5 cards exist';
  END IF;
END
$$;

-- Keep a recoverable snapshot of the retired catalog and its owned state.
CREATE TABLE archived_legacy_catalog_collections AS
SELECT collections.*, CURRENT_TIMESTAMP AS archived_at
FROM collections;

CREATE TABLE archived_legacy_catalog_cards AS
SELECT cards.*, CURRENT_TIMESTAMP AS archived_at
FROM cards
WHERE id <> ALL(ARRAY[
  'starter_v5_01', 'starter_v5_02', 'starter_v5_03',
  'starter_v5_04', 'starter_v5_05', 'starter_v5_06',
  'starter_v5_07', 'starter_v5_08', 'starter_v5_09'
]::text[]);

CREATE TABLE archived_legacy_catalog_player_card_instances AS
SELECT instances.*, CURRENT_TIMESTAMP AS archived_at
FROM player_card_instances instances
WHERE instances.card_id <> ALL(ARRAY[
  'starter_v5_01', 'starter_v5_02', 'starter_v5_03',
  'starter_v5_04', 'starter_v5_05', 'starter_v5_06',
  'starter_v5_07', 'starter_v5_08', 'starter_v5_09'
]::text[]);

CREATE TABLE archived_legacy_catalog_deck_slots AS
SELECT slots.*, CURRENT_TIMESTAMP AS archived_at
FROM deck_slots slots
INNER JOIN player_card_instances instances ON instances.id = slots.card_instance_id
WHERE instances.card_id <> ALL(ARRAY[
  'starter_v5_01', 'starter_v5_02', 'starter_v5_03',
  'starter_v5_04', 'starter_v5_05', 'starter_v5_06',
  'starter_v5_07', 'starter_v5_08', 'starter_v5_09'
]::text[]);

CREATE TABLE archived_legacy_catalog_player_card_discoveries AS
SELECT discoveries.*, CURRENT_TIMESTAMP AS archived_at
FROM player_card_discoveries discoveries
WHERE discoveries.card_id <> ALL(ARRAY[
  'starter_v5_01', 'starter_v5_02', 'starter_v5_03',
  'starter_v5_04', 'starter_v5_05', 'starter_v5_06',
  'starter_v5_07', 'starter_v5_08', 'starter_v5_09'
]::text[]);

CREATE TABLE archived_legacy_catalog_player_collection_completions AS
SELECT completions.*, CURRENT_TIMESTAMP AS archived_at
FROM player_collection_completions completions;

CREATE TABLE archived_legacy_catalog_guild_cards AS
SELECT guild_cards.*, CURRENT_TIMESTAMP AS archived_at
FROM guild_cards
WHERE card_id <> ALL(ARRAY[
  'starter_v5_01', 'starter_v5_02', 'starter_v5_03',
  'starter_v5_04', 'starter_v5_05', 'starter_v5_06',
  'starter_v5_07', 'starter_v5_08', 'starter_v5_09'
]::text[])
OR source_player_card_instance_id IN (
  SELECT id FROM archived_legacy_catalog_player_card_instances
);

CREATE TABLE archived_legacy_catalog_guild_pointers AS
SELECT guilds.id AS guild_id, guilds.active_guild_card_instance_id,
  CURRENT_TIMESTAMP AS archived_at
FROM guilds
INNER JOIN archived_legacy_catalog_player_card_instances instances
  ON instances.id = guilds.active_guild_card_instance_id;

CREATE TABLE archived_legacy_catalog_guild_raid_bosses AS
SELECT bosses.*, CURRENT_TIMESTAMP AS archived_at
FROM guild_witch_raid_bosses bosses
WHERE bosses.card_id <> ALL(ARRAY[
  'starter_v5_01', 'starter_v5_02', 'starter_v5_03',
  'starter_v5_04', 'starter_v5_05', 'starter_v5_06',
  'starter_v5_07', 'starter_v5_08', 'starter_v5_09'
]::text[]);

CREATE TABLE archived_legacy_catalog_guild_raid_battles AS
SELECT battles.*, CURRENT_TIMESTAMP AS archived_at
FROM guild_witch_raid_battles battles;

CREATE TABLE archived_legacy_catalog_guild_raid_participants AS
SELECT participants.*, CURRENT_TIMESTAMP AS archived_at
FROM guild_witch_raid_participants participants;

CREATE TABLE archived_legacy_catalog_limited_card_events AS
SELECT events.*, CURRENT_TIMESTAMP AS archived_at
FROM limited_card_events events
INNER JOIN archived_legacy_catalog_cards cards ON cards.id = events.card_id;

CREATE TABLE archived_legacy_catalog_limited_card_redemptions AS
SELECT redemptions.*, CURRENT_TIMESTAMP AS archived_at
FROM player_limited_card_redemptions redemptions
INNER JOIN archived_legacy_catalog_limited_card_events events ON events.id = redemptions.event_id;

CREATE TABLE archived_legacy_catalog_player_mail AS
SELECT mail.*, CURRENT_TIMESTAMP AS archived_at
FROM player_mail mail
INNER JOIN archived_legacy_catalog_cards cards ON cards.id = mail.card_id;

CREATE TABLE archived_legacy_catalog_shop_card_pools AS
SELECT pools.*, CURRENT_TIMESTAMP AS archived_at
FROM shop_card_pools pools
INNER JOIN archived_legacy_catalog_cards cards ON cards.id = pools.card_id;

CREATE TABLE archived_legacy_catalog_active_duels AS
SELECT duels.*, CURRENT_TIMESTAMP AS archived_at
FROM duels
WHERE status = 'active';

CREATE TABLE archived_legacy_catalog_active_arena_matches AS
SELECT matches.*, CURRENT_TIMESTAMP AS archived_at
FROM arena_matches matches
WHERE status = 'active';

CREATE TABLE archived_legacy_catalog_active_arena_match_players AS
SELECT players.*, CURRENT_TIMESTAMP AS archived_at
FROM arena_match_players players
INNER JOIN archived_legacy_catalog_active_arena_matches matches
  ON matches.id = players.match_id;

UPDATE guilds
SET active_guild_card_instance_id = NULL, updated_at = NOW()
WHERE active_guild_card_instance_id IN (
  SELECT id FROM archived_legacy_catalog_player_card_instances
);

UPDATE guild_cards guild
SET card_id = CASE old_card.element
      WHEN 'fire' THEN 'starter_v5_04'
      WHEN 'water' THEN 'starter_v5_06'
      WHEN 'air' THEN 'starter_v5_08'
      ELSE 'starter_v5_01'
    END,
    source_player_card_instance_id = NULL,
    level = 1,
    bonus_power = 2,
    level_progress_elements = 0,
    stored_elements = 0,
    updated_at = NOW()
FROM archived_legacy_catalog_cards old_card
WHERE guild.card_id = old_card.id;

UPDATE guild_cards
SET source_player_card_instance_id = NULL,
    level = 1,
    bonus_power = 2,
    level_progress_elements = 0,
    stored_elements = 0,
    updated_at = NOW()
WHERE source_player_card_instance_id IN (
  SELECT id FROM archived_legacy_catalog_player_card_instances
);

UPDATE guild_witch_raid_bosses bosses
SET card_id = CASE bosses.slot
      WHEN 1 THEN 'starter_v5_04'
      ELSE 'starter_v5_06'
    END,
    max_health = 450000,
    current_health = 450000,
    witch_deck = '[]'::jsonb
WHERE bosses.card_id IN (SELECT id FROM archived_legacy_catalog_cards);

UPDATE guild_witch_raids
SET level = 1,
    status = 'open',
    week_key = date_trunc('week', CURRENT_DATE)::date,
    started_at = NULL,
    updated_at = NOW();

UPDATE player_mail mail
SET card_id = CASE cards.element
      WHEN 'fire' THEN 'starter_v5_04'
      WHEN 'water' THEN 'starter_v5_06'
      WHEN 'air' THEN 'starter_v5_08'
      ELSE 'starter_v5_01'
    END,
    subject = 'Карткову нагороду оновлено',
    body = 'Стара карткова нагорода замінена картою з нового стартового набору.'
FROM archived_legacy_catalog_cards cards
WHERE mail.card_id = cards.id;

DELETE FROM guild_witch_raid_battles;
DELETE FROM guild_witch_raid_participants;
DELETE FROM arena_matches WHERE status = 'active';
DELETE FROM duels WHERE status = 'active';
DELETE FROM player_limited_card_redemptions
WHERE event_id IN (SELECT id FROM archived_legacy_catalog_limited_card_events);
DELETE FROM limited_card_events
WHERE id IN (SELECT id FROM archived_legacy_catalog_limited_card_events);
DELETE FROM shop_card_pools
WHERE card_id IN (SELECT id FROM archived_legacy_catalog_cards);
DELETE FROM deck_slots
WHERE card_instance_id IN (SELECT id FROM archived_legacy_catalog_player_card_instances);
DELETE FROM player_card_discoveries
WHERE card_id IN (SELECT id FROM archived_legacy_catalog_cards);
DELETE FROM player_card_instances
WHERE id IN (SELECT id FROM archived_legacy_catalog_player_card_instances);
DELETE FROM player_collection_completions;
DELETE FROM cards WHERE id IN (SELECT id FROM archived_legacy_catalog_cards);
DELETE FROM collections;

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM cards) <> 9 THEN
    RAISE EXCEPTION 'New starter catalog must be the only active card catalog';
  END IF;
  IF (SELECT COUNT(*) FROM collections) <> 0 THEN
    RAISE EXCEPTION 'Legacy collections must not remain active';
  END IF;
END
$$;
