UPDATE collections
SET bonus_label = '+5% здоров''я на турнірі й у війнах гільдій'
WHERE code = 'wizards';

UPDATE collections
SET bonus_label = 'Усю зиму: святковий профіль, святкове оформлення в чаті й на форумі, сила карти зимового посилення +20%'
WHERE code = 'winter_reinforcement';

UPDATE collections
SET bonus_label = 'Кожна завершена колекція сузір''я підсилює карти своєї стихії на турнірі й у війні гільдій: 1/2/3/4 сузір''я дають +5%/+7,5%/+10%/+10%; усі 4 охоплюють карти всіх стихій'
WHERE code IN ('zodiac_air', 'zodiac_earth', 'zodiac_fire', 'zodiac_water');

UPDATE collections
SET bonus_label = 'Подвоює ефект артефакту «Лиха мотанка»'
WHERE code = 'voodoo_cult';

UPDATE collections
SET bonus_label = 'Артефакт «Жало заклинателя» сильніший на 33%'
WHERE code = 'sacred_shores';

UPDATE collections
SET bonus_label = 'Артефакт «Заслін обітниці» сильніший на 33%'
WHERE code = 'great_path';

UPDATE collections
SET bonus_label = 'Артефакт «Відлунне скло» сильніше на 33%'
WHERE code = 'thirtieth';

UPDATE collections
SET bonus_label = 'Артефакт «Лиха мотанка» сильніший на 33%'
WHERE code = 'western_wastes';

UPDATE collections
SET bonus_label = 'Артефакт «Оберіг другого подиху» сильніший на 33%'
WHERE code = 'gorgeous_cats';

UPDATE collections
SET bonus_label = 'Артефакт «Алебарда» сильніший на 33%'
WHERE code IN ('breach_wedge', 'mirror_fragments');

UPDATE collections
SET bonus_label = 'Множники критичного удару в атаці й відповіді +0,1'
WHERE code = 'legion_of_flame';

UPDATE collections
SET bonus_label = 'Множники слабкого удару в атаці й відповіді +0,1'
WHERE code = 'breath_of_storm';

UPDATE collections
SET bonus_label = 'Множник звичайного удару в атаці +0,1'
WHERE code = 'deep_engines';

UPDATE collections
SET bonus_label = 'Множник звичайного удару у відповідь +0,1'
WHERE code = 'titans_of_forge';
