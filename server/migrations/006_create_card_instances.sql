CREATE TABLE player_card_instances (
  id UUID PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE RESTRICT,
  level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 180),
  bonus_power INTEGER NOT NULL CHECK (bonus_power >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX player_card_instances_player_id_idx
  ON player_card_instances (player_id, id);
CREATE INDEX player_card_instances_card_id_idx
  ON player_card_instances (card_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM player_cards
    INNER JOIN cards ON cards.id = player_cards.card_id
    WHERE cards.power < 10
  ) THEN
    RAISE EXCEPTION 'Cannot preserve legacy card power below the level-1 base power';
  END IF;
END
$$;

INSERT INTO player_card_instances (id, player_id, card_id, level, bonus_power, created_at)
SELECT
  gen_random_uuid(),
  player_cards.player_id,
  player_cards.card_id,
  1,
  CASE
    WHEN cards.code = ANY(ARRAY[
      'starter_01', 'starter_02', 'starter_03', 'starter_04', 'starter_05',
      'starter_06', 'starter_07', 'starter_08', 'starter_09'
    ]::text[]) THEN 2
    ELSE cards.power - 10
  END,
  NOW()
FROM player_cards
INNER JOIN cards ON cards.id = player_cards.card_id
CROSS JOIN LATERAL generate_series(1, player_cards.quantity) AS copies(copy_number)
ORDER BY player_cards.player_id, player_cards.card_id, copies.copy_number;

DO $$
DECLARE
  legacy_copy_count BIGINT;
  instance_count BIGINT;
BEGIN
  SELECT COALESCE(SUM(quantity), 0) INTO legacy_copy_count FROM player_cards;
  SELECT COUNT(*) INTO instance_count FROM player_card_instances;
  IF legacy_copy_count <> instance_count THEN
    RAISE EXCEPTION 'Ownership migration mismatch: legacy %, instances %',
      legacy_copy_count, instance_count;
  END IF;
END
$$;

ALTER TABLE deck_slots ADD COLUMN card_instance_id UUID;

WITH ranked_slots AS (
  SELECT
    deck_slots.deck_id,
    deck_slots.slot,
    player_decks.player_id,
    deck_slots.card_id,
    ROW_NUMBER() OVER (
      PARTITION BY deck_slots.deck_id, deck_slots.card_id
      ORDER BY deck_slots.slot
    ) AS copy_number
  FROM deck_slots
  INNER JOIN player_decks ON player_decks.id = deck_slots.deck_id
),
ranked_instances AS (
  SELECT
    id,
    player_id,
    card_id,
    ROW_NUMBER() OVER (
      PARTITION BY player_id, card_id
      ORDER BY created_at, id
    ) AS copy_number
  FROM player_card_instances
)
UPDATE deck_slots
SET card_instance_id = ranked_instances.id
FROM ranked_slots
INNER JOIN ranked_instances
  ON ranked_instances.player_id = ranked_slots.player_id
  AND ranked_instances.card_id = ranked_slots.card_id
  AND ranked_instances.copy_number = ranked_slots.copy_number
WHERE deck_slots.deck_id = ranked_slots.deck_id
  AND deck_slots.slot = ranked_slots.slot;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM deck_slots WHERE card_instance_id IS NULL) THEN
    RAISE EXCEPTION 'At least one deck slot could not be mapped to an owned card instance';
  END IF;
END
$$;

ALTER TABLE deck_slots
  ALTER COLUMN card_instance_id SET NOT NULL,
  ADD CONSTRAINT deck_slots_card_instance_id_fkey
    FOREIGN KEY (card_instance_id) REFERENCES player_card_instances(id) ON DELETE RESTRICT,
  ADD CONSTRAINT deck_slots_unique_instance UNIQUE (deck_id, card_instance_id);

DROP INDEX deck_slots_card_id_idx;
ALTER TABLE deck_slots DROP COLUMN card_id;
CREATE INDEX deck_slots_card_instance_id_idx ON deck_slots (card_instance_id);

CREATE TABLE shop_card_pools (
  card_id TEXT PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
  target_rarity TEXT NOT NULL CHECK (
    target_rarity IN ('common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic')
  )
);

INSERT INTO shop_card_pools (card_id, target_rarity)
SELECT id, rarity
FROM cards
WHERE shop_eligible = TRUE;

DROP TABLE player_cards;

ALTER TABLE cards
  DROP COLUMN rarity,
  DROP COLUMN power,
  DROP COLUMN shop_eligible;
