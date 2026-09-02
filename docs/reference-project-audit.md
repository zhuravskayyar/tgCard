# Аудит elem.mobi → Cardastika

Дата знімка: **31.08.2026**.

Цей документ фіксує розбіжності між доступним read-only станом `elem.mobi` та
поточною локальною реалізацією Cardastika. Референс перевірявся через браузер і
через bounded same-origin crawler. Приватні повідомлення, cookies, localStorage,
форми та mutation-запити не збиралися.

Позначення:

- **[D]** — є розбіжність верстки або логіки;
- **[R]** — функція є в референсі, але свідомо не входить у поточний MVP;
- **[U]** — потрібен додатковий fixture, скриншот або узгоджене правило.

## Стан збору

Парсер доступний через:

```text
GET /api/reference/guild-forum?scope=full&maxPages=250&maxDepth=6
```

Він обходить тільки same-origin read-only посилання, не виконує дії, має ліміт
сторінок/глибини, timeout 5 секунд і максимум 4 паралельні запити. Якщо сайт
віддає тільки rate-limit shell, endpoint повертає `503`, а не записує цей shell
як достовірний snapshot. У живому запуску браузерні сторінки були доступні, але
серверний повний crawl частково уперся в rate limit — тому приватні або
тимчасово недоступні дані позначені **[U]**, а не вигадані.

Поточний parser/endpoint:

- `game-core/src/guildForumReference.ts` — класифікація сторінок і фільтр
  mutation-посилань;
- `server/src/reference/guildForumReferenceService.ts` — bounded crawl,
  snapshot і автоматичний logic report;
- `server/src/reference/guildForumReferenceRoute.ts` — API-параметри;
- `docs/reference-guild-forum.md` — формат snapshot та обмеження збору.

## 1. Загальна верстка та shell

### Референс

`elem.mobi` використовує вузький фіксований ігровий viewport по центру сторінки,
темний legacy UI, щільні чорні/сині панелі, зелені акценти, sprite-подібні
іконки, fantasy background і повторюваний верхній HUD. На головній також є
блок свіжих новин/сповіщень, а внизу — компактна іконкова навігація та текстові
службові посилання.

### Cardastika

Cardastika має власний responsive dark clean fantasy / mythic temple напрямок,
повторювані `TopHud` і `BottomNav`, більше повітря, великі картки й українську
типографіку. Це правильна база для власного стилю, але вона не повторює щільний
legacy rhythm референса.

Розбіжності:

- **[D]** ширина й щільність: референс — fixed/narrow і dense, локально —
  responsive/card-based;
- **[D]** shell: обидва мають верхній HUD і нижню навігацію, але в референсі
  більше глобальних notification/news/footer блоків;
- **[D]** навігація: референс має багато прямодоступних системних пунктів,
  Cardastika тримає три постійні пункти `Головна / Профіль / Гільдія`;
- **[D]** assets: референс використовує legacy sprites, Cardastika — власні
  SVG/PNG іконки та guild asset pack;
- **[U]** для точного стилістичного порівняння потрібні скриншоти одного viewport
  у двох проєктах: 390×844 і 412×915.

## 2. Порівняння вертикальних зрізів

