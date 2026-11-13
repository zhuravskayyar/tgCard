# Guild MVP Cardastika

## Social guild loop

The guild profile now exposes a PostgreSQL-backed dashboard: weekly mission, daily and weekly XP totals, active-member count, current announcement, next level reward hint, and a compact journal of membership and XP events. The interface renders server state rather than placeholder economy values.

Guild officers and the leader can edit a 280-character announcement. Activity recording remains idempotent and writes each accepted XP contribution to the journal.

The first guild forum vertical slice is live on migration `039_guild_social.sql`: public `Гостьова зала`, member-only `Внутрішня зала`, paginated topics and posts, unread markers, read receipts, topic creation, replies, and leader/officer moderation state.

The local dev seed includes one announcement, two forum topics, small real XP contributions, starter card instances, and a selected Guild Card so the loop is visible immediately. The guild altar, Witch raid battle, and persistent victory/result screens are backed by authoritative state; treasury, alliance, and achievements remain future work.

Статус: локально реалізовано та підключено до PostgreSQL. Форум і рейд-чат свідомо залишені окремими соціальними зрізами; рейдовий чат поки має локальний composer без persistence.

## Канон і баланс

Усі балансні значення живуть у `shared/src/guild.ts` у `GUILD_CONFIG`; БД зберігає стан і дані, але не баланс.

- Розблокування: рівень гравця 10.
- Створення: 10 000 срібла; гравець не може бути учасником іншої гільдії.
- Рівні гільдії: 1–20; на старті кожен рівень має 30 місць, тому майбутнє збільшення ліміту не потребує зміни схеми.
- Guild XP не списується після виходу учасника. За довідником (`docs/reference-elem-guild.md`) у гільдію йде весь досвід, який гравець отримав: дуелі (перемога й поразка), боси кампанії (перемога й поразка) і турнір. Денного ліміту немає; «Весняний цвіт» і «Старі вояки» додають по 10%. Арена й підземелля досвіду гравцю не дають, тому й гільдії нічого не додають.
- Кожен внесок ідемпотентний за `(player_id, activity_type, source_id)`. Тижнева місія (наша, не з довідника): 600 000 + 240 000 XP за учасника.
- `activityScore` у каталозі — сума Guild XP за останні 7 днів.
- Guild Card: лідер обирає один власний `player_card_instances` instance; карта не копіюється учасникам і не потрапляє в `player_decks`.
- Guild Card працює тільки в Duel/Arena: на кожній серверній ротації є шанс `0.15` з’явитися в активній трійці. Після появи вона не створює десятий слот і не змінює силу колоди.
- Рейди на відьом (правила з довідника, [[reference-elem-raids]]): відкриваються з 34 рівня гільдії; дві випадкові відьми з колекції «Чотири чаклунки», рівні 1–25 по черзі, тиждень із понеділка. HP і сила унікальної карти за рівнем — таблиці в `game-core/src/guildRaid.ts`. Колода відьми: 9 звичайних карт + унікальна карта фіксованої сили, сума ≈ `HP / 10` ± 500. Рейд-лідер — найстарший за званням серед записаних (тай-брейк — гільд-досвід). Лікування на порогах 75/50/25% — один раз на поріг на весь рівень рейду (`guild_witch_raids.heal_thresholds`). Прокляття кожні 60 с — 10% макс. HP («Гноми на відпочинку» — 5%). «Гноми на війні» дають +10% сили карт і HP. Карта гільдії бере участь у бою й додається до HP. «Змінити карти» — 10 золота. Після перемоги над парою один випадковий учасник отримує «Відьмин скарб»: копати N годин (N — рівень; «Гноми на відпочинку» — удвічі швидше) або відмовитися до кінця тижня; поки копає, бої з відьмами закриті, вийти з гільдії чи бути виключеним не можна. Скарб — 50N або 100N золота, 50 000N або 200 000N срібла, або карта «Чотирьох чаклунок» рівня 80+N із бонусом +1820 (усе через пошту). Хто вибув, чекає наступної спроби; коли вибули всі, спроба програна: відьми лікуються повністю, колоди здаються заново, і рейд-лідер відкриває той самий рівень.
- Алтар: рівень = найвищий рівень відьом, переможених минулого тижня. Щодня гравець може купити міцний настій (+X% HP за 2X золота; з колекцією «Чотири чаклунки» — +X+2%) і сильний настій (+X/2% за 1000X срібла); діють до 23:59:59 UTC у турнірі (війни ще немає). Сервіс — `altarService.ts`, таблиця `player_altar_potions`.
- Рейди на зміїв: 8 лігв на гільдію (4 старі по 300 000 HP, 4 рідкісні по 500 000 HP), сервіс `dragonRaidService.ts`, правила `game-core/src/dragonRaid.ts`. Одночасно — запис лише в один рейд; відкривати можуть лідер, офіцер, ветеран. Колода змія — 9 карт («Старі змії» + Сивий Левіафан або «Шулікові улюбленці»), сила 2700–3300 / 3900–4800, своя для кожного учасника; гравець б'ється лише бойовою колодою. Подих кожні 30 с: 10 000 / 20 000 шкоди порівну між живими. Перемога: очки змієборця = шкода; найбільша сума отримує карту змія (59 / 69 рівня, стандартний бонус) і втрачає половину очок; очки прив'язані до гільдії й зникають при виході. Після перемоги змій відроджується для кожного учасника (час — за рівнем лігва, з таблиці довідника), таймер переходить разом із гравцем. Перемога дає досвід, рівний завданій шкоді, з відсотковими бонусами гравця; цей досвід іде й у гільдію (`dragon_raid`). Поразка — без очок і без відродження. Лігва покращують лідер і офіцери з казни до 20 рівня, не вище за рівень гільдії.
- При видаленні instance зв’язок очищається через `ON DELETE SET NULL`; при передачі лідерства активна Guild Card очищається, а snapshot вже розпочатого бою не змінюється.
- Немає інших бойових бонусів, воєн, союзів, магазину й досягнень у MVP.

