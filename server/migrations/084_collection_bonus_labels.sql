-- Collection bonuses that now work: «Вибір …» strengthen equipment, «Весняний цвіт» and «Старі вояки»
-- add guild XP, «Гноми на відпочинку» halve the witches' curse. The effects are keyed by collection
-- code in game-core and the guild services; only the labels change here.
UPDATE collections SET bonus_label = '+10% гільдійського досвіду'
WHERE code IN ('spring_bloom', 'old_soldiers');

UPDATE collections SET bonus_label = 'Спорядження Вогню сильніше на 25%' WHERE code = 'choiceof_fire';
UPDATE collections SET bonus_label = 'Спорядження Води сильніше на 25%' WHERE code = 'choiceof_water';
UPDATE collections SET bonus_label = 'Спорядження Землі сильніше на 25%' WHERE code = 'choiceof_earth';
UPDATE collections SET bonus_label = 'Спорядження Повітря сильніше на 25%' WHERE code = 'choiceof_air';

UPDATE collections
SET bonus_label = 'Удвічі менша шкода від «Прокляття чаклунок»; удвічі швидше копання скарбу в Печерах — коли з’явиться ця механіка'
WHERE code = 'dwarves_peace';
