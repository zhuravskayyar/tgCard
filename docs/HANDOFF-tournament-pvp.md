# Handoff: PvP tournament, results screen, player avatars (2026-11-09)

Context for the next agent (Codex or Claude). Branch `equipment-forge-mage`. **Nothing is committed or pushed.** Follow `AGENTS.md`: local-first; push or deploy only after an explicit «пуш» / «можна в прод»; the user reads only Ukrainian. Detailed rules live in `docs/tournament.md`.

## Done (local)

### 1. Real PvP tournament (replaces the old bot run)
- User decisions: real players only, no bots in production. Entry from duel league «Підкорювач III» (the reference's 2000 duel rating = third epic). A full tie is settled by a stable coin flip. Rating "as in the reference": the forum gives only the factors, so the formula is our adaptation.
- `game-core/src/tournamentPvp.ts` (+ `tournamentPvp.test.ts`): duel→tournament rating scale (`toTournamentRatingScale`), rating formula, fixed stage slots (20 s buff window + 3:40 round), event plan (qualifier + single-elimination bracket + third-place match; cancelled when fewer than 2 players), finishes for prizes, and a duel where each side sees the opponent's cards in its own order. Also: strike exchange, one free card change, timeout, artifacts, and tournament collection bonuses (`TOURNAMENT_COLLECTION_EFFECTS`).
- `game-core/src/tournament.ts`: `resolveTournamentTimeout` takes `{ damage, remainingHp }`. Equal damage means more HP wins (forum rule), then a coin flip.
- `shared/src/tournament.ts`: new lobby, run, actions, awards and podium contracts.
- `server/src/tournament/tournamentService.ts` + route:
  - The coordinator is lazy (Vercel is serverless): every lobby or run request starts, pairs and settles under a row lock on the event.
  - API: `GET /api/tournament`, `POST /register`, `POST /unregister`, `GET /run`, `POST /run/action` (buff | attack | change), `GET /awards`, chat. Dev only: `POST /dev/schedule`.
  - Rewards: rating and XP after each fight, one-time silver for a new sub-league.
  - Prize paid once (`rewarded_at`): a card for Conquerors, diamonds into the battle-pass season. Sources are recorded but not paid, because the game has no sources yet.
- Local dev only (`devTools` / `sparringPartner` = NODE_ENV ≠ production):
  - The duel-league entry gate is off.
  - «Тестовий турнір за хвилину» also registers a «Спаринг-партнер» account, which strikes about every 3 s.
- Migrations:
  - `076_tournament_pvp.sql` drops `tournament_runs` and adds profiles, events, entries and matches.
  - `077_tournament_collection_labels.sql` updates collection labels.
  - **Both are applied to the local DB only**, file by file. Do not run `npm run migrate`: it also tries 064/065, which are guarded relaunch resets. On Neon, apply 076 and 077 by hand after the push.
- Collections: the generator `tools/card-catalog/build-catalog.js` and `server/src/collections/catalogData.generated.ts` drop the "запрацює…" suffix for sea_masters, horde, sky_heroes, forest_dwellers, ugiants and wizards.

### 2. Client
- `TournamentScreen`, `TournamentLobby`, `TournamentRun`, `TournamentRules`, `tournament.css`, `telegram/tournament.ts`.
  - The home «Турнір» tile is enabled and routes to `/tournament`.
  - The lobby has sign-up and cancel with the participant count, plus «До турніру» / «Результати турніру».
  - Лобі також показує останній завершений п’єдестал тієї ж ліги над відліком; якщо подій ще не було, залишається трофейний блок. Екран і підсумки використовують спільний `TournamentPodium`; підліга кожного призера обчислюється з рейтингу на старті події.
  - Після дій у лобі є кнопка «Оновити», далі — правила й чат.
  - The run view polls about every second.
  - The battle reuses the shared `DuelBattle`, which got a new `animateExchange` prop so only own strikes fly. Buffs, the change-cards medallion (`trials/medallion-v1.webp`) and server-clock countdowns are there.
- Results screen in the reference order:
  - First place: an avatar in the laurel frame `duel-search/medal-frame-v1.webp` (oval opening measured at centre 256,273, 324×304), name, guild, and a cup slot.
  - Centre: the champion's `ProfileMage`, coloured by the deck element.
  - Places 2 and 3 side by side, place 4 below, a «· Ти» tag on the viewer's place.
- Cups load from `/assets/ui/tournament/awards/<league>-cup_<n>.png`. All 24 league sprites and the shared participant medal now exist as transparent 512×512 PNGs.
- Profile «Кубки й медалі» cabinet renders the earned badge sprites and counts from `GET /api/tournament/awards`.
- The profile «Турнір» card shows rating, cups and medals (`GET /api/tournament/awards`).
- Duel result title: «ПЕРЕМОГА/ПОРАЗКА» is now translated before it is split into letters (`DuelScreen` `DuelOutcomeHeader`), so the English UI shows VICTORY / DEFEAT.
- HUD avatar: the clasp ring opening is an oval (inner brass edge x 146–390.5, y 34.5–289 in the 1988×330 sprite). `.player-avatar` is now 236×246 at centre 268.2,161.8 (`home-menu.css`).

### 3. Default player avatars
- All 20 two-tone ink portraits live in `client/public/assets/ui/avatars/avatar-01..20.webp` (320×320). The original generated PNGs and contact sheet for 17–20 are in `.runtime/generated-art/avatars/`; prompts and character list are in `docs/default-avatars-sprites.md`.
- `client/src/components/avatarCatalog.ts`:
  - `"avatar:NN"` is an explicitly chosen portrait.
  - A Telegram photo stays as it is.
  - A missing photo (or a `/card-art/` value) gives a stable portrait by FNV hash of the player id.
- Wired into:
  - `AvatarImage`, which also falls back to the default portrait when a photo fails to load;
  - `TopHud`, `LeaderboardScreen`, `PlayerProfileScreen`, `ProfileScreen`, `GuildProfile`, the tournament podium;
  - the duel and arena `PlayerAvatar`, which takes a seed. `DuelSideSnapshot.playerId` was added and is filled in `duelService.loadDuelParticipant`.
- Bots keep card art and `bot-avatar:NN`.

### 4. Duel names and KostaKod card
- Real duel snapshots use the player's nickname, then Telegram username, then first name. The nickname path is covered by `duelService.integration.test.ts`.
- The supplied KostaKod art is integrated as `client/public/card-art/kostakod.webp`. `Костакод` is one legendary Earth card in the one-card `twitch_legends` collection and is included in the legendary shop pool. Its local card row was verified as shop-eligible; no deck was changed.
- The name issue from the battle screenshot was that real-player battle snapshots showed only `first_name`; now they share the normal player-name fallback order.

## Checks run
- `npm run test --workspace game-core`: 109/109.
- `npm run test --workspace @cardastika/server`: 168/168, including tournament unit/integration, collections, shop, duel and the rest of the server suite.
- `npm run check:i18n -- --all-locales`: 0 untranslated phrases. Root production build passed, and the client production build passed again after the final profile accessibility fixes; client output has the existing >500 kB chunk warning.
- Local browser check on `http://localhost:5173/tournament`: the home tile opens the lobby; the latest league podium, countdown, registration window and empty chat state load. No tournament action was submitted.
- Independent UI review found no remaining layout issues. It checked the podium name wrapping, measured laurel opening, portrait proportions, award asset paths, mobile widths, empty/error/loading/success states and screen-reader status. The 4-player layout was checked in code.
- Production website/Telegram checks are deferred until an explicitly authorized push.

## Open / next steps
1. Tournament schedule stays on GMT (user decision 2026-11-11). Do not switch to Moscow time.
2. Avatar picker: done 2026-11-11 (Profile → «Налаштування профілю» → «Вибрати аватар», 20 portraits, POST /api/player/avatar). Telegram login keeps a chosen `avatar:NN`. Not done: letters option and a way back to the Telegram photo.
3. Not done: Champions League (weekly qualifier, its own rating, double elimination on the server), the items «Настойка» and «Фокус-покус» (the game has no consumables), altar, ally, dragon magic, and paying sources.
5. Phone testing: `npm run phone` serves http://192.168.0.126:4173 over Wi-Fi. Over USB it is `adb reverse tcp:4173 tcp:4173` (adb is in `.runtime/platform-tools`), then localhost:4173. The localhost and Wi-Fi addresses keep separate logins.
