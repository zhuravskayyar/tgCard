# Загальний UI/UX та Visual Style Audit — Cardastika

Дата аудиту: 2026-09-04
Об’єкт: локальний Cardastika, authenticated dev seed `dev_leader`, а також доступний public Mini App/API шлях.
Фокус: реалізовані екрани, стани, shell, компоненти, CSS-архітектура, мобільна й desktop-поведінка.
Обмеження: це read-only аудит. Під час першого проходу не змінювалися CSS, React-компоненти, assets, game logic чи production.

## 1. Executive Summary

### Загальний висновок

Cardastika вже має впізнавану основу: темне дерево/камінь, бронзово-мідні рамки, muted gold, тканинні та металеві текстури, центрований mobile-first ігровий canvas. Найкраще зараз виглядають Home, Card Detail, Deck, Collections, Mail і основний HUD. На desktop рішення з фіксованою шириною близько 430px та великим dragon background також працює переконливо.

Головна проблема не в тому, що в проєкту немає стилю. Проблема в тому, що цей стиль розходиться на окремі підсистеми. Shop, Battle Pass, Dungeon і частина Guild використовують холодні або надто насичені акцентні кольори; дрібні підписи й action-кнопки часто стискаються до рівня, який важко читати й натискати; великий `global.css` має багато пізніх каскадних шарів і повторних override-ів. Через це кожен новий екран легко “випадає” з Dark Clean Fantasy замість того, щоб автоматично наслідувати його.

### Оцінки

| Напрям | Оцінка | Коментар |
|---|---:|---|
| Візуальна послідовність | 7/10 | Сильний warm shell, але є холодні/яскраві підсистеми. |
| Читабельність | 6/10 | Основний текст читається добре, але багато 8–10px labels і microcopy. |
| UX-навігація | 7/10 | Shell стабільний, empty/locked states чесні; частина дій замала або неочевидна. |
| Mobile usability | 6/10 | Overflow відсутній, але touch targets і щільність потребують роботи. |
| Desktop adaptation | 8/10 | Центрований 430px canvas на 768/1024/1440 працює правильно. |
| Cardastika identity | 8/10 | Добра база dark fantasy; відхилення локальні, але системні за наслідками. |

### Пріоритети

- **P0 — критичні:** у перевірених flow не знайдено. Не було горизонтального overflow, зламаної навігації чи недоступного через scroll основного контенту.
- **P1 — високі:** типографічна й CSS-каскадна фрагментація; замалі critical actions; контраст заголовка Guild; palette drift у Shop/Battle Pass; слабкий feedback під час пошуку суперника.
- **P2 — середні:** надмірна щільність Forge/Tasks/Battle Pass, дрібні filters/back/details, багато disabled “незабаром”, нерівномірна висота та візуальна вага секцій.
- **P3 — косметичні:** локальні вирівнювання, нюанси shadow/gradient, другорядні розбіжності в badge/radius.

## 2. Current Visual Identity

### Що вже працює

**Confirmed.** Основний shell послідовно використовує темний фон, warm wood/stone surfaces, bronze borders, gold active state і parchment/fabric accents. Home має сильну композицію: 3×2 mode tiles, металеві `MenuRow`, компактний HUD і рівновагу між артами та текстом. `MenuRow` — спільний компонент, який уже дає хорошу повторюваність меню.

**Confirmed.** Card Detail і Deck найкраще показують задум “light Mythic Temple”: картковий арт є головним, а UI підтримує його рамкою, елементом, rarity та muted information blocks. На Card Detail присутні всі потрібні action rows у правильному порядку: `Колода`, `Слабкі карти`, `Магазин`.

**Confirmed.** Desktop canvas не розтягується на всю ширину. На 768, 1024 і 1440px shell залишався близько 430px і був центрований; навколо працював dragon background. Це варто зберегти як частину identity, а не “виправляти” на повноширокий SaaS-layout.

### Де стиль розходиться

**Confirmed.** Shop має яскраві зелені, сині й фіолетові offer/action акценти. Вони добре сигналізують rarity або валюту, але в поточній насиченості сперечаються з бронзово-мідним shell. Це видно і в runtime screenshot, і в пізніх Shop-правилах (`global.css:14818+`, `global.css:15906+`).

**Confirmed.** Battle Pass побудований на холодному navy/cyan наборі: `#298fca`, `#b6f1ff`, `#55cfff`, blue glow (`global.css:13178-13230`). Візуально він читається як окремий sci-fi/ice subsystem, а не як сезонний шар Cardastika.