## Дані й правила

Міграції: `server/migrations/038_create_guilds.sql`, `server/migrations/048_guild_witch_raid_rewards.sql`, `server/migrations/049_raid_mail_rewards.sql`, `server/migrations/050_reset_witch_health_after_rebalance.sql`, `server/migrations/088_guild_raids_reference.sql` (рівні гільдії до 55, лігва зміїв, скарби відьом, настої алтаря).

- `guilds`: профіль, рівень, XP, мова, режим набору, декоративна `theme_element`.
- `guild_members`: один активний guild membership на гравця, роль і особистий внесок XP.
- `guild_xp_contributions`: ідемпотентні записи активностей і денний ліміт.
- `guild_applications`: заявка протухає через 72 години; часткові unique index гарантують одну активну заявку гравця загалом.
- `guild_cooldowns`: leave/kick/reject cooldown без зберігання балансних значень у БД.
- `guild_witch_raid_results` і `guild_witch_raid_result_participants`: незмінний підсумок переможеного рейду зі snapshot-ами учасників, дуельним рейтингом, шкодою, місцем і нагородою-посиланням на пошту.

Назва: 3–32 Unicode-символи, українські/латинські літери, цифри, пробіл, `-`, `_`, апостроф; без подвійних пробілів, без назви лише з пробілів/символів; unique case-insensitive через `name_key`.

Ролі не є джерелом авторизації самі по собі: `guild_role` мапиться на permission set. Офіцер керує лише `Новачок ↔ Учасник ↔ Ветеран`, не може змінювати офіцера/лідера та не може їх виключити. Лише лідер керує офіцерами. Лідер не виходить, доки не передасть лідерство; якщо він єдиний учасник — доступне підтверджуване розпускання.

Відкрита гільдія приймає одразу, `application` — заявку, `closed` — нікого не приймає. Мінімальний рівень задається профілем. Після виходу діє 24 години до вступу в іншу гільдію; після kick — 24 години до тієї самої; після reject — 12 годин до тієї самої. Withdraw власної заявки штрафу не має.

## API вертикального зрізу

Реалізація: `server/src/guild/guildRoute.ts`, `server/src/guild/guildService.ts`, typed client — `client/src/telegram/guild.ts`.

