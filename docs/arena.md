# Arena

Arena is an independent six-participant free-for-all mode, checked against the
elem.mobi manual and real reference matches on 2026-10-31, and the manual
page `/forum/3/218665/` again on 2026-11-08.

## Match flow

Entering creates a registration record. The first registration opens the
timer: 5, 10, 15, 20 or 25 seconds by its league tier (grey, green, blue, epic,
higher), 5 seconds shorter for every other live player in the queue, never
below 5 (`getArenaQueueDurationMs`). Everyone in the queue sees that one start.
All real players who enter before the timer expires share one match; bots fill the free
places afterwards and never receive limited cards. The server stores the shared
state in `arena_matches.state` and links live participants through
`arena_match_players`. The client polls the queue and match about once a second.

Every card stays face down for the first nine seconds. The battle then runs in
nine-second cycles counted from that moment (`state.cyclesStartAt`): a lane used
in a cycle closes on both rows until the cycle ends and opens with new cards;
unused lanes keep their cards (`getArenaCycleEnd`). The first card change is
free, every later one costs 5 gold.
A strike is an exchange: the opposing card in that lane answers in the same
action, and both damage values are logged. The player cycles through living
targets with Change target and can replace ready cards.

Bots keep one target until it or they fall, strike once in the first cycle and
then twice per cycle (one action per 4.5 seconds).

## Result

The match ends when one participant is left, or technically three minutes after
the last player strike. The three highest damage dealers win, then kills, then
remaining HP. A player with fewer than three moves did not fight: they rank after
those who did, lose 3 rating, and receive no win or task progress. If a
technical finish leaves four or more alive, nobody wins and rating does not move.

## Screen layout

The block order follows the reference; the look is our parchment book.

- Lobby: banner, queue note, Sign up and Refresh, arena rating with a rail to
  the next league, remaining arena tasks, Arena rules link, arena chat, then
  the `MenuRow`s Arena rating and Tasks.
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

As in the reference, a fight pays no silver, gold or arena currency. Rewards are:

- rating, every counted fight;
- one-time silver for each league first reached;
- daily tasks: 10 fights and 5 wins (`play-arenas`, `win-arenas`).

Differences from the reference, kept on purpose:

- The daily tasks pay diamonds. The reference pays gold for fights and a
  league-based card for five wins; the daily task system only supports diamonds.
- There is no 2000 duel rating gate.

## HTTP surface

Under `/api/arena`: `GET /profile`, `/active`, `/leaderboard`, `/chat`;
`POST /queue`, `/chat`, `/matches/:id/action`, `/target`, `/cards`; `DELETE /queue`.
`/profile` includes `dailyTasks`, today’s progress of the two arena tasks.

There is no Arena shop and no Arena currency: Arena Tokens, the shop and its
cosmetics were removed by migration `072_remove_arena_tokens.sql`.