**Likely.** Guild має кілька історичних visual passes. Частина екранів успішно переведена в warm shell, але окремі меню, bottom-nav override-и, cyan accents і `Segoe UI !important` створюють відчуття іншого продукту. Це, найімовірніше, наслідок накладання reference/legacy стилів, а не свідомої окремої фракції.

**Subjective recommendation.** Залишити fantasy texture, large art і локальні елементні/rary accents. Зменшити saturation і glow у chrome; колір має пояснювати стан, а не бути головною декорацією кожного блоку.

## 3. Global Problems

### 3.1. CSS і token ownership

**Confirmed.** `client/src/styles/global.css` має понад 16 тисяч рядків і кілька великих пізніх шарів: `World-tree visual system` (`:6052`), `Final landing dimensions` (`:12084`), `Battle Pass visual pass` (`:13178`), `unified HUD` (`:15650`) та інші. Базові tokens на початку файлу (`:3-67`) мають cool values, які пізніше перевизначаються warm values. Така структура дозволяє одному selector-у непомітно змінити інший екран.

**Що це ламає:** складно передбачити computed style; нові екрани отримують різні radius, border, type scale і color semantics; локальний fix часто породжує ще один override.

**Що робити:** окремо зафіксувати canonical tokens, розкласти стилі за шарами `tokens → base → components → screens → states → responsive`, а старі passes видаляти після screenshot regression. Це не робота для першого дрібного UI fix, але це головний системний борг.

### 3.2. Відсутність спільної Button primitive

**Confirmed.** У `client/src/components` є спільний `MenuRow`, але немає єдиного `Button` з variant/size/state. Екрани використовують окремі класи на кшталт `duel-primary-button`, guild actions, equipment actions, campaign actions і `quest-paper__button`.

**Що це ламає:** однакові за важливістю дії мають різну висоту, font-size, focus ring, border і saturation. На Tasks `.quest-paper__button` має `min-height: 29px` і `font-size: .62rem` (`global.css:13880-13920`) — це конкретний приклад системної проблеми.

### 3.3. Типографічний fallback

**Confirmed.** `Lugatype` згадується в багатьох CSS declarations, але в коді не знайдено `@font-face` або іншого явного підключення `client/public/fonts/lugatype.otf`. Отже, вигляд залежить від того, чи є цей шрифт у середовищі користувача; інакше спрацьовують Georgia/system fallbacks.

**Що це ламає:** заголовки та цифри можуть мати різну ширину між пристроями; wrapping і вертикальна висота компонентів стають нестабільними.

### 3.4. Надто дрібне другорядне UI

**Confirmed.** У runtime замірялись labels близько 8–10px: Shop copy/details, Campaign metadata, Collections status, Battle Pass rewards, Guild microcopy, Tasks actions. Для decorative caption це допустимо, але зараз таким розміром подаються також пояснення, прогрес, ціни й навігаційні підказки.

**Що це ламає:** користувач бачить картинку й основний CTA, але мусить вдивлятися, щоб зрозуміти умову, reward або наступний крок.

### 3.5. Нерівномірна палітра станів

**Confirmed.** У CSS одночасно присутні warm semantic values і дуже насичені raw literals: element colors `#ff8272`, `#75d3f9`, `#f7dd87`, `#a8f369`, rarity colors `#cc33cc`, `#ff9900`, `#ff0000`, а також battle-pass cyan. Для card semantics це не обов’язково помилка, але зараз ці кольори проникають у UI chrome й CTA.

**Рекомендація:** відокремити “колір картки/елемента” від “кольору інтерфейсної дії”. Card art може бути яскравішим; panel, border і кнопка мають залишатися в warm Cardastika range.

### 3.6. Feedback у пошуку суперника

**Likely P1.** На Duel під час matchmaking після першого очікування великий panel виглядає майже порожнім: на screenshot лишається artwork і малопомітний статус `ШУКАЄМО СУПЕРНИКА`, хоча DOM-стан присутній. Це створює враження зависання.

**Рекомендація:** дати пошуку компактний, але виразний status block: spinner/progress, elapsed time, cancel/back action і коротке пояснення, що саме відбувається.

## 4. Color Audit

Нижче наведені ефективні runtime tokens після фінального каскаду, а не лише початкові значення з `:root`.

