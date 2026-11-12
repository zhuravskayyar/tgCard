# server

Авторитетний Node.js сервер: бої, інвентар, валюти. Назад: [[index]]. Правила рахує через [[game-core]], контракти з [[shared]].

- `index.ts`, `local.ts` — запуск; `http/` — CORS і JSON-хелпери.
- Папки фіч: `duel/`, `arena/`, `tournament/`, `campaign/`, `guild/`, `collections/`, `cards/`, `decks/`, `equipment/`, `shop/`, `inventory/`, `leagues/`, `leaderboards/`, `mail/`, `chat/`, `achievements/`, `cosmetics/`, `boosts/`, `dungeon/`, `trials/`, `referrals/`, `limited/`, `users/`, `admin/`.
- У кожній: `*Route.ts` (HTTP), `*Service.ts` (логіка + БД), `*.integration.test.ts`.
- `auth/` — перевірка Telegram init-data; `bot/` — Telegram-бот.
- `database/` — `pool.ts`, `migrate.ts`, сіди; міграції SQL у `server/migrations/NNN_*.sql`.
- `battlePass*`, `dailyRewards*` — лежать у корені `server/src`.

Деплой і міграції: [[deployment]].
