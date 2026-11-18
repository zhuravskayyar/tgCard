# Колекції тижня: пачки колекцій у магазині

Стан на 2026-11-15. Рішення власника: близько десяти пачок колекцій, щотижня в магазині крутяться
**дві** не святкові пропозиції, частину карт продаємо «пачками».

## Навіщо

25 з 51 колекції не мали жодного гравецького джерела (76 видів карт), тож їх не можна було зібрати.
Звичайні банери магазину беруть карти лише з 81 `shop_eligible` карти. Тут продаємо карти за колекціями,
**не чіпаючи `cards.shop_eligible`** (інакше вони потрапили б у дропи босів, бойову перепустку й скрині).

## Ротація

`game-core/src/collectionPacks.ts` — чиста функція `getCollectionPackRotation(date)`:

- тиждень починається в понеділок 00:00 UTC (опора — 1970-01-05, понеділок);
- активні дві різні пачки: `COLLECTION_PACK_IDS[(2·тиждень) mod 10]` і наступна; повний круг усіх 10 пачок — 5 тижнів;
- повертає `packIds`, `startsAt`, `endsAt` (виключно, наступний понеділок) і `weekKey` (YYYY-MM-DD, ключ ліміту);
- порядок пачок у `COLLECTION_PACK_IDS` і є порядком ротації.

Тести: `collectionPacks.test.ts` (межа неділя 23:59:59.999 / понеділок 00:00, цикл 5 тижнів, дати до опорного тижня).

### Розклад

`getCollectionPackSchedule(now, rotation?)` (чиста, у тому ж файлі): `nextWeekPackIds` — пачки наступного тижня (ротація на `now + 7 діб`) і `returnsInWeeks[id]` — для кожної активної пачки скільки тижнів до її повернення
(скан уперед по ротації, не більше довжини циклу). Для повного круга з 10 пачок по 2 на тиждень це завжди 5. Сервер кладе в відповідь `nextWeekPackNames` (назви з конфігу,
невідомі id відкидаються) і `returnsInWeeks` на кожну пачку. Клієнт: один рядок «Наступного тижня: …» під таймером і один рядок «Повернеться через N тижнів» над пропозиціями слайда.

## Пропозиції

1. **Повна колекція** — усі карти ОДНІЄЇ колекції пачки (для пачок із кількома колекціями — окрема пропозиція на кожну).
   Кожна карта створюється з рівнем з таблиці магазину для її `min_rarity` (`SHOP_LEVEL_RANGES`: звичайна 5–9,
   рідкісна 10–19, епічна 20–34, легендарна 35–59). Ліміт: **1 раз на колекцію за тиждень ротації**. Це гарантований спосіб добрати колекцію.
   **Докупити відсутні.** Якщо гравець уже відкрив частину карт колекції, ця ж пропозиція стає «Докупити відсутні (N)»: видає лише невідкриті карти, ціна рахується
   за відсутніми (див. «Ціна докупівлі»). Усі карти відкрито — пропозиція «Зібрано» і вимкнена. Ліміт той самий: 1 раз на колекцію за тиждень (докупівля теж рахується).
   Кожна пропозиція показує бонус завершеної колекції («Бонус: …») — це `collections.bonus_label`, той самий текст, що на екрані колекцій.
2. **Випадкова карта** — одна випадкова карта пачки (унікальна за id серед усіх колекцій пачки). Спершу карти,
   яких гравець ще не відкрив (`player_card_discoveries`); коли відкрито все — будь-яка. Без ліміту.

Лише золото. Назви й короткі описи пачок також живуть у `server/src/shop/collectionPackConfig.ts`;
сервер віддає їх разом із розкладом. Ціни зберігаються там само, це єдине місце для їх зміни.

## Ціни

Основа — святкова драбина: 4 епічні = 150 (по 37,5), 7 епічних = 250, одна випадкова легендарна = 120.
Решта ступенів — **наше припущення** (в довіднику цін таких карт немає):

| Рідкість карти | Ціна за карту в повній колекції |
|---|---|
| звичайна (`uncommon`) | 15 |
| рідкісна (`rare`) | 25 |
| епічна (`epic`) | 37,5 (святкова драбина) |
| легендарна (`legendary`) | 120 (як святкова випадкова легендарна) |

Ціна повної колекції = сума по картах, округлена до 5 (понад 100 — до 10). Випадкова карта завжди дорожча
за карту з повної колекції тієї ж рідкості (≈ ×1,3), щоб пачка лишалась вигіднішою; її ціна — за типовою рідкістю
пачки (для «Шулікових велетнів» трохи вища, бо серед чотирьох карт є легендарна). Тест
`collectionPackConfig.test.ts` перевіряє, що ціни лишаються біля драбини.