| Роль | Поточне значення | Оцінка | Рекомендація |
|---|---|---|---|
| Page background | `#0d0805` | Сильна база | Залишити canonical page token. |
| App background | `#160c08` | Добре тримає теплий shell | Залишити, прибравши дублікати близьких значень. |
| Panel | `#21130d` | Читається як dark wood/stone | Залишити для основних surfaces. |
| Raised panel | `#2a1a11` | Добрий elevation | Використовувати для cards/dialog sections, не для всіх блоків. |
| Inset | `#0d0805` | Дає глибину | Не класти на нього довгі muted paragraphs без додаткового контрасту. |
| Subtle/default border | `#342116` / `#5b3d27` | Відповідає fantasy metal | Уніфікувати замість десятків близьких raw borders. |
| Bronze/gold border | `#966c3e` / `#c0955b` | Добрий hierarchy signal | Gold залишити для active/focus, bronze — для structure. |
| Primary text | `#f3e8d6` | Добрий контраст на dark background | Залишити. Не використовувати на світлому ribbon. |
| Secondary/muted | `#cbb89e` / `#a28b70` | Придатно для body/metadata | Muted не використовувати для critical instruction або price. |
| Disabled | `#75624e` | Чесно неактивний | Перевірити, щоб disabled controls не втрачали legibility. |
| Accent bronze/gold | `#b1814e` / `#e1bc6e` | Сильна identity-пара | Зробити єдиною semantic pair для CTA/active. |
| Element colors | `#ff8272`, `#75d3f9`, `#f7dd87`, `#a8f369` | Зрозуміле розрізнення стихій, але high saturation | Обмежити картками, icons і маленькими indicators; не фарбувати ними великі panels. |
| Rarity colors | `#cc33cc`, `#ff9900`, `#ff0000` | Добре помітні, але агресивні | Перевести в muted surface + controlled border/text; Mythic red не має виглядати як error. |
| Battle Pass cyan/blue | `#298fca`, `#b6f1ff`, `#55cfff` | Відчувається окремою холодною темою | Або гармонізувати з bronze/gold, або чітко обмежити seasonal art layer. |
| Shop green/purple/orange | `#7bdd52`, `#d35cdb`, `#f09a2f` | Utility сигнал є, але chrome занадто гучний | Зменшити saturation у surface; колір лишити для rarity/status accent. |

### Контраст і значення кольору

**Confirmed.** Основна пара `#f3e8d6` на `#0d0805` виглядає читабельно. Проблеми виникають не в одному глобальному “поганому” foreground, а в комбінаціях: дрібний muted text на textured/gradient panels, cyan або green text на різних offer backgrounds, а також dark text на світлій Guild ribbon.

**Confirmed.** Guild ribbon має `color: #3b2110` (`global.css:16334+`) на світлому parchment/fabric background. У runtime заголовок `Вартові` виглядає слабше за сусідні warm headings. Це конкретний P1 для важливого screen identity; потрібен окремий контрастний pair і screenshot check.

## 5. Typography Audit

### Поточний стан

Базова ідея правильна: `Roboto Condensed` для body/labels, `Philosopher` для display, `Oswald` для numeric accents (`global.css:3-6`). Але реальні екрани змішують fallback-ланцюжки, `Lugatype`, Georgia і на Guild — `Segoe UI !important` (`guild-polish.css:1433+`, `:1584+`).

Орієнтовні runtime levels на mobile:

| Рівень | Спостереження | Висновок |
|---|---|---|
| Screen h1 | приблизно 17–22px, але Profile/Guild ribbon місцями 11–13px | Базу треба уніфікувати; title не має втрачати вагу через декоративний asset. |
| Section h2 | приблизно 14–16px | Добре для shell, інколи потребує більшого line-height. |
| Card title | приблизно 14–16px | Працює, якщо title не конкурує з art. |
| Body | приблизно 11–13px | Придатно для короткого copy; для інструкцій краще 13px+. |
| Secondary | приблизно 9–11px | Залишити лише для non-critical metadata. |
| Caption/status | приблизно 8–10px | Зараз використовується надто широко. |
| Numbers | 12–20px | Currency/HP/power читаються, але labels поруч часто замалі. |

### Рекомендований semantic scale

Це пропозиція токенів, не внесена зміна: `h1 20/24`, `h2 16/20`, `card title 14/17`, `body 13/18`, `secondary 12/16`, `caption 11/13`, `value 18/22`. 10px можна залишити для суто декоративних eyebrow labels, але не для ціни, reward, progress explanation, navigation або action.

