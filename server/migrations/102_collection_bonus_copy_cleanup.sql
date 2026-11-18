-- Keep effect copy concise; the API/UI exposes active, partial, pending, and unassigned status separately.
UPDATE collections
SET bonus_label = regexp_replace(
  bonus_label,
  ' \(запрацює разом із цією механікою\)$',
  ''
)
WHERE bonus_label LIKE '% (запрацює разом із цією механікою)';

UPDATE collections
SET bonus_label = '+5% здоров''я на турнірі'
WHERE code = 'wizards';

UPDATE collections
SET bonus_label = 'Удвічі менша шкода від «Прокляття чаклунок»'
WHERE code = 'dwarves_peace';

UPDATE collections
SET bonus_label = 'Не призначений'
WHERE code = 'twitch_legends';
