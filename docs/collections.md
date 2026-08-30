# Collections v1

Cardastika has 16 permanent collections containing 120 canonical card species.
The 9 starter species remain outside collections (`collection_id = NULL`), so
the active canonical catalog contains 129 cards.

Collection progress comes only from `player_card_discoveries`, never from the
current inventory. Acquiring a species inserts one idempotent discovery row.
When all members are discovered, one `player_collection_completions` row makes
the bonus permanent; absorbing or otherwise removing instances cannot revoke
progress or completion.

Collection bonuses are additive player modifiers aggregated in `game-core`.
They never mutate persisted instance `finalPower`. Existing absorption applies
`absorption_efficiency_pct`. The authenticated `PlayerSummary` exposes every
completed collection bonus in `collectionBonuses`, and battle, silver-reward,
experience, and absorption systems recalculate the permanent bonuses from the
completion rows on every relevant request. Fixed campaign quest rewards remain
unchanged.

The permanent Shop resolves pity rarity first, filters canonical cards by
`minRarity <= resolved rarity`, then selects a uniform integer level from the
single Shop range table: Uncommon 5–9, Rare 10–19, Epic 20–34, Legendary 35–59,
and Mythic 60–75. Global Mythic progression remains 60–180.

The collection UI separates canonical species from player instances. An
undiscovered species may show name, element, minimum rarity, and collection,
but never fabricated level, power, or bonus power. Owned instance controls stay
on the existing instance Card Detail screen.