### Мова

**Confirmed.** У Arena є англомовний фрагмент `УВІЙТИ В ARENA QUEUE` всередині переважно українського UI. Це невелика, але помітна втрата polish. Потрібен єдиний словник термінів і правило для майбутніх режимів.

## 6. Spacing / Layout Audit

### Сильні сторони

- Базова шкала 4/8/12/16/20/24 вже присутня у root tokens.
- На 375, 390 і 425px не виявлено горизонтального overflow.
- Усі перевірені довгі екрани скроляться; контент не ховається під BottomNav.
- `TopHud` і `BottomNav` залишаються persistent; звичайні screens рендеряться між ними.
- На desktop shell не розтягується й не ламає композицію.

### Проблеми

**Confirmed.** У декількох екранах controls мають висоту 27–39px: back buttons близько 31–38px, element filters близько 34px, equipment tabs близько 32px, arena info близько 30px, task actions 29px, Guild inline `Змінити` близько 18px. Навіть якщо видима піктограма маленька, клікабельний wrapper має бути не менше 44px.

**Likely P2.** Deck на 390px має сильну 3×3 верхню композицію, але після неї залишається великий темний порожній простір до fixed navigation. Це не функціональна поломка, проте screen виглядає недозаповненим.

**Likely P2.** Forge, Tasks, Battle Pass і частина Guild намагаються показати забагато information blocks в одному mobile viewport. Проблема не в кількості функцій, а в тому, що їм бракує visual grouping і breathing room.

**Recommendation.** Не збільшувати все механічно. Спершу класифікувати текст на primary/secondary/caption, потім збільшити тільки critical copy й tap wrappers; для scrollable filters використати один стабільний pattern.

## 7. Component Audit

| Компонент | Що добре | Проблема | Пріоритет |
|---|---|---|---|
| Button | Є виразні fantasy surfaces і focus styles у частині кнопок. | Немає спільної Button primitive; висоти/кольори/labels розходяться. | P1 |
| Panel | Dark warm surfaces, textured shell, хороша глибина. | Guild/Battle Pass/Shop вводять інші material rules; radius/shadow не canonical. | P1/P2 |
| Card | Найсильніший візуальний об’єкт; art має місце й hierarchy. | Raw rarity/element colors можуть забирати увагу від card content. | P2 |
| Modal | `DailyLoginModal`, selection dialog і tutorial overlay мають окремі стани. | У поточному seed не всі modal states були доступні для visual QA; треба перевірити max-height, focus і safe area в реальному flow. | P2 |
| Tabs | Вибір зрозумілий, tabs використовуються послідовно по screens. | Частина tabs 30–36px і виглядає як action, хоча є майбутньою/disabled. | P2 |
| HUD | Persistent, реальні player data, name/level/currencies видно, 375px не ламається. | XP track близько 5px і без явного numeric XP; маленькі secondary labels. | P2 |
| Navigation | Рівно три items: `Головна`, `Профіль`, `Гільдія`; fixed і стабільний. | Guild має додаткові cyan overrides, що розмивають єдність shell. | P2 |
| Badge | Добре працює для rarity, status і guild roles. | Різні shape/size/radius та надто яскраві rarity colors. | P2/P3 |
| Currency | Silver/gold icons і числа легко знаходити. | У Shop є окремі currency colors, які іноді сильніші за сам CTA hierarchy. | P2 |
| Inputs | Semantic controls і empty states присутні; Guild input має адекватні великі поля. | Settings показує raw `Bot domain invalid` у local dev; compact filters потребують більших wrappers. | P1 env-specific/P2 |

## 8. Screen-by-Screen Audit

Позначки нижче стосуються поточного runtime seed і доступного source code. Для result states, яких не вдалося безпечно дійти в read-only проході, окремо вказано “source only”.

### Shell і navigation

- **TopHud — P2.** Сильний persistent shell, real authenticated data, хороша компактність. XP line занадто тонка й не пояснює прогрес числом; deck power/currency labels місцями дрібні.
- **BottomNav — P2/P3.** Структурно правильний і стабільний. Потрібно прибрати Guild-specific visual divergence і перевірити safe-area на реальному Telegram device.
- **Home — P2/P3.** Найкраща стартова композиція. Settings icon близько 34×34px; нижня частина може залишати зайвий scroll/повітря. Не змінювати world-tree background і mode tile art без окремої причини.

### Профіль і колода