| № | Пачка (`id`) | Колекції (коди) | Карт | Рідкість | Повна колекція | Випадкова карта |
|---|---|---|---|---|---|---|
| 1 | Шулікові виродки (`umutants`) | `umutants` | 4 | 4 звичайні | 60 | 20 |
| 2 | Шулікові велетні (`ugiants`) | `ugiants` | 4 | 3 епічні + 1 легендарна | 230 | 60 |
| 3 | Шулікова зграя (`usoldiers`) | `usoldiers` | 8 | 8 звичайних | 120 | 20 |
| 4 | Алмазна артіль (`diamond_brotherhood`) | `diamond_brotherhood` | 4 | 4 епічні | 150 | 50 |
| 5 | Зодіак (`zodiac`) | `zodiac_air`, `zodiac_earth`, `zodiac_fire`, `zodiac_water` | 3 + 3 + 3 + 3 | 12 епічних | 110 за кожну | 50 |
| 6 | Береги й Шлях (`shores_path`) | `sacred_shores`, `great_path` | 4 + 4 | 8 епічних | 150 за кожну | 50 |
| 7 | За горами й Прерії (`thirtieth_west`) | `thirtieth`, `western_wastes` | 4 + 4 | 8 епічних | 150 за кожну | 50 |
| 8 | Жар і Шторм (`flame_storm`) | `legion_of_flame`, `breath_of_storm` | 4 + 4 (7 різних) | 7 епічних | 150 за кожну | 50 |
| 9 | Глибини й Ковадло (`engines_forge`) | `deep_engines`, `titans_of_forge` | 4 + 4 (7 різних) | 7 епічних | 150 за кожну | 50 |
| 10 | Брама й Люстро (`breach_mirror`) | `breach_wedge`, `mirror_fragments` | 4 + 4 | 8 рідкісних | 100 за кожну | 30 |

Карти пачок 5–9 частково входять і в інші колекції (`gorgeous_cats`, `choiceof_*`; у пачках 8 і 9 `incendium`,
`aerum` — у обох колекціях, `maridel` і `terraxis` — між пачками). Так задумано: покупка відкриває карту
для всіх колекцій, де вона є, а випадковий пул пачки береться без дублікатів.

## Ціна докупівлі

`priceMissingCollectionCards` у `game-core/src/collectionPacks.ts` (драбина `COLLECTION_CARD_GOLD_PRICE` теж там, конфіг пачок її реекспортує):
сума цін драбини за `min_rarity` кожної відсутньої карти, округлення правилом наборів (до 5 золотих, понад 100 — до 10), але **не більше ціни повного набору**.
Нічого не відкрито — ціна повного набору з конфігу без перерахунку. Тест `collectionPackConfig.test.ts` перевіряє, що драбина на повному складі збігається з кожною `setPrices`.

| Відсутні з 4 епічних | Ціна |
|---|---|
| 1 (37,5) | 40 |
| 2 (75) | 75 |
| 3 (112,5) | 110 |
| 4 (150) | 150 (повний набір) |

Ціну рахує сервер у транзакції після блокування рядка гравця, клієнт шле `expectedPrice` разом з `offerId`; якщо вона не збігається — `409 price_changed`,
і клієнт перезавантажує каталог. Повністю зібрана колекція: `409 collection_complete`. Каталог для зібраної колекції віддає ціну повного набору (щоб поле лишалось додатним).

## Що не продаємо

- `magic_1`, `magic_heal` — магія дракона, зарезервована.
- Усі колекції святкових наборів (`winter_reinforcement`, `berserks`, `sorceresses`, `ufavorites`, `dragon_fans`,
  `dragon_whisperers`, `ugenerals`, `treasure_hunters`, `dwarves_war`, `dwarves_peace`, `voodoo_cult`, `ancient_order`).
- Колекції 81 карти зі `shop_eligible`.

Перевірка резервів перед кодом: коди десяти пачок і id їхніх карт шукали в `server/src` та `game-core/src`
(`raidCardService`, `tournamentService`, `campaignLocations`, `dragonRaid`, `guildRaid`). Жодна колекція не є
джерелом нагороди. Згадки в `082`, `077`/`tournamentPvp.ts`, `085` — це лише бонуси завершеної колекції
(`umutants` — золото дуелей, `ugiants` — +5 % на турнірі, `usoldiers` — безкоштовна щоденна карта), а `sandstorm`,
`forest_bride`, `basaltor` у `campaignLocations` — портрети дарувальників/босів, а не нагорода. Тому випало 0 колекцій.

## Сервер

- Міграція `096_collection_packs.sql`: `player_collection_pack_purchases (player_id, collection_code, week_start, purchase_count)`.
  Таблиця святкових покупок не підходить: її `bundle_id` — зовнішній ключ на `shop_holiday_bundles`.
  Лічильник потрібен лише для повної колекції.
