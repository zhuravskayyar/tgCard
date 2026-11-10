# Arena

Arena is an independent six-participant free-for-all mode, checked against the
elem.mobi manual and real reference matches on 2026-10-31, and the manual
page `/forum/3/218665/` again on 2026-11-08.

## Access

The arena opens once a player has reached 2000 duel rating
(`ARENA_UNLOCK_DUEL_RATING`, `isArenaUnlocked` in `shared`). Reaching it once is
enough: the highest duel league reached also counts, so a later duel loss does
not close the arena again. The server refuses the queue with `arena_locked`
(403); the lobby disables sign-up and the home tile shows the requirement.

## Match flow

Entering creates a registration record. Each Arena league has its own queue.
The first registration in that league opens the timer: 5, 10, 15, 20 or 25
seconds by league tier (grey, green, blue, epic, higher), 5 seconds shorter for
every other live player in that same league, never below 5
(`getArenaQueueDurationMs`). All real players who enter before the timer expires
share one match; bots from the same league fill the free places and never
receive limited cards. The server stores the shared state in `arena_matches.state` and links live participants through
`arena_match_players`. The client polls the queue and match about once a second.
When the first registered player leaves, the next one inherits that start, so
leaving only adds the 5-second step back. While a player's arena daily tasks are
unfinished and another player of the same league is queued, the home Arena tile
shows "Хтось є" (`GET /api/arena/presence`, refreshed every 15 seconds).

The battle starts with its cards available. A used card closes for exactly nine
seconds from its own strike (`ARENA_SLOT_COOLDOWN_MS`), then its lane opens with
a new card; unused lanes keep their cards. So in nine seconds a player can strike
with each of the three cards once. `state.cyclesStartAt` is only the clock for
the bots' half-cycle schedule. Each player gets one free card change per battle;
every later change costs 5 gold.
A strike is an exchange: the opposing card in that lane answers in the same
action, and both damage values are logged. The player cycles through living
targets with Change target; if a target dies before a strike is processed, the
strike moves to the next living target. Players can replace ready cards.

Bots select among all living players and bots, then keep that target until it
or they fall. They strike once in the second half of the first cycle, then
twice in every later cycle, at 4.5-second intervals. They choose the available
strike with the highest calculated damage. When all living humans' page
presence expires, bots pause and resume at a future half-cycle without catching
up missed strikes. When every human has fallen, the match ends at once; the
manual says the bots' remaining fight finishes within seconds.

## Result

The match ends when one participant is left, or technically three minutes after
the last action by a living player. The three highest damage dealers win, then
kills, then remaining HP. Fewer than three moves do not count toward Arena daily
tasks, but placement and rating still follow the battle results. If a technical
finish leaves four or more alive, nobody wins and rating does not move.

## Screen layout

The block order follows the reference; the look is our parchment book.

- Lobby: banner, queue note, Sign up and Refresh, arena rating with a rail to
  the next league, remaining arena tasks, Arena rules link, arena chat, then
  the `MenuRow`s Arena rating and Tasks.
- Animated scene (prepared, waiting for art): `ArenaScene` stacks transparent
  layers from `ARENA_SCENE_LAYERS` behind the lobby and replaces the static
  banner once the list is filled. Layers drift, sway, flicker, pulse or rise
  in CSS and stand still under reduced motion. Art is the fairy-tale tarot
  woodcut (black ink, cream, sparing gold); `node tools/arena-scene/prepare-scene.cjs`
  turns `~/Downloads/1-scene.png` … `9-mages.png` into webp files in
  `client/public/assets/ui/arena/scene/`.
- Battle fits one screen with no heading: target bar, the 2×3 card board
  (a closed card shows its cooldown on the card back), player bar, then three
  medallion actions Refresh, Change target and Change cards.
- Result: outcome, rating change, winners and contenders with damage and
  moves, Sign up again and To arena, battle log, the same menu rows.

The arena chat and the tournament chat share `GameChat` on the client and
`ChatChannel` on the server; arena messages live in `arena_chat_messages`.

## Rating and leagues

Arena rating is independent of duels and starts at 1400. `ARENA_LEAGUE_CONFIG`
holds the 21 leagues with the reference thresholds (0, 500, 600, 800, then every
200 up to 4200). Promotion is immediate; demotion waits until rating is 100 below
the league floor. Each league first reached pays its one-time silver once,
tracked by `arena_highest_league_index`.

Rating change is `ARENA_RATING_CHANGES` by place, adjusted by opposition strength
and damage dealt. The reference states these factors but not its formula, so the
numbers are our own balance. Bots count at the player's rating.

The League tab shows progress to the next league and the top 100 of the player's
own league from `GET /api/arena/leaderboard`, with the player's rank added below
when outside the list.

## Rewards

Checked against the reference manuals for rating and leagues (`/forum/3/226703/`)
and daily tasks (`/forum/3/228564/`) on 2026-11-10. A fight pays no silver, gold
or arena currency. Rewards are:

- rating, every fight (fewer than three moves only withholds task progress);
- one-time silver for each league first reached, the reference table exactly
  (1000 for second grey up to 200000 for first master);
- daily tasks: 10 fights pay 3 gold plus a random item; 5 wins pay a card plus
  an item. The card level follows the arena league exactly as the reference
  table (`ARENA_REWARD_CARD_LEVELS_BY_LEAGUE`): 20-24 up to third epic, then
  24-28, 29-33, legendary 35-42 / 44-50 / 50-56, mythic 60-63, master 70 / 72 / 74.
  Second and first blue offer several level sets; we use one range covering them.
- Arena tasks are offered only once the arena is open (2000 duel rating reached).

Differences from the reference, kept on purpose:

- Daily tasks also pay diamonds and silver for the battle pass.
- There are no "buy 200 / 1000 gold" tasks, so their bonus arena progress and
  the "Arena champion" task discount do not exist. "Buy 5 cards" and "Absorb 10
  cards" stay after 2000 duel rating instead of being replaced, so eight tasks
  and the triple reward stay reachable.
- Arena achievements and titles are not implemented yet.

## HTTP surface

Under `/api/arena`: `GET /profile`, `/active`, `/leaderboard`, `/chat`;
`POST /queue`, `/chat`, `/matches/:id/action`, `/target`, `/cards`; `DELETE /queue`.
`/profile` includes `dailyTasks`, today’s progress of the two arena tasks.

There is no Arena shop and no Arena currency: Arena Tokens, the shop and its
cosmetics were removed by migration `074_remove_arena_tokens.sql`.
