# Навала Шуліки (сервер)

Глобальна подія: 24 боси підряд для всього сервера. Правила й числа — `docs/reference-elem-invasion.md`,
чиста логіка — `game-core/src/invasion.ts`, контракт API — `shared/src/invasion.ts`.
Доступ: `isInvasionUnlocked` (Чемпіон III, індекс ліги 12) за `players.duel_rating` / `duel_highest_league_index`.

## Файли
- `server/src/invasion/invasionService.ts` — уся логіка й SQL.
- `server/src/invasion/invasionRoute.ts` — HTTP (маршрути `/api/invasion*`, реєстрація в `server/src/index.ts`).
- `server/src/invasion/invasionHelpers.ts` — чисті хелпери (мапінг, знімки колоди боса, лог); тест `invasionHelpers.test.ts`.
- `server/migrations/098_invasion.sql`.

## Ендпойнти (авторизація як в інших гравецьких маршрутах)
| Метод | Шлях | Що робить |
|---|---|---|
| GET | `/api/invasion` | `InvasionView`. Ліниво створює наступну навалу, завершує відкритий бій мертвого боса, видає карти-призи й підсумок `defeats`. |
| POST | `/api/invasion/attack` `{expectedGold}` | Ручний бій: перерва/ціна по кванту, колода + додаткова (гільдійська) карта, +% сили. |
| POST | `/api/invasion/strike` `{battleId, expectedVersion, slotIndex}` | Удар + контрудар; шкода зменшує HP боса атомарно; смерть боса — призи й наступний бос в тій самій транзакції. |
| POST | `/api/invasion/swap` `{battleId, expectedVersion}` | «Змінити карти» за 10 золота. |
| POST | `/api/invasion/auto` `{expectedGold}` | Автобій: ціна `autoGold`, лічиться як напад, відкритого бою не лишає. |
| POST | `/api/invasion/permit` (без тіла) | «Дозвіл на полювання»: списує 1 дозвіл і вмикає −50% на ціну нападу й автобою проти поточного живого боса. |
| GET | `/api/invasion/guilds` | Топ-50 гільдій за сумарною шкодою поточної навали. |

Помилки: `{ "error": { "code", "message" } }`. Коди: `invalid_request` 400, `unauthorized` 401,
`invasion_locked` 403, `invasion_battle_not_found` 404, `invasion_not_active` 404/409,
`invasion_boss_not_ready`, `invasion_battle_active`, `invasion_battle_finished`, `invasion_state_conflict`,
`invasion_slot_not_ready`, `invasion_nothing_to_swap`, `invasion_price_changed`, `invasion_deck_invalid`, `invasion_permit_none`, `invasion_permit_active`,
`insufficient_gold` (усі 409), `database_unavailable` 503, `internal_error` 500.

## Таблиці
- `invasion_events` — навала (`number`), поточний бос, його HP, `boss_appears_at`, заморожена колода `boss_deck`, `finished_at`.
- `invasion_participants` — шкода, суперудари, напади, останні XP/срібло гравця на боса; `defeat_seen_at` — підсумок показано.
- `invasion_battles` — ручний бій (`state` = стан game-core + модифікатори + сила колоди, заморожені при нападі); один відкритий на гравця.
- `invasion_daily_diamonds` — частина алмазів, що йде в денну норму (PK гравець + день UTC, той самий день, що в щоденних нагородах).
- `player_invasion_items` — `hunting_permits` гравця (шляху видачі ще немає, див. нижче); `invasion_permit_activations` — (гравець, навала, бос), де дозвіл увімкнено.
- `invasion_prizes` — карти за смерть боса; екземпляр створюється при першому відкритті сторінки (`instance_id`, `seen_at`).

## Потік
1. GET читає подію й бій без блокувань; коротку транзакцію з блокуванням бере лише коли треба писати:
   `ensureEvent` (advisory-lock; нова навала на найближчу парну годину UTC) або завершення бою, чий бос уже мертвий.
   Дії (удар, напад, автобій, зміна карт) — коротка транзакція з записом і COMMIT, потім окреме читання для відповіді.
2. Порядок блокувань у записах: рядок події → бій гравця → гравець → рядки учасників. Видача призів — окрема транзакція без блокування події (спершу гравець).
3. Удар: `UPDATE invasion_events SET boss_health = boss_health - LEAST(...)`; якщо HP = 0 — `resolveInvasionPrizes`, рядки в `invasion_prizes`, наступний бос (пауза `getInvasionPauseAfterBoss`) або `finished_at` після 24-го.
4. Кінець нападу (HP гравця 0, бос помер, автобій): XP = шкода/2, срібло = шкода/сила колоди × K боса, з бонусами досвіду/срібла й бустами, як у дуелях; рівень-ап дає золото.
5. Бос помер під час чужого удару — бій гравця завершується при його наступному запиті, нагорода за вже завдану шкоду виплачується.

## Припущення й відкладене
- Бонус колекцій береться зі scope `guild_raid` (найближчий PvE; `all_battles` діє); HP дракона-охоронця не додається.
- Кінець нападу (ручного й автобою), в тій самій транзакції, що XP/срібло: алмази (`getInvasionAttackDiamonds`: 2 за напад до денної норми 8, 16 з колекцією «Шукачі скарбів», плюс випадкові 1–5) йдуть у `player_battle_pass_state.diamonds`; у `lastResult.diamonds` і `diamondsToday {norm, limit}`.
- Гільдійський досвід: після XP викликається `GuildActivityRecorder.recordActivity(..., "invasion_attack", "invasion:<id бою | auto:<uuid>>", xp)`; міграція 098 додає `invasion_attack` у обидва CHECK (список із 088, де `dragon_raid` уже є).
- «Улюбленець фортуни»: при смерті боса учасники з SUM(super_strikes) ≥ 100 за всі навали передаються в `resolveInvasionPrizes`.
- «Дозвіл на полювання»: ціна в `quoteInvasionAttack` (view, напад, автобій) береться з `huntingPermit`, якщо є запис в `invasion_permit_activations` для поточного боса. Джерело дозволів у референсі — VIP-трек «Алмазних нагород», якого ще немає: видачі нема, лише сховище й активація.
- Досягнення `urfinBossDamage/SuperStrikes/CardRewards/DamageRank` рахуються в `achievementProgressService` з `invasion_participants` і `invasion_prizes`.
- Інтеграційний тест `invasionService.integration.test.ts` проганяється лише на локальній БД (127.0.0.1/localhost; інакше пропускається): одне вбивство при паралельних ударах, завершення застарілого бою один раз, призи один раз, захист ціни.