- `server/src/shop/collectionPackService.ts` — копія шляху святкового магазину: одна транзакція — блокування рядка
  гравця, перевірка золота, лічильник ліміту (`INSERT … ON CONFLICT … WHERE purchase_count < ліміт`), вибір карт із
  `FOR SHARE`, списання, створення карт, запис відкриття, перерахунок колоди. Будь-яка помилка — `ROLLBACK`.
  Тиждень береться з серверного часу всередині покупки.
- Повну колекцію не продаємо частково: якщо будь-яка карта колекції не `standard` або `limited`, відповідь `bundle_unavailable`.
- Ідентифікатори пропозицій: `set:<код колекції>` і `random:<id пачки>`.
- Маршрути: `GET /api/shop/collection-packs`, `POST /api/shop/collection-packs/purchase { offerId }`
  (`collectionPackRoute.ts`, також у списку маршрутів `server/src/index.ts`).
- Коди помилок: `pack_not_active`, `pack_limit_reached`, `insufficient_gold`, `bundle_not_found`, `bundle_unavailable`, `price_changed`, `collection_complete`.
- Запит покупки: `{ offerId, expectedPrice? }`.
- Тести: `collectionPackConfig.test.ts` (конфіг узгоджений із `CATALOG_DATA`), `collectionPackService.integration.test.ts`
  (повна колекція за рівнями своїх рідкостей, ліміт і новий тиждень, неактивна пачка, випадкова з пріоритетом нових і без нових, відкат).

## Клієнт

Розділ «Колекції тижня» у вкладці «Карти стихій» магазину, під «По одній карті»:
`components/CollectionPacksSection.tsx`, `hooks/useCollectionPacks.ts`, `loadCollectionPacks` / `purchaseCollectionPack`
у `telegram/shop.ts`. Показує активні пачки горизонтальним слайдером (див. нижче), ціни, «Куплено: n з n», «Відкрито: n з n» і час до оновлення.
Спрайти — ті самі пачки `ui/shop/stall/pack-noseal-v3.webp` і `pack-seal-v2.webp`, що й у святкових наборах;
`ui/shop/shop_collection_blue.webp` лишається невикористаним.

Спільний `components/SwipeSlider.tsx` використовують і «По одній карті» (3 стандартні набори, щоб колекції тижня були видні на першому екрані 430×800), і «Колекції тижня». Слайдер: одна пачка на слайд (її набори «Повна колекція» і «Випадкова карта» всередині), `scroll-snap-type: x mandatory`,
слайд 86% ширини, тож наступний слайд видно збоку — це головна підказка. Під слайдером крапки сторінок (натискаються,
активна слідує за прокруткою через `onScroll`) і стрілки `AppIcon` `back` / `chevron`. Підказка «Гортай убік · колекцій: n»
та таймер оновлення над слайдером; для однієї пачки слайдерних елементів немає. `prefers-reduced-motion` вимикає плавну прокрутку.

Для окремих банерів пачок (поки замінює спільна пачка) — промпти нижче.

## Промпти банерів пачок (для ChatGPT)

Стиль — як у `docs/card-art-workflow.md`: готичне таро, ксилографія, чорне чорнило й кремовий папір, прозоре тло.
Банер — горизонтальний, 3:1, один виріз на пачку. Файли: `ui/shop/packs/pack-<id>.webp`.
Спільний блок стилю, який додається до кожного промпту:

> Style: dark gothic tarot woodcut, like an old hand-carved medieval block print. Pure black ink only: heavy solid black shapes next to clean empty light areas, rough hand-cut contour lines, bold parallel hatching and crude cross-hatching, slightly grotesque character, large simple forms with few small details, no grey tones, no gradients, no airbrush. Light areas inside the subject are filled with flat warm cream paper colour, so the subject is opaque. Isolated subject on a fully transparent background, PNG with alpha, clean outer silhouette, no letters, no numbers, no text, no logo, no signature, no watermark, nothing touches the canvas edges. All human and humanoid characters are clearly adults, with natural five-digit hands, no extra or fused limbs.

1. `pack-umutants` (Шулікові виродки)
> Generate a new image. A wide 3:1 banner emblem: four mismatched mutant beasts shoulder to shoulder, a winged monkey, a sulking rhinoceros, a snarling giant rat and a grinning crocodile, with a small crooked kite-bird crest above them. [STYLE]

2. `pack-ugiants` (Шулікові велетні)
> Generate a new image. A wide 3:1 banner emblem: a towering giant silhouette made of a coiled sky-serpent, a basilisk and a rising phoenix, with a small crooked kite-bird crest above. Huge, heavy forms. [STYLE]

