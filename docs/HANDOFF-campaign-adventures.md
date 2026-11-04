# Handoff for Codex: campaign rebuilt to match elem.mobi 1:1

Read `AGENTS.md` first (local-first workflow, no push without the user's command).
The user only reads Ukrainian: reply in Ukrainian.

## Goal

Replace our current campaign (5 trials from the fairy Лариска, then a separate campaign of
6 stages × 6 quests and one boss "Вовк Сіроманець") with the reference logic, 1:1:
**a chain of 10 locations**. Each location has a story (quest giver + two-line plea), its
own trials, and its own boss. All rules, numbers, trials and boss data are in
**`docs/reference-elem-campaigns.md`** (taken from the elem.mobi manual and a live run).
The user's decisions:

1. **Names:** our own Ukrainian names for locations, givers and bosses. Same themes as
   the reference, not copies. Location 1 stays «Печери гоблінів» with Лариска.
2. **Trials:** copy the reference trials 1:1. Trials that need systems we don't have
   (diamonds in the shop, tournaments/cups, invasion, dragon raids, gifts, chests,
   weekly marathons, "solo dragons") go in as `available: false`. Show them as «Скоро»,
   and write the counting rule into `docs/campaign.md` so they can be built later.
3. **Old progress:** start fresh. Already-claimed fairy trials count as location 1.
   The old 36 quests and the old boss disappear. Rewards already received stay.
   Don't drop the old tables (`player_campaign_state`, `player_campaign_quest_progress`).
   Just stop using them.
4. **Art:** logic first. Use existing catalog card art as giver/boss portraits.
   Afterwards, write ChatGPT prompts for missing art (giver, boss, map icon per location)
   following `docs/card-art-workflow.md` and the parchment style memory.

## Rules (summary, details in the reference doc)

- A location is open when all its trials are claimed. Its boss can then be fought.
  Passed = first boss win. The next location appears after the first win.
- Each claimed trial pays the per-trial gold/silver from the table. The first boss win
  pays the big gold/silver reward plus a card drop. A repeat win after respawn pays only
  a card (plus the usual XP from damage).
- Respawn hours per location (2, 4, 10, then 20). Only the 3 most recently passed
  locations can be refought.
- **Counting:** most trials count all progress since the start of the game. Trials worded
  «ще / ещё», plus the duel-rating trials of locations 9–10, count from the previous
  location's first win (`first_win_at`).
- Quality trials: a higher rarity counts (9 epic accepts legendary/mythic).
- **Boss HP** = the sum of its 9 deck powers. Example: 86+90+93+120+252+257+289+125+124 = 1436.
  Boss decks are 3×3 power lists in the reference doc. Locations 3–10 have them in the
  forum text; copy them from that doc.
- Boss cards are hidden (card backs). Extra deck cards don't take part.
- The deck must pass `validateDeckElementBalance` (3/2/2/2). Pick 9 catalog codes per boss
  with that element mix, and override `finalPower` with the reference power.
- **Card drop:** a random card of the configured rarity (cards table, shop-eligible), at
  the configured level (`createStandardCardInstance`). Record events `CARD_ACQUIRED`
  and a new `CAMPAIGN_CARD_DROP`. The latter is used by trial "get 20 cards in the
  campaign" and the daily task "get 3 cards in the campaign".

## Collections mapping (reference → our code)

| Reference | Our code |
| --- | --- |
| Элементали | `elementals` |
| Древние Драконы | `dragons` |
| Мифические создания | `mythic` |
| Редкие драконы | `dragons2` |
| Высшие маги | `wizards` |
| Колдуньи | `sorceresses` (count owned cards from it for "one/two cards of Witches") |
| Генералы Урфина | `ugenerals` |

Completion lives in `player_collection_completions` (collection_id → `collections.id`;
map by `collections.code`).

## Metric sources already available

- **Events** in `player_campaign_events` (event_type + payload JSON):
  - `DUEL_WON`, `DUEL_FINISHED`, `SHOP_CARD_PURCHASED`, `CARD_LEVEL_UP`, `CARD_ACQUIRED`
  - `CARD_ABSORBED` (payload `absorbedCards`), `ARENA_WON`
- **Duel gold** ("get 10 gold in duels"): add `gold: duelGoldReward` to the
  `DUEL_FINISHED` payload in `server/src/duel/duelService.ts` (~line 908). Also add
  `gold?: number` to `CampaignEventPayload`, then sum it.
- **Player and guild state:**
  - `players.duel_rating`, `players.arena_rating`, `players.level`
  - deck power: same calculation as `findDeckLeaderboard` in
    `server/src/leaderboards/leaderboardRepository.ts`
  - deck rarity: count of deck cards with `getRarityForLevel(level)` ≥ X
  - `player_daily_task_claims` (count rows)
  - `guild_xp_contributions` (sum xp)
  - `guild_treasury_contributions` (type `gold`, and `card_elements`)
- **Save-profile trial:** keep the current logic in `server/src/trials/storyTrialsService.ts`.
- **Not tracked yet:** total gold earned and total silver earned (no currency ledger).
  Mark as pending, or add a ledger event where currency is granted.

## Work already done (uncommitted)

- `shared/src/campaign.ts` and `shared/src/index.ts`:
  - old stage/quest types removed;
  - added `CampaignLocationState`, `CampaignLocationView`, `CampaignLocationBossView`,
    `CampaignMapView`, `CampaignBossCardDrop`;
  - `CampaignBossView.locationNumber`; `CampaignBossResult.firstWin / respawnHours / thanks`;
  - opponent name is now `string`.
- `shared/src/storyTrials.ts`:
  - `StoryTrialView.available`, `navigation` is now nullable, more navigation targets;
  - `StoryTrialsView.location { number, giverName, giverCardId, giverArtKey }`.
- **Server and client do not compile against these types yet.** That is the next step.

## Remaining steps

1. `server/src/campaign/campaignLocations.ts`: the 10-location config.
   - Fields: id, number, name, giver name + portrait card code, plea (2 lines),
     trials { id, title, metric, target, param, sincePrevious, available, navigation },
     per-trial reward, boss { name, deck [{code, power}] ×9, respawnHours,
     firstWin {gold, silver}, drop {rarity, level}, thanks lines }.
   - Location 1 trial ids must stay the existing story-trial ids
     (`first-duel-win`, `play-duels`, `buy-cards`, `upgrade-cards`, `save-profile`).
2. Migration `server/migrations/069_campaign_locations.sql`:
   - table `player_campaign_locations(player_id, location_number, first_win_at, last_win_at, PK)`;
   - reuse `player_story_trial_claims` for all trial claims (trial ids are globally unique).
3. Rewrite `storyTrialsService.ts` to be location-aware:
   - the current location is the first one without `first_win_at`;
   - it evaluates metrics and claims trials of the current location only.
4. Rewrite `campaignService.ts`:
   - keep `recordEvent` / `recordExternalEvent` (called by duel, shop, cards, referrals,
     workshop), but they only insert the event now;
   - `getCampaign` returns a `CampaignMapView`;
   - remove stage/quest routes from `campaignRoute.ts`.
5. Generalize `campaignBossService.ts`:
   - `start(playerId, locationNumber)`: check the location is open or refightable and
     respawned; store the location number in the duel (e.g. `campaign_id = 'location_N'`);
   - on a win: first win → gold/silver + drop + set `first_win_at`; repeat → drop only;
     always set `last_win_at`;
   - update the boss route body to `{ location }`.
6. Client:
   - `client/src/telegram/campaign.ts`: drop the stage/quest calls, add a `location`
     param to start;
   - `client/src/screens/CampaignScreens.tsx`: the map. A dotted path, current location
     on top: «Пройди випробування!» + «Нагорода!» while trials are claimable, else
     «Бити боса»; passed locations show the respawn timer or «Бити боса»;
     «Завдання» row under it. Delete the stage screen;
   - `StoryTrialsScreen.tsx`: the current location's giver/plea, trials, «Скоро» for
     unavailable ones, and a «Кампанія» link;
   - boss result: thanks, reward on first win, the dropped card, «Карта впала в слабкі»,
     «Битися знову через N год», «Нова пригода»;
   - `App.tsx` wiring: `campaignUnlocked` / `CampaignLockedHub` can go.
7. Docs: rewrite `docs/campaign.md` (new model, plus counting rules for every pending trial).
8. Tests:
   - replace `campaignService` / `campaignBoss` / `storyTrials` integration tests and
     `campaignConfig.test.ts`;
   - run with the local DB; `npm run build`; check in the browser at 390×844 on
     localhost:5173.
   - **5173 is a vite preview of `client/dist`.** Rebuild the client to see changes. The
     server on :3000 must be restarted after server edits.
9. Keep text readable: never ink straight on the patterned page. Use
   `text-panel-plate-v1` or the ribbon sprites (see `docs/guild-ui-alignment.md`).

## Local test account

The guest player is `da0e21d6-e8d0-4d50-9b47-3ce8dbdddf36` in the local DB
(127.0.0.1:5432/cardastika; DATABASE_URL is in the Windows **User** env).
It has 5000 gold, 50 000 silver, level 12, 12 duel wins, and is in guild «Вартові».

## Continuation status — 2026-11-02

- The ten-location campaign, location-aware trials, boss battles and local
  migration are implemented. Existing claimed fairy trials are preserved;
  old stage/quest tables and received rewards remain intact.
- The nine card powers for every boss are in `docs/reference-elem-campaigns.md`
  and `server/src/campaign/campaignLocations.ts`. HP is calculated from those
  nine powers as required. The source's printed HP differs from the card sum in
  locations 2 (6,513 vs 5,972), 3 (15,453 vs 17,336), 6 (55,708 vs 55,711) and
  8 (85,000 vs 85,072); the local game uses the sums.
- `docs/campaign.md` documents the counting rules and pending metrics.
  `docs/campaign-art-prompts.md` contains portrait and parchment-map-icon
  prompts. Existing catalog art supplies all current portraits; map icons have
  not been generated.
- Targeted campaign/trial integration tests passed (11/11). Full `npm run build`
  passed for shared, game-core, server and client. Full `npm test` passed 73
  game-core tests and 145 of 146 server tests. The remaining, unrelated
  `server/src/collections/collection.integration.test.ts` failure reproduces
  alone: expected bonus omits `scope`, actual has `scope: "all_battles"`.
- The local authenticated campaign and trials screens were checked in the
  browser at 390×844; the campaign screen had no console errors. Local API and
  preview `/api/health` both returned HTTP 200.
- No commit, push or deployment was made. `https://app.cardastika.org` serves
  Cardastika and its `/api/health` responds, but it remains a separate published
  environment rather than the local server; keep production untouched until
  the user explicitly asks to proceed.
