# Guild UI: локальне вирівнювання з reference

Дата: 31.08.2026. Scope: Guild та точковий перехід із Profile. Без commit, push і deployment.

## Правило наступних екранів

`elem.mobi = layout / UX / information hierarchy / screen structure`.
`Cardastika = visual identity / assets / typography / effects / colors`.
Спочатку перевіряємо доступний аналог, потім переносимо його структуру у власні компоненти. Відсутні в Cardastika системи не отримують фальшивих активних кнопок чи вигаданих показників.

## Третій прохід: polish без зміни композиції

- Прибрано повтори «Пізніше» з активності, спільноти й скарбниці. Майбутні функції мають замок і 65% opacity; світліша базова назва зберігає читабельність. Робочий «Розвиток» не затемнюється.
- Натискання на майбутню функцію показує повідомлення «Функція з’явиться в одному з наступних оновлень.» на 4 секунди. Повторний tap перезапускає таймер, не створює другу підказку. API-запити не виконуються. Portal в body утримує toast над BottomNav незалежно від прокрутки/анімованого контейнера; таймер і portal очищаються при виході.
- Герб збільшено через scale 1.18: видимі 66 px замість 56 px, висота hero залишилася 56 px. Прибрано верхні горизонтальні лінії у характеристик і бонусів.
- Рядок лідера перейменовано на «Керування гільдією», додано SVG і помітнішу підкладку. Form і permissions не змінені.
- Коли великий hero виходить за HUD, з’являється компактна назва з гербом. Висота — 38 px, без додаткової порожньої області в початковому стані. Позиція обчислюється з фактичної нижньої межі HUD з урахуванням padding scroll-контейнера. IntersectionObserver / ResizeObserver відключаються при unmount. Глобальні TopHud/BottomNav не змінені.
- Scroll-padding обмежений `.app-content:has(.guild-screen)`: автоматичний перехід до контролів не ховає їх за HUD/назвою/BottomNav. Прокручується лише `.app-content`, body залишається на scrollTop 0.

Файли: `client/src/components/MenuRow.tsx` (optional locked-іконка, сумісна з усіма попередніми викликами), `client/src/screens/guild/GuildHub.tsx`, `GuildProfile.tsx`, `GuildScrollTitle.tsx` (новий), `guild.css`, цей документ.

Перевірено: client build / TypeScript; Guild PostgreSQL tests 3/3, 0 skipped; toast, повторний tap, автоматичне зникнення й очищення після переходу в Profile; зникнення sticky-назви при поверненні нагору; один HUD і BottomNav. У mobile sticky top дорівнює HUD bottom (90.73 px), без перекриття. Жодних нових бонусів, API, економічної чи рольової логіки.

Фінальні viewport: 390×844, 412×915; overflow/обрізаних назв немає, controls ≥44 px, форма керування відкривається/закривається, каталог повністю над BottomNav. Console warn/error — порожні. Артефакти: `.runtime/guild-review/polish-390x844.png`, `polish-scroll-412x915.png`, `polish-toast-412x915.png`, `build-polish.log`. Після остаточної збірки PostgreSQL/local API й активні public Mini App HTML/API повторно доступні; public усе ще не є локальним Vite preview. Авторизований Telegram acceptance залишається непідтвердженим, production не змінювався.

## Другий прохід: центр гільдії за уточненим макетом

За новим запитом користувача огляд власної гільдії тепер має таку структуру:
identity → рівень/XP → показники → набір → бонуси → керування 2×2 → активність → спільнота → налаштування → інші гільдії.

- Герб і основні показники збережені. Роль і мова — під назвою. Опис і особистий внесок перенесено в «Розвиток», щоб звільнити місце для центру гільдії. Для чужої гільдії опис і форма вступу залишаються на огляді.
- «Склад», «Заявки», «Скарбниця», «Розвиток» використовують наявний дерев’яний `MenuRow` у сітці 2×2. Лічильники складу/заявок — із API. Доступ до заявок залишається за server permissions; для решти учасників плитка вимкнена з поясненням «Лідер / офіцер».
- «Розвиток» працює: серверний рівень, накопичений XP, наступний поріг, активність, власний внесок, чинний cap і перехід до складу.
- За новим макетом показані майбутні розділи: скарбниця, події, досягнення, рейд, чат, журнал і оголошення. Вони явно disabled/locked та позначені «Пізніше». Бонуси — «Поки недоступні», без вигаданих +2%/+3%/+5%. Цей запит дозволяє presentation майбутніх систем, але не реалізує їхню ігрову логіку.
- Активність і спільнота оформлені темними рядками з розділювачами та існуючими SVG, без дерев’яних кнопок. Каталог став невеликою нижньою дією «Переглянути інші гільдії».
- Backend, API, схему БД, баланс, ролі, auth та persistent shell у цьому проході не змінено. Нових залежностей і assets немає.

