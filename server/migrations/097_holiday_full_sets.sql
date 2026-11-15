-- «Свята»: a full-collection offer for each of the six «random legendary» holiday collections.
-- A full set grants only the cards the player has not discovered yet, so its price is computed per
-- player on the server (per-card ladder of `docs/collection-packs.md`); `price` here is the price of
-- the whole collection, the cap. `rarity` is the collection's own minimum rarity: each card is created
-- at the level range of its rarity, not at legendary level.

ALTER TABLE shop_holiday_bundles ADD COLUMN IF NOT EXISTS full_set BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO shop_holiday_bundles (id, holiday_id, display_name, collection_code, card_count, rarity, currency, price, purchase_limit, position, full_set) VALUES
  ('winter_feast_berserks_set', 'winter_feast', 'Уся Скажена четвірка', 'berserks', 4, 'rare', 'gold', 100, 1, 3, TRUE),
  ('lovers_day_favorites_set', 'lovers_day', 'Усі Шулікові улюбленці', 'ufavorites', 4, 'rare', 'gold', 100, 1, 3, TRUE),
  ('spring_awakening_whisperers_set', 'spring_awakening', 'Усі Приборкувачки змія', 'dragon_whisperers', 4, 'rare', 'gold', 100, 1, 3, TRUE),
  ('may_fair_hunters_set', 'may_fair', 'Усі Шукачі скарбів', 'treasure_hunters', 4, 'rare', 'gold', 100, 1, 3, TRUE),
  ('independence_day_peace_set', 'independence_day', 'Усі Гноми на відпочинку', 'dwarves_peace', 4, 'rare', 'gold', 100, 1, 3, TRUE),
  ('night_of_fears_order_set', 'night_of_fears', 'Увесь Старий заклик', 'ancient_order', 6, 'epic', 'gold', 230, 1, 3, TRUE)
ON CONFLICT (id) DO NOTHING;
