ALTER TABLE collections
  DROP CONSTRAINT IF EXISTS collections_buff_type_check;

ALTER TABLE collections
  ADD CONSTRAINT collections_buff_type_check CHECK (buff_type IN (
    'none',
    'battle_damage_pct',
    'battle_hp_pct',
    'element_damage_pct',
    'silver_reward_pct',
    'experience_reward_pct',
    'absorption_efficiency_pct',
    'deck_power_pct',
    'altar_gold_levels'
  ));

ALTER TABLE collections
  DROP CONSTRAINT IF EXISTS collections_buff_value_check;

ALTER TABLE collections
  ADD CONSTRAINT collections_buff_value_non_negative_check CHECK (buff_value >= 0);
