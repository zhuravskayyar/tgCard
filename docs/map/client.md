# client

React UI. Назад: [[index]]. Дані бере з [[server]] через `client/src/telegram/*`, типи з [[shared]].

- `App.tsx`, `main.tsx` — вхід, оболонка `TopHud` + `BottomNav` (див. `AGENTS.md`).
- `screens/` — екрани, по одному на фічу (`DuelScreen`, `ArenaScreen`, `guild/`, `tournament/`…).
- `screens/invasion/InvasionScreen.tsx` + `telegram/invasion.ts` — «Навала Шуліки» (глобальний бос, [[game-rules]] / `docs/reference-elem-invasion.md`): лобі, реальний бій по циклах 9 с, підсумки; зовнішній вигляд — класи гільдійних рейдів (`guild-raid*`), вхід — плитка «Навала» на головній.
- `components/` — спільні компоненти (`MenuRow`, `BattleAttackAnimation`…). Перевикористовувати, а не дублювати.
- `components/BattleOutcome.tsx` + `battle-outcome.css` — єдиний екран перемоги/поразки (герб, стрічка ПЕРЕМОГА/ПОРАЗКА, плашки нагород, пергамент `battle-outcome-panel`) для дуелі, арени, кампанії, турніру і рейду відьом. Нові режими беруть лише його.
- `telegram/` — API-адаптери по фічах + `authenticatePlayer.ts`.
- `styles/` — CSS по екранах; лише світла пергаментна тема.
- `locales/`, `i18n.tsx` — переклади.
- `api/`, `auth/`, `audio/`, `booster/`, `cards/`, `equipment/`, `records/`, `shop/`, `admin/` — допоміжні модулі фіч.

Правила UI: [[ui-system]], [[ui]].