- **Profile — P2.** Identity й equipment portrait працюють. Багато `Немає даних` близько 9px і довгий список слабко наповнених facts створюють відчуття незавершеності.
- **Deck — P2/P3.** 3×3 grid і power labels читаються, deck із дев’яти карт відповідає правилу. Великий порожній lower area потребує композиційного рішення, але це не критична UX-проблема.
- **Card Detail — P2/P3.** Один із найчистіших screens; action rows присутні в потрібному порядку. Back/toggle/level action мають видимі controls менше 44px, а secondary info дрібна.

### Shop та inventory

- **Shop — P1.** Offer cards зручно скануються, wallet і tabs зрозумілі. Green/blue/purple CTA та rarity surfaces занадто насичені для основної identity; потрібно відокремити rarity від action semantics.
- **Shop details — P2.** `summary` в DOM має більший wrapper, але видимий текст/marker виглядає як 17px-рядок і дуже дрібний label. Потрібен явний affordance “Деталі” й стабільна висота tap area.
- **Inventory — P2/P3.** Empty state чесний і зрозумілий. Tabs/filters компактні, а режим зі стандартним nickname skin виглядає слабше за image-led Collections.
- **Equipment — P2.** Гарний “mythic arsenal” framing і зрозуміла категоризація. Category/element filters близько 32–34px; багато дрібних labels і порожніх slot states.
- **Forge — P1/P2.** Система рецептів зрозуміла за структурою, disabled `ПЕРЕКУВАТИ` чесний. На mobile надто багато маленьких material/slot controls, а текст близько 7–10px губиться.

### Collections

- **Collections — P2/P3.** Найкращий image-led grid після Deck; прогрес і covers легко впізнати. Filter/back controls нижче бажаного touch size, status label близько 8px.
- **Collection detail — P2/P3.** Bonus, progress і card grid мають добру hierarchy. Потрібно краще пояснити empty/not-found card state і підняти secondary text.

### Guild

- **Guild hub — P1.** Багато функціональних входів і багатий seeded content. Заголовок Guild на ribbon має низький контраст (`global.css:16334+`, computed dark brown на світлому ribbon), а нижній navigation і окремі tiles тягнуть cyan reference style.
- **Guild info / roster / directory — P2.** Дані, roles і activity читаються, але microcopy щільна; `Змінити` близько 18px видимої висоти — слабкий touch target.
- **Guild treasury / altar / journal / announcements — P2.** Станів багато, empty/available/locked логіка пояснена. Деякі altar copy правила примусово використовують `Segoe UI !important`, що руйнує єдиний type voice.
- **Guild forum / event / raid / card selection — P2.** Структура підрозділів є; cyan accents і різні reference surfaces створюють style drift. Raid/result states потребують окремого screenshot regression.
- **Future Guild actions — P2.** `Війна`, `Арена`, івент та інші “Незабаром” чесно disabled, але велика кількість таких rows додає шум. Варто згрупувати майбутній контент або чіткіше маркувати його як roadmap.

### PvP і gameplay

- **Duel search — P1/P2.** Знайдений opponent card і battle entry працюють. Під час пошуку panel виглядає завислим через малопомітний status; back control менше 44px.
- **Duel battle — P2.** Combat composition добра: opponent/own HP, cards, multipliers і log присутні. Multipliers, combat log і secondary card copy дрібні; перший move не має достатньо сильного visual prompt.
- **Duel result — P2, source only.** Result view існує в коді, але win/lose flow не був штучно доведений до кінця, щоб не мутувати seed більше, ніж потрібно. Потрібна окрема QA-сесія.
- **Arena — P2.** Warm queue panel і tabs працюють. First-visit overlay щільний і дрібний; `УВІЙТИ В ARENA QUEUE` змішує мови. Result source існує, runtime не перевірявся.
- **Dungeon — P2/P3.** Face-down rune tiles дають сильний game affordance. Cyan cracks холодніші за shell, counters дрібні; game board загалом виразний.
- **Campaign — P2/P3.** Lariska, stages і dialogue мають зрозумілий flow. Stage quests щільні, metadata близько 9px; boss locked/empty state добре пояснює причину й CTA назад.
- **Leaderboard/Leagues — P2.** Поточний `/leagues` показує LeaderboardScreen з чесним `Рейтинг ще не відкритий` і умовою 0/10 wins. Потрібен сильніший “як відкрити” next step. Окремий `LeagueScreen.tsx` є в source, але `/leagues` його не рендерить — це likely implementation drift, який варто перевірити окремо.

