# client

React UI. Назад: [[index]]. Дані бере з [[server]] через `client/src/telegram/*`, типи з [[shared]].

- `App.tsx`, `main.tsx` — вхід, оболонка `TopHud` + `BottomNav` (див. `AGENTS.md`).
- `screens/` — екрани, по одному на фічу (`DuelScreen`, `ArenaScreen`, `guild/`, `tournament/`…).
- `components/` — спільні компоненти (`MenuRow`, `BattleAttackAnimation`…). Перевикористовувати, а не дублювати.
- `telegram/` — API-адаптери по фічах + `authenticatePlayer.ts`.
- `styles/` — CSS по екранах; лише світла пергаментна тема.
- `locales/`, `i18n.tsx` — переклади.
- `api/`, `auth/`, `audio/`, `booster/`, `cards/`, `equipment/`, `records/`, `shop/`, `admin/` — допоміжні модулі фіч.

Правила UI: [[ui-system]], [[ui]].