3. `pack-usoldiers` (Шулікова зграя)
> Generate a new image. A wide 3:1 banner emblem: a rowdy warband of eight, a wolf, a minotaur, a cyclops, a turtle, a snow warrior, a bride of the forest, a sand-storm spirit and a night fury, marching in one tight crowd, with the small kite-bird crest above. [STYLE]

4. `pack-diamond_brotherhood` (Алмазна артіль)
> Generate a new image. A wide 3:1 banner emblem: a stout guild of four gem-cutters standing around one huge faceted diamond, each holding a different tool, pickaxe, chisel, hammer and lantern. [STYLE]

5. `pack-zodiac` (Зодіак)
> Generate a new image. A wide 3:1 banner emblem: a circle of twelve zodiac signs around a small sun, split in four arcs for wind, field, hearth and well, each arc a different tool or sign. [STYLE]

6. `pack-shores_path` (Береги й Шлях)
> Generate a new image. A wide 3:1 banner emblem: on the left the golden shores of the Nile with a scarab, a falcon-headed god and a hippopotamus goddess; on the right the Silk Road with a white tiger, a headless giant and a fox spirit; a winding caravan road joins them. [STYLE]

7. `pack-thirtieth_west` (За горами й Прерії)
> Generate a new image. A wide 3:1 banner emblem: on the left a fairytale kingdom beyond seven mountains with a nightingale, a three-headed dragon and a merman; on the right the wild prairies with a thunderbird, a sasquatch and a fire cow. [STYLE]

8. `pack-flame_storm` (Жар і Шторм)
> Generate a new image. A wide 3:1 banner emblem: a forge-furnace of living flame on the left, a storm cloud with lightning on the right, and a stone-and-wind golem standing between them. [STYLE]

9. `pack-engines_forge` (Глибини й Ковадло)
> Generate a new image. A wide 3:1 banner emblem: the deep engine rooms below the sea on the left, with pipes and a glowing core, and the great titan forge on the right, with an anvil and basalt giants. [STYLE]

10. `pack-breach_mirror` (Брама й Люстро)
> Generate a new image. A wide 3:1 banner emblem: a siege wedge breaking through a broken gate on the left, and a shattered mirror whose shards reflect four sharp faces on the right. [STYLE]

Після того як PNG повернуться: перетворити на `webp`, покласти в `client/public/assets/ui/shop/packs/` і замінити
спільну пачку в `PackOfferPanel` на банер за `pack.id`.

## Анімації магазину

Вкладка «Карти стихій» (слайдер наборів і «Колекції тижня») оживає лише CSS-ом, у `client/src/styles/shop-stall.css` (кінець файлу). Повторно використано: гойдання паку `shop-shelf-sway`, смуги `shop-pack-sheen`, пил `.shop-dust` з `book-theme.css`, патерн `data-ready` з Хранителя дракона.

- Тепле «дихання» світла за паком (`.shop-offer__symbol::before`), колір і сила за рідкістю (`--pack-glow`).
- Повільний відблиск `.shop-pack-glint` (маска силуету паку), раз на ~6 с.
- До 6 порошинок над полицею (`.shop-dust--shelf`), `pointer-events: none`.
- Кнопка купівлі: `data-ready` (вистачає валюти) дає м'який пульс; вимкнена кнопка нерухома.
- Слайдер: активний слайд масштаб 1, сусідні 0.94 і напівпрозорі (`data-active`). Неактивні слайди й слайдер поза екраном ставляться на паузу (`animation-play-state`, IntersectionObserver у `SwipeSlider`).
- Покупка: клас `shop-offer--purchasing` дає струс і спалах до звичайного розкриття нагороди.
- `prefers-reduced-motion`: без гойдання, відблиску, пилу, пульсу й переходів слайдів; лише статичне світло.
Тільки transform/opacity (та filter на кнопці); анімацій filter на артах не додано.

## Печатки паків (2026-11-15)

Кожен тижневий пак має власну сургучну печатку з емблемою: `client/public/assets/ui/shop/stall/seals/pack-seal-<pack.id>.webp`
(560×767, прозорий фон, печатка в тому ж місці й розмірі, що `pack-seal-v2.webp`). Колір воску вже в спрайті, тому клас
`shop-pack-seal--emblem` вимикає рідкісний hue-фільтр. Згенеровано в ChatGPT за шаблоном `pack-seal-v2`:
мутант (мох), змій-велетень (сланець), вовк (іржа), діамант (сапфір), зодіак (індиго), скарабей і лис (вохра),
триголовий змій (бірюза), полум'я й блискавка (жар), шестерня й ковадло (бронза), брама й люстро (срібло).