Файли другого проходу: `client/src/screens/guild/GuildHub.tsx` (новий), `client/src/screens/guild/GuildProfile.tsx`, `client/src/screens/guild/guild.css`, цей документ.

Перевірки другого проходу: client production build + TypeScript PASS; Guild PostgreSQL integration 3/3 PASS, 0 skipped. У браузері перевірено розвиток → внески → склад, заявки лідера, заборону заявок/керування для учасника, перехід у каталог і назад. Console warn/error — порожні. Попередні два падіння загального набору поза Guild не виправлялися; цей набір повторно не запускався для presentation-змін.

Mobile другого проходу: фактичні 390×844 і 412×915; горизонтального overflow й обрізаного тексту плиток немає, головні плитки 58 px, другорядні дії від 44 px. Каталог доступний після прокрутки вище BottomNav; HUD/BottomNav залишаються в одному екземплярі. Локальні PostgreSQL/API й публічні Mini App HTML/API повторно перевірені після build. Публічний URL усе ще показує production, а не Vite localhost; авторизований Telegram acceptance не виконаний.

Попередні результати й обмеження Telegram нижче залишаються чинними. Нові screenshots: `.runtime/guild-review/hub-390x844.png`, `hub-412x915.png`, `hub-community-412x915.png`.

## Короткий audit і reference alignment

Прочитано `reference-project-audit.md`, `reference-guild-forum.md`, parser, service і route. Парсер не змінювався.
Обмежений crawl (8 сторінок, depth 0) повернув login shell для Guild і rate limit для частини форуму; цей результат не використано як достовірну верстку гільдії.
Згодом у вже авторизованій вкладці Chrome вдалося read-only переглянути:

- `/guild/`: назва та основна інформація, ігрові дії, склад, додаткові переходи;
- `/guild/info/`: емблема/назва, рівень і прогрес, основні показники, рядки навігації;
- `/guild/members/`: окремий склад, ранги в рядках, 10 учасників на сторінку, керування/вихід після списку.

Вхід, cookies/localStorage, приватні повідомлення та mutation-посилання reference не використовувалися. Старі sprites/assets не переносилися.

Раніше Cardastika мала велику вступну шапку, dev-перемикач угорі, вкладені панелі, весь склад на першому екрані та дрібні дії в кожному рядку. Форма заявки стояла після складу.

Після першого проходу огляд відокремлений від складу/заявок: identity → рівень/XP → основні показники → набір/опис/внесок або вступ → навігація → налаштування/каталог. У складі — до 10 рядків на сторінку; керування учасником розкривається окремо. Заявка й кнопка подання знаходяться поруч. Розділи використовують спільний `MenuRow`.

Це адаптація Guild MVP: reference dashboard містить війни, казну, карту, рейди тощо. У першому проході вони були відсутні; уточнений макет другого проходу додає лише явно закриті майбутні розділи. Форум не реалізовано. Власні HUD, три пункти BottomNav, щити, badges, temple background, палітра, шрифти і дерев’яні MenuRow збережені.

## Логіка і контракти

- Виправлено клієнтське ототожнення відповіді `apply` з членством: після дій стан перечитується з `/api/guilds/mine`.
- Права дій — із server viewer permissions та існуючих `canManageGuildRole` / `canKickGuildMember`.
- Завантаження чужої гільдії має власні loading/error/retry, не показує каталог замість очікуваної сторінки. Пізні відповіді після зміни екрана ігноруються.
- Після створення гільдії HUD перечитує гравця, без локального розрахунку списання срібла.
- `GET /api/guilds/mine` доповнено optional `lastApplication` для останньої rejected/expired заявки: guildId, guildName, status, retryAt. Дані читаються з існуючих таблиць. Нова pending/accepted/withdrawn заявка не відновлює стару відмову.
- Помилка `guild_cooldown` передає optional ISO `retryAt`; UI показує українську дату замість технічного коду.
- Бойові правила, XP/rewards/cap/curve, економіка, membership, cooldown, ролі, permissions та схема БД не змінені. `themeElement` впливає лише на декоративний акцент.