| Зріз | Що видно в референсі | Cardastika зараз | Висновок |
|---|---|---|---|
| Home | live-повідомлення, новини, події, duel/campaign/tournament/arena/deck/Urfin/tasks/diamond/equipment/collections/ratings/shop | hub із локальними картками, daily login і доступними локальними системами | **[D]** потрібно окремо вирівняти інформаційну ієрархію та event feed |
| Profile | гільдія/роль, guild bonuses, deck power, mail, deck, equipment, records, titles, medals, tournament rewards, achievements, рейтинги | профіль, рейтинг/ліга, нагороди та guild bonus state без бойових guild bonuses у MVP | **[D/R]** базовий профіль є; додаткові guild-specific блоки відкладені |
| Deck / cards | deck, collection, card improve, elements, extra cards, guild/ally battle additions | deck із правилом 9 карт та `3/2/2/2`, collections, card detail, shop | **[D/R]** extra guild/ally cards не переносити в MVP |
| Duel / campaign | основні бойові режими, з яких референс також отримує guild activity/XP | локальні duel/campaign services уже існують; guild XP інтегрований у завершені активності | **[U]** потрібні спільні acceptance fixtures для одного результату бою |
| Arena | окрема арена, сезонність/рейтинги та guild arena | локальна Arena є, guild arena відсутня | **[R]** guild arena виключена з Guild MVP |
| Dungeon | підземелля й нагороди | локальна Dungeon screen і server flow | **[U]** потрібне порівняння reward/empty/error states на одному акаунті |
| Equipment | equipment і пов’язані картки/бонуси | локальні Equipment, Inventory та Forge | **[D/U]** перевірити exact layout, filters і item detail fixtures |
| Collections | колекції, progress, card detail | локальні Collections/Collection detail/Card detail | **[D/U]** звірити card grid, locked state і progress copy |
| Daily / diamond rewards | daily tasks із множником наступного дня; diamond reward season/VIP | локальні Tasks і Battle Pass/Lariska daily login | **[D]** механіки вже близькі, але shell/copy/reward presentation різні |
| Tournament / Urfin | доступність залежить від ліги; окремі сторінки та правила | route/screen частково локалізовані або показують майбутній стан | **[D/R]** не змішувати з Guild MVP |
| Forum | 7 категорій, moderators, topics/posts, read/unread/pagination | форум ще не реалізований | **[R]** другий vertical slice |
| Rules / moderation | окремі правила форуму/чату та загальні game prohibitions | потрібен окремий Cardastika policy документ | **[U]** підготувати українські правила й moderation roles |

