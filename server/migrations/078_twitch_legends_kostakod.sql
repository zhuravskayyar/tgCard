INSERT INTO collections (
  id,
  code,
  display_name,
  cover_art_key,
  buff_type,
  buff_value,
  buff_element,
  buff_scope,
  bonus_label,
  position,
  source
)
VALUES (
  'collection_twitch_legends',
  'twitch_legends',
  'Легенди Twitch',
  NULL,
  'none',
  1,
  NULL,
  'all_battles',
  'Бонус колекції визначимо після її розширення',
  51,
  'standard'
)
ON CONFLICT (id) DO UPDATE SET
  code = EXCLUDED.code,
  display_name = EXCLUDED.display_name,
  cover_art_key = EXCLUDED.cover_art_key,
  buff_type = EXCLUDED.buff_type,
  buff_value = EXCLUDED.buff_value,
  buff_element = EXCLUDED.buff_element,
  buff_scope = EXCLUDED.buff_scope,
  bonus_label = EXCLUDED.bonus_label,
  position = EXCLUDED.position,
  source = EXCLUDED.source;

INSERT INTO cards (
  id,
  code,
  display_name,
  art_key,
  element,
  collection_id,
  min_rarity,
  shop_eligible,
  description,
  limited,
  source
)
VALUES (
  'kostakod',
  'kostakod',
  'Костакод',
  NULL,
  'earth',
  'collection_twitch_legends',
  'legendary',
  TRUE,
  'Коріння схоплює матеріал швидше за учнів.',
  FALSE,
  'standard'
)
ON CONFLICT (id) DO UPDATE SET
  code = EXCLUDED.code,
  display_name = EXCLUDED.display_name,
  art_key = EXCLUDED.art_key,
  element = EXCLUDED.element,
  collection_id = EXCLUDED.collection_id,
  min_rarity = EXCLUDED.min_rarity,
  shop_eligible = EXCLUDED.shop_eligible,
  description = EXCLUDED.description,
  limited = EXCLUDED.limited,
  source = EXCLUDED.source;

INSERT INTO collection_cards (collection_id, card_id, position)
VALUES ('collection_twitch_legends', 'kostakod', 1)
ON CONFLICT (collection_id, card_id) DO UPDATE SET position = EXCLUDED.position;