### Progress і utility

- **Battle Pass — P1/P2.** Головна rail-композиція цікава, але navy/cyan palette від’єднує screen від warm shell; багато labels 8–9px. Progress/reward data має бути читабельнішою, навіть якщо rail залишається компактною.
- **Tasks — P1.** Daily tasks і rewards зрозумілі, але action buttons 84–93×29px, а labels дуже дрібні. Це прямий touch/readability issue, не просто смак.
- **Settings — P1 env-specific/P2.** Account rows і logout доступні. У локальному seed видно raw `Bot domain invalid`; це схоже на Telegram widget/domain configuration, не на доведену production-поломку, тому висновок має залишатися environment-specific. Багато disabled “незабаром” створюють шум.
- **Mail — P2/P3.** Повідомлення, unread state і choices зрозумілі. Buttons близько 40px — трохи нижче рекомендованих 44px.

### Modals, errors, empty, loading, results

- **Confirmed good pattern.** У source є explicit empty/locked states для Campaign boss, Leagues, Inventory, Guild і settings; це краще, ніж показувати порожній екран.
- **Source only.** `DailyLoginModal`, `TutorialOverlay`, choice dialog, Duel/Arena/Dungeon/Campaign result views реалізовані або присутні в source, але не всі були доступні для безпечного runtime проходу з поточним dev seed.
- **P2 follow-up.** Для цих станів потрібна окрема visual QA: focus trap, Escape/back, scroll усередині modal, safe-area і видимість primary action на 375px.

## 9. Mobile Audit

Перевірені ширини: **375, 390, 425px**; height — 844px.

### Підтверджені результати

- Shell займає всю mobile ширину, HUD близько 62px, BottomNav близько 68–73px.
- `overflowX = 0`; видимі child bounds залишаються всередині viewport.
- Home, Shop і Guild мають очікуваний vertical scroll; нижній контент не обрізається fixed navigation.
- 375px не створює окремої катастрофи: останній Home row може бути частково нижче viewport, але сторінка скролиться.
- У CSS присутні `env(safe-area-inset-*)`; їх треба залишити й перевірити на справжньому Telegram device.

### Головний mobile ризик

Не ширина, а **щільність + tap size**. Особливо проблемні Tasks, Forge, Guild inline actions, filters і back buttons. Мінімум 44×44px слід застосовувати до клікабельного wrapper, не обов’язково до самої піктограми чи декоративної кнопки.

### Що не треба робити

Не перетворювати mobile shell на довгі SaaS-картки з великими rounded containers. Cardastika виграє від компактного RPG canvas; треба підняти доступність і hierarchy локально.

## 10. Desktop Audit

Перевірені ширини: **768, 1024, 1440px**; height — 900px.

**Confirmed.** Shell має близько 430px і центрується: приблизно x=169 на 768, x=297 на 1024, x=505 на 1440. Horizontal overflow не спостерігався. На великих екранах dragon background навколо canvas підтримує fantasy framing.

**Confirmed.** Content всередині shell скролиться, а HUD/Nav залишаються на місці. Це відповідає Telegram Mini App ігровому формату.

**P2.** На desktop дрібні labels не стають автоматично читабельнішими, бо shell не збільшується. Це правильне рішення для identity, але typography має бути достатньо читабельною саме в 430px canvas.

**Recommendation.** Зберегти fixed constrained canvas. Для desktop додавати лише атмосферу навколо нього, не розтягувати controls і не робити responsive layout, який скасовує mobile-first композицію.

## 11. Accessibility / Readability

### Сильні сторони

- Основні text/background пари warm shell читаються.
- Навігація має semantic labels; BottomNav не перевантажений.
- Є `focus-visible` стилі щонайменше для частини action controls.
- Empty, disabled і locked стани зазвичай пояснюють, чому дія недоступна.
- Іконки не є єдиним способом зрозуміти основні actions: присутні тексти.

### Ризики

- 8–10px text використовується для значущих даних.
- Touch targets нижче 44px у Tasks, Guild inline, filters і back controls.
- Contrast залежить від texture/gradient; dark text Guild ribbon — конкретний виняток.
- Rarity red може бути сприйнятий як error/danger; статус слід дублювати текстом або shape, не лише hue.
- Cyan/green/purple не мають бути єдиним сигналом state/value.
- `Lugatype` без явного font-face робить wrapping і hierarchy нестабільними між пристроями.
- У runtime Settings показує raw provider error; технічний текст не повинен бути єдиним explanation для користувача.

