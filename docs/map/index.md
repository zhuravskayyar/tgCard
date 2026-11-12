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
| Дуелі | [[duel]] | кулдаун: `server/src/duel/duelCooldown.ts`, міграція 081 |
| Арена | [[arena]] | `ArenaScreen.tsx`, `game-core/src/arena.ts` |
| Турнір | [[tournament]] | `tournamentPvp.ts`, `screens/tournament/` |
| Кампанія | [[campaign]] | `CampaignScreens.tsx` |
| Гільдія | [[guild-mvp]] | `screens/guild/`, `guildRaid.ts` |
| Колекції | [[collections]] | `collectionModifiers.ts`, `catalogData.generated.ts` |
| Карти, прокачка | [[card-progression]] · [[card-catalog-v2]] · [[game-rules]] | `cardProgression.ts`, `deckBalance.ts`; «Поглинути слабкі» — `selectBulkAbsorption` + `absorb-weak` у `cardProgressionService.ts`; джерела магії `el_*`: `isMagicSourceCode`, сила 1, `createMagicSourceInstance`, видача за турнір; інші канали ще ні — [[card-progression]] |
| Арт карт | [[card-art-workflow]] | |
| Екіпірування | [[equipment-manual]] | `equipment.ts`, `EquipmentScreen.tsx` |
| Battle Pass | [[battle-pass]] | `battlePassService.ts` у корені `server/src` |
| Щоденні нагороди | [[daily-login-rewards]] | `dailyRewardsService.ts` |
| Косметика | [[cosmetics]] | |
| Референс гільдії | [[reference-elem-guild]] | правила гільдії, казни й досвіду з довідника elem.mobi; `treasuryService.ts`, `guildService.ts` |
| Референс бонусів колекцій | [[reference-elem-collections]] | правила кожної колекції з довідника elem.mobi; `collectionModifiers.ts`, `equipment.ts` |
| Налаштування профілю | [[reference-profile-settings]] | референс: анкета, аватар, облік, оформлення; `avatarCatalog.ts` |
| Бустери | [[booster-preview]] | `client/src/booster/` |
| UI-система | [[ui-system]] · [[ui]] | спільні компоненти `client/src/components/` |
| Telegram | [[telegram]] | клієнт `client/src/telegram/`, auth `server/src/auth/` |
| Деплой | [[deployment]] · [[local-development]] | міграції `server/migrations/` |

## Оновлення сітки

- Після змін коду: `graphify update .` (без LLM, безкоштовно).
- Після рефакторингу з видаленням файлів: `graphify update . --force`.
- Нова фіча, новий документ або нова папка → додати рядок у таблицю вище або в нотатку шару.
