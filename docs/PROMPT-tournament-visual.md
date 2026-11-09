# Prompt: tournament visual polish (for Codex)

Copy everything below the line into the agent.

---

You are working in the Cardastika repo (React Telegram Mini App card game), branch `equipment-forge-mage`, with uncommitted work in progress. Read first, in this order:

1. `AGENTS.md`. It has priority. Local-first; no push or deploy without the user's explicit «пуш» / «можна в прод». UI work needs an independent sub-agent review. `TopHud` and `BottomNav` stay untouched. Every visual surface is a painted sprite: CSS only for layout and sprite slicing, no CSS-drawn panels, gradients or frames. Keep fixed artwork in its natural proportions.
2. `docs/HANDOFF-tournament-pvp.md`. The current state of the PvP tournament, results screen and avatars, and what is still open.
3. `docs/tournament.md`. The reference rules and what is implemented.
4. `docs/tournament-awards-sprites.md` and `docs/default-avatars-sprites.md`. The sprite plans.

The user reads only Ukrainian: write every reply and all UI copy in Ukrainian, with en/de/ru translations in `client/src/locales/screenTranslations.ts`. Then `npm run check:i18n` must report 0. Light «parchment book» theme only. The reference sets **layout and mechanics only, never colours or style**: our look is aged parchment, brass, leather and ink.

## Reference (another game, `elem.mobi`, for structure only)

Screenshots, not in git:
- `.runtime/reference/tournament/results-reference.png`
- `.runtime/reference/tournament/results-with-next-countdown-reference.png`
- `.runtime/reference/tournament/avatar-style-reference.webp` (the style of our new avatars)

The reference tournament page **between events** is one column, in this order:
1. A ribbon header «Результаты турнира».
2. «Первое место»: a line-label, then the framed avatar, league icon + name, guild + title, and a gold cup on the right.
3. A big silhouette of the champion's mage in the centre.
4. «Второе место» and «Третье место» side by side: name and guild above, framed avatar and cup below.
5. «Четвертое место» centred below.
6. «Следующий начнется через 12 ч 15 м».
7. «Запись откроется за 30 м до начала турнира.»
8. «Обновить».
9. «» Правила турнира «».
10. «Чат турнира».

So the last results live **on the lobby itself**, not behind a button. Note: the reference schedule runs on Moscow time (UTC+3), while ours is GMT. Changing it is the user's decision, pending: do not change `TOURNAMENT_RULES.utcOffsetMinutes` unless the user says so.

## What exists now (see the handoff for files)

- `client/src/screens/tournament/TournamentLobby.tsx` shows a shader trophy (`TournamentTrophy`), a framed details block (`--sprite-panel-frame`), sign-up / cancel / «До турніру» / «Результати турніру» buttons, a rules button and the chat.
- `TournamentRun.tsx` holds the battle (shared `DuelBattle`), the round wait, the results `Podium` and the result lines.
- The podium avatar sits in the laurel frame `client/public/assets/ui/duel-search/medal-frame-v1.webp`: 512×502, oval opening centre 256,273, size 324×304, photo inset 6 px. The centre figure is `ProfileMage` (sprites 1024×1536, 2:3). Cup slots load `/assets/ui/tournament/awards/<league>-cup_<n>.png`; these don't exist yet, and the slot keeps its width.
- Avatars: `client/src/components/avatarCatalog.ts`, `AvatarImage`, 16 portraits in `client/public/assets/ui/avatars/`.
- Reusable art: `ribbon-title-v3.webp` (via `RibbonTitle`), `trials/medallion-v1.webp`, `--sprite-panel-frame`, `MenuRow` rows, `home/sprites/mode-tournament.webp`, `ui/profile/tournament-trophy.png`, league badges (`LeagueBadge`, `TournamentLeagueEmblem`), `ui/game/nav-medallion-v1.webp`.

## Task

Improve the tournament visuals to match the reference structure in our own style. Work in this order, and keep each step small:

1. **Lobby between events:**
   - Fetch the last finished event of the player's league from the server. Add a field to `TournamentLobbyView` with the podium in the existing `TournamentPodiumParticipant` shape, filled in `tournamentService.getLobby`. Don't hardcode anything in React.
   - Render it at the top of the lobby with the same `Podium` component, moved into its own file and shared with `TournamentRun`.
   - Then, as in the reference: next start countdown, the registration note, the action buttons, rules, chat.
   - With no past event: keep the current trophy block.
   - The player's own run results stay behind «Результати турніру».
2. **Names on the podium:** show the player's tournament league badge before the name (`TournamentLeagueEmblem`, small) and the guild below. Add whatever the server needs: the league index from the entry's rating at the event.
3. **Champion mage:** keep `ProfileMage`, sized so the podium fits about one and a half phone screens at 380 px width. Add an element-coloured glow behind it only if a painted sprite exists. Otherwise leave it plain; no CSS halo.
4. **Cups:**
   - Do not substitute other art.
   - If the cup PNGs are still missing, write or refresh the ChatGPT prompts in `docs/tournament-awards-sprites.md` and stop at «чекаємо PNG від користувача».
   - When the PNGs exist: slice them to the documented names, keep 1:1, and show them on the podium and as a cups row in the profile.
5. **Battle and round-wait screens:**
   - Check readability of the stage label, round timer and «Нові карти через …» at 360–412 px widths.
   - The buff choice should read as a clear two-option choice: chosen state, price, «Недостатньо золота» note.
   - Use existing sprite buttons only.
6. **Copy:** natural Ukrainian, consistent terms (бій vs дуель, місце, ліга), no gendered «Ти вибув» forms.

## Rules for assets

Before styling, check that every needed sprite exists and matches. If a frame, plate, cup or medal is missing:
- write a ChatGPT prompt (the user generates PNGs);
- do not build CSS stand-ins;
- do not reuse unrelated art.

If the user asks for one asset, deliver exactly one.

## Verification (proportional, see AGENTS.md)

- `npx tsc -p tsconfig.json --noEmit` in `client` and `server`, and `npm run check:i18n`.
- Targeted server tests: `src/tournament/tournament.test.ts` and `src/tournament/tournamentService.integration.test.ts`. Run the integration test only when `DATABASE_URL` points to the local DB, and never run `npm run migrate`: it tries the guarded 064/065 files.
- The production client build: `npm run build --workspace client`.
- Measure alignment numerically: frame opening vs photo centre, centring of single and paired places, and no horizontal scroll at 360 px.
- An independent sub-agent UI review against the reference screenshots, AGENTS.md and the parchment style. Fix every "must fix" item.
- Do not open the production site or Telegram before an authorised push. For a live local check, use `npm run phone` (http://localhost:4173). «Тестовий турнір за хвилину» adds a local sparring partner, so one tester can produce a finished event.

## Report

Reply in Ukrainian:
- what changed;
- which checks passed;
- what was checked only in code versus live;
- what waits for user PNGs or decisions (UTC+3, cups).

Do not commit or push.