## Перевірки

- До змін: `npm run build` — PASS; існуючий `npm run test:guild --workspace server` — 1/1 PASS на локальній PostgreSQL.
- Після змін: `npm run build` — PASS (shared, game-core, server, client; включає TypeScript). Попередження Vite про chunk >500 kB існувало до змін.
- `npm run test:guild --workspace server` — 3/3 PASS, 0 skipped. Перевірено unlock, членство, open/full/closed/min level, empty search, pending/withdraw/expired/rejected/accepted, permissions, promote/demote, kick/cooldown, leave, transfer, dissolve, XP idempotency і cap.
- `npm test`: game-core 65/65 PASS; server 105/107 PASS, 2 FAIL, 0 skipped. Помилки поза Guild: `collectionCatalog.test.ts` очікує `Птах Рух`, каталог має `Рух`; `limitedCardService.integration.test.ts` очікує активну подію Картера, але локальна подія завершилася 27.08.2026. Відповідні source/test файли не змінювалися й не мають diff від HEAD. Помилки не приховані і не виправлялися в цьому slice.
- UI з реальною PostgreSQL: leader/officer, блокування рівня 9, no-guild рівня 12, empty search, заявки (submit/pending/withdraw), create і серверний баланс 50 000 → 40 000, Profile → Guild, empty applications, помилка завантаження гравця → retry → відновлені дані.
- Для mutation UI перевірок тимчасово змінено лише `dev_locked`. Створена тестова гільдія/заявка видалені, початкові рівень і срібло відновлені. Існуючі гільдії та memberships не скидались.
- Mobile: фактичні CSS viewport 390×844 та 412×915, перевірені через `innerWidth/innerHeight` у Chrome. З урахуванням zoom 110% інструменту передано 429×928 та 453×1006. Тимчасовий iframe fixture для діагностики IAB видалено; фінальні скриншоти зроблені з прямого localhost.
- Перевірено відсутність горизонтального overflow, один TopHud/BottomNav, touch controls від 44 px, реальні ім’я/рівень/срібло/золото. Порожня колода dev-акаунта позначена «—», без mock power.

Логи і скриншоти: `.runtime/guild-review/` (локальні review artifacts, не production assets).

## Змінені файли цього проходу

- `client/src/screens/GuildScreen.tsx`
- `client/src/screens/guild/GuildProfile.tsx`
- `client/src/screens/guild/GuildDirectory.tsx`
- `client/src/screens/guild/GuildUi.tsx`
- `client/src/screens/guild/guild.css`
- `client/src/components/GuildMembershipRow.tsx`
- `client/src/components/TopHud.tsx`
- `client/src/screens/ProfileScreen.tsx`
- `client/src/App.tsx`
- `client/src/styles/global.css` (попередні Guild styles перенесено у локальний stylesheet; інші стилі збережено)
- `client/src/telegram/guild.ts`
- `shared/src/guild.ts`
- `server/src/guild/guildService.ts`
- `server/src/guild/guildRoute.ts`
- `server/src/guild/guildService.integration.test.ts`
- `docs/guild-ui-alignment.md`

## Що ще не підтверджено

- Reference create/no-guild/application/permission error screens недоступні в поточній reference-сесії без зміни її стану. Для них використано чинні правила Cardastika, без вигаданих reference деталей.
- Не всі стани пройдені в браузері: veteran/member/newbie, full, expired/rejected, accept, transfer/dissolve підтверджені інтеграційними тестами; їхній повний візуальний acceptance ще потрібен.
- Активна Telegram menu URL: `https://app.cardastika.org/?v=1f587fe2f795`. HTML Cardastika і `/api/health` відповідають 200. Це не підтверджує зв’язок з localhost: публічний HTML містить іншу production-збірку, `/api/dev/accounts` повертає 404, тоді як localhost віддає Vite та 7 dev-акаунтів.
- Telegram Desktop відсутній серед доступних застосунків/вікон; авторизований запуск Mini App усередині Telegram не перевірений. Публічна конфігурація і menu URL не змінювалися. Production та Telegram acceptance — після явного підтвердження локального результату.
