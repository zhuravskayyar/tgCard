ALTER TABLE players
  ADD COLUMN duel_remaining INTEGER NOT NULL DEFAULT 10 CHECK (duel_remaining BETWEEN 0 AND 10),
  ADD COLUMN duel_refill_at TIMESTAMPTZ,
  ADD CONSTRAINT players_duel_refill_check CHECK ((duel_remaining = 0) = (duel_refill_at IS NOT NULL));

ALTER TABLE collections DROP CONSTRAINT IF EXISTS collections_buff_type_check;
ALTER TABLE collections ADD CONSTRAINT collections_buff_type_check CHECK (buff_type IN (
  'none', 'battle_damage_pct', 'battle_hp_pct', 'element_damage_pct',
  'silver_reward_pct', 'experience_reward_pct', 'absorption_efficiency_pct',
  'deck_power_pct', 'altar_gold_levels', 'duel_cooldown_minutes'
));

UPDATE collections
SET buff_type = 'duel_cooldown_minutes', buff_value = 30,
    buff_scope = 'duel', bonus_label = '−30 хв перерви в дуелях'
WHERE code = 'highelem';
