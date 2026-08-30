# Equipment manual parser

The parser in `game-core/src/equipmentManual.ts` reads the visible text of the
public [equipment manual](https://elem.mobi/forum/3/294767/#23854893). The
source is a legacy forum page without semantic HTML tables, so parsing is based
on the rendered text and rarity labels rather than CSS classes or image order.

It extracts:

- the 9 equipment types, split into 4 things and 5 artifacts;
- the 888-item storage limits;
- thing power bonuses for all six rarities;
- the `Единая редкость` and `Школа всех стихий` set rules;
- all five artifact effects, including both columns of `Зеркало магии`;
- the five Forge recipes and gold costs;
- acquisition and artifact battle-mode links when HTML is available.

The server exposes the parsed result through `GET /api/equipment/manual`.
Responses are cached for 15 minutes. A source or parser failure returns a
structured `503` response; the external manual is reference data and never
becomes an authority for player state, inventory, currency, or battle results.

## Реалізована модель спорядження

`game-core/src/equipment.ts` містить канонічну модель предметів:

- 4 типи речей × 4 стихії × 6 рідкостей; бонус речі: `25 / 50 / 100 / 200 / 400 / 1000` сили;
- 5 артефактів: Коп'є мага, Щит мага, Дзеркало магії, Амулет життя та Кукла Вуду;
- «Єдина рідкість»: чотири речі однієї рідкості дають `+25%` до кожної;
- «Школа всіх стихій»: чотири речі різних стихій підсилюють усі стихії; обидва набори працюють разом;
- кузня: `4/5/6/7/8` предметів і `5/50/500/5000/50000` золота для переходу на наступну рідкість.

Інвентар зберігається сервером у `player_equipment_inventory`, а екіпірування приймається лише для предметів, якими володіє гравець.
