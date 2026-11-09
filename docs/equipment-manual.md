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

## Cardastika names

The source manual only defines the mechanics. In-game names are our own:
Каптур, Накидка, Рукавиці, Чоботи; Жало заклинателя (damage), Заслін обітниці (reduction),
Відлунне скло (reduction and reflection), Оберіг другого подиху (revive), Лиха мотанка (curse);
sets Єдиний гарт (same rarity, +25%) and Коло чотирьох стихій (four elements, bonus on all cards).

## Правила з довідника (застосовано 2026-11-09)

- Артефакти працюють лише на арені, у турнірі та у війні гільдій (війни поки немає). У дуелях, кампанії й рейдах діють тільки речі.
- Ответний удар на арені рахується без списа і щита.
- Амулет і мотанка спрацьовують після будь-якої смерті в бою, також від ответного удару чи прокляття. Амулет іде першим, мотанка — при наступній смерті.
- На арені всі бачать артефакти учасників і їхню рідкість.
- Склад: до 888 речей і 888 артефактів, надягнуті не рахуються. Скрині й магазин арени не продають, коли склад повний; нагороди можуть перевищити ліміт.
- Кузня переплавляє речі лише одного типу (стихії можна змішувати); артефакти різних видів змішувати можна.
- Швидка кузня (`POST /api/player/equipment/quick-forge`, `{ batches: [{ itemId, count }] }`): однакові предмети (тип, рідкість, для речей — стихія) переплавляються цілими наборами, результат 100%, ціна = наборів × ціна рецепта. Вкладка з'являється, коли є хоч один повний набір.
- Ательє (`POST /api/player/equipment/atelier`, `{ itemId, element }`): легендарна чи міфічна річ змінює стихію за 50 000 золота і 1 000 / 3 000 загальних осколків (легендарна / міфічна). Осколки замінюють «джерела» референсу, яких у нас немає; ціни в `EQUIPMENT_ATELIER_COSTS`. Якщо змінюється остання надягнута копія, слот лишається надягнутим. Вкладка видна лише власникам таких речей.

Промпти для нових малюнків: `docs/equipment-art-prompts.md`.

## Forge

`POST /api/player/equipment/forge` with `itemIds` spends the materials and gold in one transaction.
Materials share rarity and category. The equipped copy of an item is never spent.

## Sources

- Equipment chests in the shop (`/api/shop/equipment-chests`): silver for one random item of a fixed rarity. Prices live in `server/src/equipment/equipmentChestService.ts`.
- Treasure map: thresholds 100, 200 and 300 give one common, uncommon and rare item. Daily tasks feed the map with diamonds.
- Arena shop.
