# Карта проєкту (читати першою)

Швидка навігація для агентів (Claude, Codex) і людей. Відкривається в Obsidian як vault з кореня репозиторію — `[[...]]` ведуть на нотатки в `docs/`.

## Як шукати код

1. `graphify query "<питання>" --budget 800` — граф коду в `graphify-out/graph.json` (локальний, у git не лежить).
2. `graphify explain "<символ>"`, `graphify path "A" "B"`, `graphify affected "<символ>"` — зв'язки і вплив змін.
3. Тільки якщо граф не відповів — точковий `grep`.
4. Візуально: `graphify-out/graph.html` (граф як в Obsidian), `graphify-out/GRAPH_REPORT.md` (хаби і кластери).

Шари: [[client]] · [[server]] · [[game-core]] · [[shared]]. Правила роботи — `AGENTS.md`, архітектура — [[architecture]].

## Шаблон фічі

Кожна фіча `X` проходить однаковий шлях:

`shared/src/X.ts` (типи/контракт) → `server/src/X/` (route + service, авторитетний) → `game-core/src/X.ts` (чисті правила) → `client/src/telegram/X.ts` (API-адаптер) → `client/src/screens/XScreen.tsx` (UI) → `docs/X.md` (правила).

## Фічі

| Фіча | Документ | Примітки |
|---|---|---|
| Дуелі | [[duel]] | кулдаун: `server/src/duel/duelCooldown.ts`, міграція 081; скидання перерви за золото й автобої — `game-core/src/duelPaid.ts`, `DuelService.resetBreak`/`autoPlay`, міграція 090 |
| Арена | [[arena]] | `ArenaScreen.tsx`, `game-core/src/arena.ts` |
| Турнір | [[tournament]] | `tournamentPvp.ts`, `screens/tournament/` |
| Кампанія | [[campaign]] | `CampaignScreens.tsx` |
| Гільдія | [[guild-mvp]] · [[guild-war]] | `screens/guild/`, `guildRaid.ts`; війни — `guildWarService.ts`, `guildWarCombat.ts`, `guildWarCrystal.ts`, `guildWarTickRoute.ts`, `game-core/src/guildWar.ts`, `GuildWarScreen.tsx`, `GuildWarCombat.tsx`, міграції 103–104; рейди на зміїв — `dragonRaidService.ts`, `game-core/src/dragonRaid.ts`, `GuildDragonScreen.tsx`; відьми й скарб — `guildRaidService.ts`; алтар — `altarService.ts` |
| Колекції | [[collections]] | `collectionModifiers.ts`, `tools/card-catalog/build-catalog.js` + `collection-copy.js` → `catalogData.generated.ts`, статуси й бонуси; зимова подія — `server/src/collections/winterReinforcement.ts`, `WinterFestiveMark.tsx`, `winter-festive.css`; міграція підписів 105; `CollectionEntry.tsx`, `CollectionPage.tsx` |
| Карти, прокачка | [[card-progression]] · [[card-catalog-v2]] · [[game-rules]] | `cardProgression.ts`, `deckBalance.ts`; «Поглинути слабкі» — `selectBulkAbsorption` + `absorb-weak` у `cardProgressionService.ts`; джерела магії `el_*`: `isMagicSourceCode`, сила 1, `createMagicSourceInstance`, видача за турнір; інші канали ще ні — [[card-progression]] |
| Колода, додаткові карти | [[ui]] · [[reference-elem-guardian-dragon]] | `DeckScreen.tsx`; «Додаткові карти» — `DeckExtraCards.tsx` + `extraCards` у `PlayerDeckResponse` (`shared/src/deck.ts`, `playerDeckRoute.ts`, карта гільдії з `loadGuildCardForMember`; союзник і гоблін — закриті заглушки); компактний дракон — `DeckDragonBlock.tsx`, `hooks/useGuardianDragon.ts` |
| Арт карт | [[card-art-workflow]] | |
| Екіпірування | [[equipment-manual]] | `equipment.ts`, `EquipmentScreen.tsx`, Алебарда та бонуси колекцій артефактів; розрахунок ударів на арені й у турнірі — `game-core/src/arena.ts` |
| Дракон-захисник | [[reference-elem-guardian-dragon]] | `game-core/src/guardianDragon.ts`, `server/src/guardianDragon/`, міграції 091, 093 і 095 (рівень полум'я: `flame/absorb`, `flame/upgrade`), `GuardianDragonScreen.tsx` + `GuardianDragonTabs.tsx` (походи, битви, магія; вхід із меню головної) |
| Навала Шуліки | [[reference-elem-invasion]] · [[invasion]] | 24 глобальні боси, цикли 9 с; правила `game-core/src/invasion.ts`, контракт `shared/src/invasion.ts`, гейт `isInvasionUnlocked` (ліга 12), сервер `server/src/invasion/`, міграція 098, екран `screens/invasion/InvasionScreen.tsx` |
| Battle Pass | [[battle-pass]] · [[battle-pass-redesign]] · [[reference-elem-diamond-rewards]] | `battlePassService.ts` у корені `server/src` |
| Щоденні нагороди | [[daily-login-rewards]] | `dailyRewardsService.ts` |
| Косметика | [[cosmetics]] | |
| Референс гільдії | [[reference-elem-guild]] | правила гільдії, казни й досвіду з довідника elem.mobi; `treasuryService.ts`, `guildService.ts` |
| Референс рейдів | [[reference-elem-raids]] | 8 рейдів на драконів (лігва, респаун, очки драконоборця) і відьми 1–25 (лікування, прокляття, клад, вівтар); наш код — `guildRaidService.ts` |
| Референс бонусів колекцій | [[reference-elem-collections]] | правила кожної колекції з довідника elem.mobi; `collectionModifiers.ts`, `equipment.ts` |
| Налаштування профілю | [[reference-profile-settings]] | референс: анкета, аватар, облік, оформлення; `avatarCatalog.ts` |
| Пошук Google (SEO) | [[seo-indexing-fix-2026-11-04]] | мовні сторінки `client/public/{uk,ru,de}/index.html` + `client/public/landing/landing.css`, hreflang у `client/index.html` і `sitemap.xml`; кнопка «Грати» веде на `/?lang=xx` (`getEntryLocale` у `client/src/i18n.tsx`) |
| Магазин: Свята | [[holiday-shop]] | календар і набори в `shop_holidays`, міграція 089; `holidayShopService.ts`, `HolidayShopSection.tsx`; зимові бонуси — `server/src/collections/winterReinforcement.ts` |
| Магазин: Колекції тижня | [[collection-packs]] | 10 пачок, 2 на тиждень, описи, повна колекція + випадкова карта; `game-core/src/collectionPacks.ts`, `server/src/shop/collectionPackConfig.ts`, `collectionPackService.ts`, міграція 096, `CollectionPacksSection.tsx` |
| Лавка скринь | [[chest-shop]] · [[chest-art-prompts]] | 15 скринь за срібло, раз на тиждень на 4 год; `game-core/src/chestShop.ts`, `server/src/shop/chestShopService.ts`, `ChestShopScreen.tsx`, анімація `components/ChestOpening.tsx`, міграція 092 |
| Сповіщення (push) | [[notifications]] | бот Telegram, sweep `/api/internal/notifications/sweep` (`CRON_SECRET`); `server/src/notifications/`, тексти `server/src/bot/notificationTexts.ts`, міграція 094, `NotificationSettingsSection.tsx` у налаштуваннях |
| Онбординг новачка | [[duel]] · [[ux-new-player-audit-2026-09-06]] | навчальна дуель `components/TutorialOverlay.tsx` (слайди, пара навпроти), `hooks/useTutorial.ts`, `components/ElementCycle.tsx` (легенда, «?» у дуелі); наступний крок до випробувань `components/TrialsNextStep.tsx` (назва наступного завдання, веде одразу на його екран); підказки-вказівники до завдань `components/TrialGuideHint.tsx` + кроки `onboarding/trialGuide.ts` (мітки `data-tutorial-target`, не блокують натискання); drag-to-scroll мишкою `hooks/useDragScroll.ts` (`data-no-drag-scroll` для своїх жестів) |
| Бустери | [[booster-preview]] | `client/src/booster/` |
| UI-система | [[ui-system]] · [[ui]] | спільні компоненти `client/src/components/` |
| Telegram | [[telegram]] | клієнт `client/src/telegram/`, auth `server/src/auth/` |
| Деплой | [[deployment]] · [[local-development]] | міграції `server/migrations/` |

## Оновлення сітки

- Після змін коду: `graphify update .` (без LLM, безкоштовно).
- Після рефакторингу з видаленням файлів: `graphify update . --force`.
- Нова фіча, новий документ або нова папка → додати рядок у таблицю вище або в нотатку шару.
