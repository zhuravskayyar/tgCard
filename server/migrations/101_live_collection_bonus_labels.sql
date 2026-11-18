UPDATE collections
SET bonus_label = 'Удвічі більша денна норма алмазів на Навалі'
WHERE code = 'treasure_hunters';

UPDATE collections
SET bonus_label = 'Подвоює шкоду «Полум''я дракона»'
WHERE code = 'dragon_whisperers';

UPDATE collections
SET bonus_label = 'Майстерність дракона +10'
WHERE code IN ('dragon_fans', 'magic_1', 'magic_heal');