Публічний зміст основних систем зібраний у [About index](https://elem.mobi/about/),
а правила — на сторінці [Rules](https://elem.mobi/rules/).

## 3. Гільдії: точні розбіжності логіки

### Те, що збігається

- **unlock level:** референс — з 10 рівня; Cardastika — `unlockLevel = 10`;
- гравець не може створити/вступити, перебуваючи в іншій гільдії;
- локально є реальні API, PostgreSQL state, заявки, cooldowns, ролі,
  permission map і dev seed;
- локальний shell зберігає persistent `TopHud`/`BottomNav` і не дублює їх у
  Guild screen.

### Те, що розходиться або свідомо відкладено

- **[D] Guild element:** у референсі гільдія має elemental affiliation; у
  Cardastika `themeElement` опціональний, декоративний і не дає бонусів.
- **[D] Guild XP:** у референсі публічний опис прив’язує розвиток до досвіду від
  дуелей; у Cardastika XP отримується за duel/campaign/dungeon/arena rewards,
  із config-driven значеннями і лімітом 300 XP на гравця на добу.
- **[D] Level bonuses:** у референсі рівень гільдії дає бонуси до срібла/досвіду;
  у Cardastika Guild MVP бойові та економічні бонуси заборонені.
- **[D] Member cap:** у перевіреній гільдії референса було 49 місць на level 51;
  у Cardastika стартове правило — 30 місць і майбутнє збільшення рівнями.
  Значення 49 не можна копіювати як стартовий баланс.
- **[D] Rank ladder:** референс показує `магистр → маршал → архимаг → боевой
  маг → адепт → неофит`; Cardastika має `Лідер / Офіцер / Ветеран / Учасник /
  Новачок` і незалежний permission set.
- **[R] Guild card:** у референсі окрема guild card має power, level, loyalty,
  treasury/deck links і обмеження на поглинання/upgrade після 3 днів; у MVP її
  немає.
- **[R] Treasury:** у референсі є внески, статистика та правило доступності
  внесків після 3 днів; у MVP немає казни.
- **[R] Altar:** тимчасові war/tournament buffs і вибір однієї опції; у MVP
  немає guild buffs.
- **[R] Wars / arena / raids / alliances:** це окремі бойові вертикалі референса,
  але вони прямо виключені з Cardastika Guild MVP.
- **[R] Rewards / journal / chats / notice / ratings:** у референсі є guild
  rewards, журнал подій, announcement, guild chat, alliance chat і guild
  ratings; у MVP їх немає.
- **[D/R] Additional battle cards:** референс має додаткові guild/ally cards;
  Cardastika навмисно залишає активну deck схему з 9 карт і без guild combat
  additions.

Фактичні read-only екрани, на яких це перевірено: guild dashboard, info, card,
altar, war, guild arena, raids, treasury, members, rewards, achievements,
journal, notice, guild chat, alliance chat і guild rating.

Публічні правила референса: [Guilds](https://elem.mobi/about/guilds/),
[Guild wars](https://elem.mobi/about/guilds_war/),
[Guild raids](https://elem.mobi/about/guilds_raids/),
[Guild arena](https://elem.mobi/about/guilds_arena/),
[Guild alliances](https://elem.mobi/about/guilds_alliances/).

## 4. Форум: що потрібно буде відтворити другим зрізом

У референсі є 7 глобальних категорій: новини, загальний розділ, допомога по
грі, гільдії, творчість, RolePlay/Мафія і таверна. Для гільдії окремо видно
гостьовий/public форум і закритий внутрішній форум. Також є topic/post view,
moderators, pagination, read/unread state, guild chat та alliance chat.

Cardastika forum MVP не має. Його краще будувати окремим vertical slice:

1. forum index + category;
2. topic list + topic view;
3. create/reply/read state;
4. guild public/private sections;
5. moderation and report state;
6. guild chat only after forum data model стабілізовано.

Джерела для поведінкових edge cases: [guild guide](https://elem.mobi/forum/7/66510/),
[applications](https://elem.mobi/forum/7/66566/),
[roles](https://elem.mobi/forum/7/66460/),
[leave and leadership](https://elem.mobi/forum/7/66571/),
[guild XP and levels](https://elem.mobi/forum/3/8099/),
[crests](https://elem.mobi/forum/3/63229/).

## 5. Що потрібно надати для копіювання у стилі Cardastika

### Дані та рішення

1. **Пріоритети екранів:** які зони робимо після Guild MVP: forum index,
   category, topic, guild chat, guild card чи treasury.
2. **Канонічний український copy deck:** назви ролей, дій, помилок, cooldown,
   empty/loading/error states і тон повідомлень.
3. **Approved rules поза MVP:** чи потрібні в майбутньому guild card, treasury,
   altar, guild rewards, journal, wars, raids, arena та alliances; для кожної
   системи — тільки підтверджені числа й переходи станів.
4. **Anonymized fixtures:** гравець без гільдії, level <10, гільдія full/open,
   application pending/expired/rejected, кожна роль, leader-only dissolve,
   member kick, transfer leadership, forum unread/read, empty/error/loading.
5. **Acceptance criteria:** що саме має бути видно на кожному екрані, які дії
   дозволені кожній ролі, які API errors показуються користувачу.
6. **Viewport targets:** мінімум 390×844 і 412×915; бажано також desktop
   preview, якщо Mini App буде відкриватися не тільки на телефоні.

### Асети

Не потрібно надсилати скопійовані картинки референса. Для оригінального
Cardastika asset pack потрібні або затверджені промпти/напрямок, або власні
вихідні файли:

- guild crest/emblem variants — базовий набір уже є, треба затвердити фінальні
  варіанти та правила кольору;
- guild background variants — базовий фон уже є, потрібні темна/світла та
  empty-state версії;
- role badges — базовий набір уже є, потрібно затвердити форму для п’яти ролей;
- forum category, pinned, unread, read, reply, moderator і lock icons — ще
  потрібні;
- guild card, treasury, altar, war, arena, raid, reward і journal icons — ще
  потрібні, навіть якщо частина функцій буде feature-flagged;
- avatar/fallback avatar і privacy-safe placeholder;
- decorative dividers, tabs, pagination, badge states, empty/loading/error
  illustrations;
- Cardastika design tokens: palette, fonts, glow/shadow, border, radius,
  spacing, icon size, background treatment і допустимий contrast.

Власні assets краще передавати як SVG/PNG із вихідним файлом або prompt/source
описом. Це дозволить зберегти Cardastika identity і не переносити буквально
legacy sprite style.

## 6. Рекомендований порядок роботи

1. Зафіксувати layout tokens і shell на двох mobile viewport.
2. Довести Guild MVP до production-like empty/loading/error states.
3. Зібрати forum vertical slice із власною Cardastika візуальною мовою.
4. Після окремого підтвердження додавати guild card/treasury/rewards/journal.
5. Wars, raids, altar, guild arena та alliances залишити окремими бойовими
   проєктами, щоб не зламати MVP balance і permission model.

## Висновок

Поточний MVP уже збігається з референсом у базовому unlock point і має власну
серверну модель. Основна розбіжність не є помилкою: `elem.mobi` — значно ширша
соціально-бойова система зі старим щільним shell, а Cardastika зараз свідомо
обмежена гільдіями без combat/economy bonuses і без форуму. Для наступного кроку
потрібні насамперед український copy deck, priority screens, anonymized fixtures
і оригінальні forum/guild assets.