### Мінімальний accessibility baseline для наступної ітерації

- body/important explanation: не нижче 13px;
- secondary data: не нижче 12px;
- decorative caption: 11px, якщо контраст достатній;
- clickable wrapper: мінімум 44×44px;
- visible focus ring у warm gold з достатнім offset;
- state завжди дублюється текстом, icon або shape;
- modal має keyboard/back close, focus return і внутрішній scroll;
- перевіряти 375px, 200% text zoom і Telegram safe-area.

## 12. Proposed Design Tokens (тільки пропозиція, не застосовано)

Це canonical direction для майбутньої токенізації. Значення підібрані з поточного effective warm shell і трохи приглушених semantic colors.

```css
--color-bg-main: #0d0805;
--color-bg-app: #160c08;
--color-surface: #21130d;
--color-surface-raised: #2a1a11;
--color-surface-inset: #0d0805;
--color-border-subtle: #342116;
--color-border-default: #5b3d27;
--color-border-bronze: #966c3e;
--color-border-gold: #c0955b;
--color-text-primary: #f3e8d6;
--color-text-secondary: #cbb89e;
--color-text-muted: #a28b70;
--color-text-disabled: #75624e;
--color-accent-bronze: #b1814e;
--color-accent-gold: #e1bc6e;
--color-accent-silver: #baa998;
--color-state-success: #87b36f;
--color-state-danger: #b45e55;
--color-state-warning: #c79a54;
--color-element-fire: #d58a82;
--color-element-water: #82aebd;
--color-element-air: #d5bd78;
--color-element-earth: #829b72;
--color-rarity-common: #8494a2;
--color-rarity-uncommon: #5b7563;
--color-rarity-rare: #536f8b;
--color-rarity-epic: #705d83;
--color-rarity-legendary: #9a7e47;
--color-rarity-mythic: #956055;
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-7: 32px;
--radius-sm: 4px;
--radius-md: 6px;
--radius-card: 10px;
--radius-pill: 999px;
--shadow-panel: 0 8px 22px rgb(0 0 0 / 34%);
--shadow-fixed: 0 8px 24px rgb(0 0 0 / 46%);
--shadow-card: 0 4px 12px rgb(0 0 0 / 38%);
--type-h1: 20px / 24px;
--type-h2: 16px / 20px;
--type-card-title: 14px / 17px;
--type-body: 13px / 18px;
--type-secondary: 12px / 16px;
--type-caption: 11px / 13px;
--type-value: 18px / 22px;
```

### Token rules

- Base UI chrome uses warm tokens; element/rarity tokens are scoped to cards and status indicators.
- No raw red/green/blue large surfaces without a documented semantic reason.
- Gold is active/focus/important reward; bronze is structure; silver is currency/neutral metal.
- Text color and font size are semantic roles, not one-off values per screen.

## 13. Top 20 Fixes

| # | Fix | Impact | Difficulty | Screens/components |
|---:|---|---|---|---|
| 1 | Зафіксувати canonical warm semantic color map. | High | M | Global tokens, all screens |
| 2 | Розкласти CSS на зрозумілі cascade layers і прибрати duplicate late overrides. | High | L | `global.css`, Guild CSS |
| 3 | Ввести shared Button primitive з `primary/secondary/ghost/disabled` і sizes. | High | M | Tasks, Duel, Arena, Shop, Guild |
| 4 | Додати 44×44px hit-area wrappers для compact controls. | High | S/M | Back, filters, tabs, inline actions |
| 5 | Переробити Tasks CTA з 29px на доступну висоту й читабельний label. | High | S | `DailyTaskRow`, Tasks |
| 6 | Виправити контраст Guild ribbon title. | High | S | Guild heading, `RibbonTitle` |
| 7 | Явно підключити Lugatype або прибрати його з fallback-ланцюжка. | High | S/M | Global typography |
| 8 | Приглушити Shop CTA/surface colors; rarity залишити в border/accent. | High | M | Shop offers |
| 9 | Приземлити Battle Pass palette в Cardastika warm system. | High | M | Battle Pass |
| 10 | Дати Duel matchmaking виразний progress/status/cancel state. | High | S/M | Duel search |
| 11 | Підняти critical microcopy до 11–13px і задати semantic minimums. | High | M | Forge, Tasks, BP, Guild, Collections |
| 12 | Показувати зрозумілий XP value в HUD або зробити XP line свідомо декоративною. | Medium | S | TopHud |
| 13 | Позначити future tabs/actions як `Незабаром`, а не як повністю доступні. | Medium | S | Shop, Guild, Settings |
| 14 | Уніфікувати h1/h2/section heading scale. | Medium | M | Profile, Guild, Campaign, Settings |
| 15 | Нормалізувати panel border/radius/shadow variants. | Medium | M | Shared panels, screen CSS |
| 16 | Прибрати `Segoe UI !important` з Guild або задокументувати окремий type role. | Medium | S | `guild-polish.css` |
| 17 | Зробити один pattern для horizontal filters із scroll і доступним wrapper. | Medium | M | Equipment, Inventory, Collections |
| 18 | Перевірити всі modals на max-height, focus, back/Escape і safe-area. | Medium | M | Daily login, tutorial, shop dialog |
| 19 | Пройти win/lose/result states у реальному локальному flow. | Medium | M | Duel, Arena, Dungeon, Campaign |
| 20 | Уніфікувати empty/locked/error state composition і next-step CTA. | Medium | M | Leagues, Inventory, Settings, Boss, Guild |

