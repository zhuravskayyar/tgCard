-- Duel gold as in the reference manual: random drops (by the 5th Duel after the last one),
-- and the dragon / mutant collections that raise the daily limit or the size of a drop.
ALTER TABLE players
  ADD COLUMN duel_gold_streak INTEGER NOT NULL DEFAULT 0 CHECK (duel_gold_streak >= 0);

ALTER TABLE collections DROP CONSTRAINT IF EXISTS collections_buff_type_check;
ALTER TABLE collections ADD CONSTRAINT collections_buff_type_check CHECK (buff_type IN (
  'none', 'battle_damage_pct', 'battle_hp_pct', 'element_damage_pct',
  'silver_reward_pct', 'experience_reward_pct', 'absorption_efficiency_pct',
  'deck_power_pct', 'altar_gold_levels', 'duel_cooldown_minutes',
  'duel_gold_limit', 'duel_gold_share_pct'
));

UPDATE collections
SET buff_type = 'duel_gold_limit', buff_value = 5, buff_scope = 'duel',
    bonus_label = '+5 щоденного золота в дуелях'
WHERE code = 'dragons';

UPDATE collections
SET buff_type = 'duel_gold_limit', buff_value = 10, buff_scope = 'duel',
    bonus_label = '+10 щоденного золота в дуелях (внесок у скарбницю 5 → 10 запрацює пізніше)'
WHERE code = 'dragons2';

UPDATE collections
SET buff_type = 'duel_gold_share_pct', buff_value = 10, buff_scope = 'duel',
    bonus_label = 'Пришвидшує золото в дуелях: близько 10% денного ліміту за перемогу'
WHERE code = 'umutants';
