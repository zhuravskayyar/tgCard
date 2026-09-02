ALTER TABLE collections
  DROP CONSTRAINT collections_buff_type_check;

ALTER TABLE collections
  ADD CONSTRAINT collections_buff_type_check CHECK (buff_type IN (
    'battle_damage_pct',
    'battle_hp_pct',
    'element_damage_pct',
    'silver_reward_pct',
    'experience_reward_pct',
    'absorption_efficiency_pct',
    'deck_power_pct',
    'altar_gold_levels'
  ));
