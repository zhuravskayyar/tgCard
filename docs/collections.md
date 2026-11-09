# Collections v1

Cardastika has 50 established collections of 3 to 15 cards and the new one-card
collection «Легенди Twitch», which is waiting for more members: 51 collections and
214 species in total (16 of them outside any collection). The catalog is generated from `tools/card-catalog/` into
`server/src/collections/catalogData.generated.ts` and readable in `docs/card-catalog-v2.md`;
edit the sources there and rerun `node tools/card-catalog/build-catalog.js <repo path>`.
One card may belong to several collections: membership lives in `collection_cards`, and
`cards.collection_id` keeps only the first one. The 11 starter cards are ordinary
catalog species, some of them inside collections (see `docs/game-rules.md`). A card shows artwork only once it has a line in
`client/public/card-art/card-art-map.txt`.

Each shop banner sells its own list of cards at each rarity (`shopPools` in the generated
data, shown under "Детальніше"). A shop card's `minRarity` is the lowest rarity any banner
sells it at. Bonuses for mechanics that do not exist yet use the `none` type and say so in
their label.

Collection progress comes only from `player_card_discoveries`, never from the
current inventory. Acquiring a species inserts one idempotent discovery row.
When all members are discovered, one `player_collection_completions` row makes
the bonus permanent; absorbing or otherwise removing instances cannot revoke
progress or completion.

Collection bonuses are permanent, additive modifiers aggregated in `game-core`,
but each bonus also declares its active context (`duel`, `arena`, `campaign`,
`guild_raid`, `absorption`, or `altar`). `all_battles` is reserved for a bonus
that intentionally applies to every battle mode; a battle bonus never leaks
into card progression or guild utility systems. They never mutate persisted
instance `finalPower`. The authenticated `PlayerSummary` exposes every
completed collection bonus in `collectionBonuses`, and each relevant system
recalculates only the permanent bonuses applicable to its own context.

The permanent Shop resolves pity rarity first, filters canonical cards by
`minRarity <= resolved rarity`, then selects a uniform integer level from the
single Shop range table: Uncommon 5–9, Rare 10–19, Epic 20–34, Legendary 35–59,
and Mythic 60–75. Global Mythic progression remains 60–180.

The collection UI separates canonical species from player instances. An
undiscovered species may show name, element, minimum rarity, and collection,
but never fabricated level, power, or bonus power. Owned instance controls stay
on the existing instance Card Detail screen.
