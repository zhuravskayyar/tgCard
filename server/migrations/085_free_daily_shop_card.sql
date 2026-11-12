-- «Шулікова зграя»: the first card purchase each day is free. Stores the UTC day the free
-- purchase was last used; unused days do not accumulate.
ALTER TABLE players ADD COLUMN IF NOT EXISTS free_shop_purchase_on DATE;

UPDATE collections SET bonus_label = 'Щоденна безкоштовна покупка карти в магазині' WHERE code = 'usoldiers';

-- «Шулікові ватажки»: the game tops up gold and silver treasury contributions by 20%.
UPDATE collections SET bonus_label = 'Гра додає 20% до вашого внеску золота й срібла в скарбницю' WHERE code = 'ugenerals';

-- «Гноми на війні»: the witch raid bonus covers player HP as well as card power.
UPDATE collections SET bonus_label = '+10% сили бойової колоди й здоров''я у битвах із чаклунками' WHERE code = 'dwarves_war';
