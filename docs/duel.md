# Duel v1

Duel is server-authoritative asynchronous play. Matchmaking first selects another real player whose valid automatic nine-card deck is within ±10% of the challenger's effective deck power. The range widens to ±15% when the current Duel win streak is at least five. If no real player qualifies, the server creates a temporary balanced bot snapshot with a generated human-like nickname. Bots are not player accounts and are never inserted into `players`; no opponent account is mutated.

Starting a Duel freezes both sides' identity, level, nine card instances and final powers, artwork data, completed battle modifiers, effective deck power, and shared starting HP. A bot is balanced to the challenger's effective deck power and receives synthetic card-instance identifiers. Each side is shuffled independently with server RNG exactly once. The persisted snapshot, three active slots, six-card reserve queues, HP, log, turn, and version are restored after reload; later inventory changes cannot alter the battle.

The board has three mirrored pairs. The challenger selects only one own slot, and the opposing card in that slot always counterattacks in the same exchange. Both attacks are calculated before either result is evaluated. Damage uses the canonical `0.5 / 1 / 1.5` element matrix, card instance `finalPower`, global battle damage, and attacker-element damage modifiers. Shared HP uses effective deck power plus the battle HP modifier and is clamped at zero.

After every exchange, the used card on each side moves to the back of its reserve queue and the front reserve card replaces only that active slot. The nine-card pool is cyclic and never runs out. If both shared HP pools reach zero in the same completed exchange, the initiating challenger wins.

Every resolved exchange appends one immutable log snapshot containing the exact two cards, both multipliers, and both damage values. Clients submit only `slotIndex` and `expectedVersion`; stale actions return `duel_state_conflict` and cannot resolve or reward twice.

Finalization is one transaction. A win increments wins and the current streak; a loss increments losses and resets the streak. Both outcomes grant deterministic level-based XP and Silver, including completed collection reward modifiers. Account XP requires `currentLevel × 100` per next level and preserves overflow. Gold is never a direct Duel reward: each reached account level grants Gold equal to that newly reached level, including every level crossed by one reward.