## 14. Implementation Plan

### Phase 1 — Readability and P1 UX

1. Виправити Guild title contrast.
2. Збільшити Tasks actions і critical compact controls.
3. Підсилити Duel search feedback.
4. Прибрати mixed-language CTA.
5. Перекласти environment/provider errors у user-facing copy, залишивши technical detail для logs.

### Phase 2 — Foundations

1. Ввести canonical tokens із розділу 12.
2. Ввести shared Button primitive і semantic text roles.
3. Зафіксувати 44px interactive baseline.
4. Визначити CSS layer ownership.
5. Додати explicit font loading або остаточно вибрати стабільний fallback.

### Phase 3 — Visual system consolidation

1. Приглушити Shop rarity/action palette.
2. Узгодити Battle Pass і Dungeon accents із warm shell.
3. Нормалізувати panel/radius/shadow variants.
4. Уніфікувати headings, filters і empty states.

### Phase 4 — Screen cleanup

1. Forge: зменшити щільність і підняти material/action readability.
2. Tasks: вирівняти action hierarchy й rewards.
3. Guild: прибрати reference/legacy drift і згрупувати roadmap rows.
4. Profile/Deck/Collections: розв’язати великі порожні зони та слабкі placeholder blocks.

### Phase 5 — Regression and Telegram QA

1. Зробити screenshot matrix для 375/390/425/768/1024/1440.
2. Пройти loading, empty, error, modal, locked, win і lose states.
3. Перевірити клавіатуру/focus, text zoom, safe-area і color-only states.
4. Відкрити Mini App через Telegram і перевірити authenticated `TopHud`.
5. Порівняти localhost із public tunnel лише після локальної стабілізації; production не чіпати без явного підтвердження.

## Chat summary

### Найбільші проблеми зараз

1. UI-система розмазана по великому каскаду і screen-specific overrides.
2. Shop/Battle Pass/Guild частково виходять із warm Dark Clean Fantasy через cyan, green, blue, purple і надмірний glow.
3. Tasks, Forge, filters, back/edit/details controls занадто дрібні для mobile.
4. Guild ribbon title має слабкий контраст.
5. `Lugatype` використовується без доведеного `@font-face`, тому typography нестабільна.

### Що не треба змінювати

- dark world-tree/dragon shell і центрований 430px desktop canvas;
- persistent `TopHud` і рівно три `BottomNav` items;
- card art як головний visual anchor;
- warm bronze/gold/wood identity;
- чесні empty/locked states і поточну інформаційну архітектуру без причини.

### Найбільший impact

Найбільший ефект дадуть не нові декоративні assets, а спільні tokens + Button primitive + читабельний type scale + 44px hit areas. Це одночасно підтягне десятки screens і зменшить майбутній CSS drift.

### Верифікація аудиту

Перевірено локальний client/server, PostgreSQL-backed authenticated dev seed, routes і state-driven Guild subviews; у browser console під час проходу не було актуальних `error`/`warn`. Перевірено viewport’и 375/390/425/768/1024/1440px. Public Mini App повертав Cardastika, а public `POST /api/auth/telegram` доходив до server і повертав очікуваний 401 на invalid init data.

Full test suite not run — change is isolated and low-risk; targeted verification was sufficient.
