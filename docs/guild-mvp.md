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
- Guild XP не списується після виходу учасника. Внесок одного гравця обмежений 300 XP на добу.
- XP видається тільки за завершені активності: дуель win/loss 10/3, кампанія 8, підземелля 12, арена місця 1/2/3/4–6: 18/14/10/5.
- `activityScore` у каталозі — сума Guild XP за останні 7 днів.
- Guild Card: лідер обирає один власний `player_card_instances` instance; карта не копіюється учасникам і не потрапляє в `player_decks`.
- Guild Card працює тільки в Duel/Arena: на кожній серверній ротації є шанс `0.15` з’явитися в активній трійці. Після появи вона не створює десятий слот і не змінює силу колоди.
- Witch raid: одна persisted-сутичка на гільдію, рівень зафіксований на 1 для першого релізу, дві різні випадкові відьми, кожна з 450 000 HP і серверним enrollment/start. Бій — гравець проти вибраної відьми; її колода має 9 звичайних карт і одну обов’язкову особливу карту відьми. Сума сили 10 карт колоди — близько `HP / 10`, із випадковим відхиленням до 500. Кожен бій зберігає активні карти, резерв, HP, лог, версію для optimistic locking і автоматичну відповідь карти відьми. Учасник має накопичуваний `damage_total`; після перемоги зберігається повний рейтинг рейду. Топ-3 отримують випадкову карту з рейдової колекції «Відьми», місця 4–10 — однакові 50 золота + 50 000 срібла на рівні 1, а з 11-го місця сума зменшується на 10% за місце (11-е = 50%, 16-е і нижче = 0%). Усі нагороди спочатку потрапляють у внутрішню пошту; баланс і картка змінюються лише після натискання «Забрати подарунок». Кнопки ручного «Оновити» у рейді немає: активний бій підтягується polling-ом, а після удару пара карт ротується одразу.
- При видаленні instance зв’язок очищається через `ON DELETE SET NULL`; при передачі лідерства активна Guild Card очищається, а snapshot вже розпочатого бою не змінюється.
- Немає інших бойових бонусів, воєн, союзів, магазину й досягнень у MVP.

## Дані й правила

Міграції: `server/migrations/038_create_guilds.sql`, `server/migrations/048_guild_witch_raid_rewards.sql`, `server/migrations/049_raid_mail_rewards.sql`, `server/migrations/050_reset_witch_health_after_rebalance.sql`.

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
- [рівні та guild XP](https://elem.mobi/forum/3/8099/) — використано лише як довідкову основу для шкали 1–20;
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
