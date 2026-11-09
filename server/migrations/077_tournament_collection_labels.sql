-- Tournament collection bonuses now work; drop the "coming later" note from their labels.
UPDATE collections SET bonus_label = '+5% картам Води на турнірі' WHERE code = 'sea_masters';
UPDATE collections SET bonus_label = '+5% картам Вогню на турнірі' WHERE code = 'horde';
UPDATE collections SET bonus_label = '+5% картам Повітря на турнірі' WHERE code = 'sky_heroes';
UPDATE collections SET bonus_label = '+5% картам Землі на турнірі' WHERE code = 'forest_dwellers';
UPDATE collections SET bonus_label = 'Посилення на турнірі ефективніше на 5%' WHERE code = 'ugiants';
UPDATE collections SET bonus_label = '+5% здоров''я на турнірі; у війнах гільдій — коли з’явиться ця механіка' WHERE code = 'wizards';
