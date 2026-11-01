# Arena

Arena is an independent six-participant free-for-all mode, checked against the
elem.mobi manual and real reference matches on 2026-10-31.

## Match flow

Entering creates a registration record that stays open for 15 seconds. All real
players who enter before the timer expires share one match; bots fill the free
places afterwards and never receive limited cards. The server stores the shared
state in `arena_matches.state` and links live participants through
`arena_match_players`. The client polls the queue and match about once a second.

Every card stays face down for the first nine seconds. Each participant has three
slots; a used lane closes for nine seconds on both rows, then shows new cards.
A strike is an exchange: the opposing card in that lane answers in the same
action, and both damage values are logged. The player cycles through living
targets or taps an avatar, and can replace ready cards; pricing is in
`game-core/src/arena.ts`.

Bots keep one target until it or they fall, strike once in the first cycle and
then twice per cycle (one action per 4.5 seconds).

## Result

The match ends when one participant is left, or technically three minutes after
the last player strike. The three highest damage dealers win, then kills, then
remaining HP. A player with fewer than three moves did not fight: they rank after
those who did, lose 3 rating, and receive no tokens, win or task progress. If a
technical finish leaves four or more alive, nobody wins and rating does not move.

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

As in the reference, a fight pays no silver or gold. Rewards are:

- rating, every counted fight;
- one-time silver for each league first reached;
- daily tasks: 10 fights and 5 wins (`play-arenas`, `win-arenas`).

Differences from the reference, kept on purpose:

- Arena Tokens by place remain, because they fund the Arena shop.
- The daily tasks pay diamonds. The reference pays gold for fights and a
  league-based card for five wins; the daily task system only supports diamonds.
- There is no 2000 duel rating gate.

## HTTP surface

Under `/api/arena`: `GET /profile`, `/active`, `/leaderboard`, `/shop`;
`POST /queue`, `/shop/purchase`, `/matches/:id/action`, `/target`, `/cards`;
`DELETE /queue`.
