# Arena

Arena is an independent six-participant free-for-all mode. Entering the Arena
creates a registration record that remains open for 30 seconds. All real
players who enter before the timer expires are put into the same match; the
remaining places are filled by server-owned bots only after the timer ends.
Arena bots never receive or use limited cards, even when the player snapshot
used to build them contains a limited card.
The server stores one shared match state in `arena_matches.state` and links
every live participant through `arena_match_players`. Bot participants receive
a random avatar URL derived from a non-limited card asset, while real players
keep their Telegram avatar when available.

Each participant has three active slots. An attack uses the corresponding slot
of the current target, applies the Duel elemental multiplier, and starts a
nine-second cooldown for the attacker's lane. The opponent card in that lane
mirrors the cooldown in the view and becomes available when the lane refreshes.
The player can cycle through living targets and replace all ready cards;
card-change pricing is owned by `game-core/src/arena.ts`.

Places are sorted by total damage dealt, then kills, then remaining HP. The
first three places receive a positive Arena rating change and are marked as
winners. Silver is based on the independent Arena league table, Arena Tokens
and other currency rewards are tripled from the original table, and Arena Gold
rewards share a daily cap of 45.

The queue response contains `queue.createdAt`, `queue.startsAt`, and the number
of registered participants. `GET /active` returns that queue while the 30-second
window is open, then returns the shared match. During an active match, the
target button cycles through living opponents and tapping a living opponent's
avatar selects that exact target. The HTTP surface is under
`/api/arena`:

- `GET /profile`, `GET /active`
- `POST /queue`, `DELETE /queue`
- `POST /matches/:id/action`, `/target`, and `/cards`
- `GET /shop`, `POST /shop/purchase`

The client polls the queue and active match once per second, which keeps the UI
responsive without introducing a second realtime transport before the mode
needs one. Arena combat uses the same elemental damage and clash effects as
Duel. When a player attacks, the opponent card in the same lane is hidden and
shows the same cooldown until that lane refreshes. The final screen groups the
ranked participants into Winners (top three) and Contenders, with rating and
reward data for the authenticated player.
