-- «Свята»: the shop's holiday section (reference elem.mobi /forum/3/230814/, /forum/3/231069/).
-- Each holiday recurs every year between two calendar days (UTC, end day inclusive) and sells
-- its own bundles of cards from named collections. Limits count per yearly occurrence.

CREATE TABLE shop_holidays (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL,
  start_month SMALLINT NOT NULL CHECK (start_month BETWEEN 1 AND 12),
  start_day SMALLINT NOT NULL CHECK (start_day BETWEEN 1 AND 31),
  end_month SMALLINT NOT NULL CHECK (end_month BETWEEN 1 AND 12),
  end_day SMALLINT NOT NULL CHECK (end_day BETWEEN 1 AND 31),
  position INTEGER NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE shop_holiday_bundles (
  id TEXT PRIMARY KEY,
  holiday_id TEXT NOT NULL REFERENCES shop_holidays(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  -- collections.code; checked at purchase time because collections are seeded separately.
  collection_code TEXT NOT NULL,
  card_count SMALLINT NOT NULL CHECK (card_count > 0),
  rarity TEXT NOT NULL CHECK (rarity IN ('common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic')),
  currency TEXT NOT NULL CHECK (currency IN ('silver', 'gold')),
  price INTEGER NOT NULL CHECK (price > 0),
  purchase_limit SMALLINT NOT NULL CHECK (purchase_limit > 0),
  position INTEGER NOT NULL
);

CREATE INDEX shop_holiday_bundles_holiday_idx ON shop_holiday_bundles (holiday_id, position);

CREATE TABLE player_holiday_bundle_purchases (
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  bundle_id TEXT NOT NULL REFERENCES shop_holiday_bundles(id) ON DELETE CASCADE,
  -- First day of the yearly occurrence the purchases belong to.
  window_start DATE NOT NULL,
  purchase_count INTEGER NOT NULL CHECK (purchase_count > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, bundle_id, window_start)
);

INSERT INTO shop_holidays (id, display_name, description, start_month, start_day, end_month, end_day, position) VALUES
  ('winter_feast', 'Зимові свята', 'Зимова рать і Скажена четвірка виходять на святковий ярмарок.', 12, 20, 1, 14, 1),
  ('lovers_day', 'День закоханих', 'Чаклунки й улюбленці Шуліки дарують свої карти.', 2, 12, 2, 16, 2),
  ('spring_awakening', 'Весняне пробудження', 'Змії прокидаються, а з ними — їхні друзі й приборкувачки.', 3, 1, 3, 10, 3),
  ('may_fair', 'Травневий ярмарок', 'Ватажки Шуліки й шукачі скарбів торгують здобиччю.', 5, 1, 5, 10, 4),
  ('independence_day', 'День Незалежності', 'Гноми на війні й на відпочинку святкують разом.', 8, 22, 8, 26, 5),
  ('night_of_fears', 'Ніч страхів', 'Культ мотанки й Старий заклик виходять із тіні.', 10, 28, 11, 2, 6);

INSERT INTO shop_holiday_bundles (id, holiday_id, display_name, collection_code, card_count, rarity, currency, price, purchase_limit, position) VALUES
  ('winter_feast_host', 'winter_feast', 'Уся Зимова рать', 'winter_reinforcement', 7, 'epic', 'gold', 250, 1, 1),
  ('winter_feast_berserk', 'winter_feast', 'Карта Скаженої четвірки', 'berserks', 1, 'legendary', 'gold', 120, 3, 2),
  ('lovers_day_sorceresses', 'lovers_day', 'Усі Чотири чаклунки', 'sorceresses', 4, 'epic', 'gold', 150, 1, 1),
  ('lovers_day_favorite', 'lovers_day', 'Карта Шулікових улюбленців', 'ufavorites', 1, 'legendary', 'gold', 120, 3, 2),
  ('spring_awakening_fans', 'spring_awakening', 'Усі Друзі дракона', 'dragon_fans', 4, 'epic', 'gold', 150, 1, 1),
  ('spring_awakening_whisperer', 'spring_awakening', 'Карта Приборкувачок змія', 'dragon_whisperers', 1, 'legendary', 'gold', 120, 3, 2),
  ('may_fair_generals', 'may_fair', 'Усі Шулікові ватажки', 'ugenerals', 4, 'epic', 'gold', 150, 1, 1),
  ('may_fair_hunter', 'may_fair', 'Карта Шукачів скарбів', 'treasure_hunters', 1, 'legendary', 'gold', 120, 3, 2),
  ('independence_day_war', 'independence_day', 'Усі Гноми на війні', 'dwarves_war', 4, 'epic', 'gold', 150, 1, 1),
  ('independence_day_peace', 'independence_day', 'Карта Гномів на відпочинку', 'dwarves_peace', 1, 'legendary', 'gold', 120, 3, 2),
  ('night_of_fears_cult', 'night_of_fears', 'Увесь Культ мотанки', 'voodoo_cult', 4, 'epic', 'gold', 150, 1, 1),
  ('night_of_fears_order', 'night_of_fears', 'Карта Старого заклику', 'ancient_order', 1, 'legendary', 'gold', 120, 3, 2);