- `GET /api/guilds` — каталог, 20 на сторінку, фільтри назви/мови/open/min level/free slots.
- `GET /api/guilds/:guildId` — профіль, склад, доступні заявки та viewer permissions.
- `GET /api/guilds/mine` — власна гільдія й активна заявка.
- `POST /api/guilds`, `PATCH /api/guilds/:guildId/settings`.
- `POST /api/guilds/:guildId/join`, `POST /api/guilds/:guildId/apply`, withdraw application.
- `GET /api/guilds/:guildId/guild-card` — активна Guild Card і прапорець керування для поточного viewer.
- `GET /api/guilds/:guildId/guild-card/eligible` — власні інстанси карт лідера; доступно лише лідеру.
- `PATCH /api/guilds/:guildId/guild-card` з `{ "instanceId": "..." }` — вибір карти з перевіркою власності.
- `GET /api/guilds/:guildId/raid` — поточний рівень, дві відьми, enrollment, особистий стан бою та останній підсумок завершеного рейду.
- `POST /api/guilds/:guildId/raid/enroll`, `DELETE /api/guilds/:guildId/raid/enroll` — запис/вихід до старту.
- `POST /api/guilds/:guildId/raid/start` — відкриття рейду найстаршим за роллю записаним учасником.
- `POST /api/guilds/:guildId/raid/battle` — старт або відновлення особистого бою.
- `POST /api/guilds/:guildId/raid/battle/:battleId/action` з `{ "bossSlot": 1|2, "slotIndex": 0|1|2, "expectedVersion": n }` — один серверний удар і відповідь.
- accept/reject applications, role change, kick, leadership transfer, leave, dissolve.

Активності підключені до authoritative services дуелі, кампанії, підземелля й арени через `GuildActivityRecorder`; кожна нагорода має source id для повторного безпечного виконання.

## Що взято з форумного дослідження

Публічний референс `elem.mobi` підтвердив корисні сценарії: каталог гільдій, профіль зі складом і рангами, заявки, лідерство, а також окремий гільдійний форум із гостьовою частиною. Форумні правила також показали потребу в окремих permission layer, unread/read станах, pinned topics, пагінації та cooldown на створення тем.

Корисні публічні сторінки, з яких знято вимоги й edge cases:

- [гайд по гільдіях](https://elem.mobi/forum/7/66510/) — у референсі вступ із 10 рівня, інші значення ліміту/ціни не переносимо;
- [заявки та запрошення](https://elem.mobi/forum/7/66566/) — гравець не має бути в іншій гільдії, у Cardastika додано власний withdraw;
- [ролі та ранги](https://elem.mobi/forum/7/66460/) — підтверджено окреме управління рангами й передачу лідерства;
- [вихід із гільдії](https://elem.mobi/forum/7/66571/) — лідер не виходить без передачі лідерства;
- [рівні та guild XP](https://elem.mobi/forum/3/8099/) — шкала рівнів гільдії 1–55 і пороги досвіду взяті з довідника ([[reference-elem-guild]]);
- [герби](https://elem.mobi/forum/3/63229/) — підтверджено цінність окремого crest/emblem шару, але графіку не копіюємо.

Референсні числа й назви не копіюються: старі значення на кшталт 50 учасників, іншої ціни створення або бойових бонусів замінені каноном Cardastika. Форум, unread, теми, відповіді, модерація, союзи й війни залишаються наступним етапом.

## Асети

Оригінальний локальний pack:

- `client/public/assets/guild/guild-shields.png` — 8 щитів у sprite sheet;
- `client/public/assets/guild/guild-background.png` — міфічний temple background;
- `client/public/assets/guild/guild-badges.png` — role/progression badge sheet.

Емблеми й badges вже використовуються в Guild screen. Для майбутнього форуму ще потрібні окремі стани topic/read/unread/pinned/reply, moderator icons, forum dividers і empty states. Візуали референса не копіюються.

## Локальна перевірка

Локальний dev seed: `npm run dev:guild-seed`. Він доступний лише коли `NODE_ENV !== production` і `CARDASTIKA_DEV_AUTH=true`. Акаунти: `player_regular`, `guild_leader`, `guild_officer`, `guild_veteran`, `guild_member`, `guild_newbie`, `player_locked`.

У production dev seed і dev-login відключені guard-ами сервера. Перед production потрібне окреме явне підтвердження; поточна реалізація не пушить і не деплоїть код.
