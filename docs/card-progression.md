# Card instances and progression foundation

## Implemented foundation

- `cards` stores only canonical identity and presentation: ID, code, name,
  element, collection, and artwork key.
- `player_card_instances` is the single authoritative ownership model. Every
  copy has its own stable ID, owner, canonical card ID, level, creation bonus,
  exact level progress, stored overflow potential, and creation time. Duplicate
  canonical cards are independent instances.
- Level is an integer from 1 through 180. Rarity is derived only from level by
  the canonical `game-core` helper: Common 1–4, Uncommon 5–9, Rare 10–19,
  Epic 20–34, Legendary 35–59, and Mythic 60–180.
- Base power is read from the explicit 180-entry canonical table in
  `game-core`; it is never approximated with a formula.
- Final power is `basePower(level) + bonusPower`. The integer `bonusPower` is
  generated once for a standard instance in the inclusive range 0–20% of its
  creation-level base power and remains unchanged when the level changes.
  Persisted bonus power has no 20% database ceiling so explicit future special
  rewards can exceed the standard-generation limit.
- Active deck slots reference instance IDs. The strongest valid 3/2/2/2 deck
  is selected by final instance power. Weak cards are the owned-instance
  complement of those nine slots, ordered by final power descending with a
  stable instance/card tie-breaker.
- `GET /api/player/cards/weak?page=N&limit=9` returns that complement in stable
  nine-card pages. Weak-card ownership is never duplicated or moved to another
  table.
- Deck power is the sum of the nine final powers; current base battle HP equals
  that same value. Starter instances are Lv1, base 10, bonus 2, final 12, Common.

The Shop pity system resolves a rarity tier. Product policy has not yet defined
how to choose a specific level inside that tier. The server therefore exposes a
central validated `selectGeneratedLevelForRarity` abstraction with an injected
policy and does not silently ship an arbitrary distribution. Catalog and pity
remain available; production purchase generation must receive an approved
policy before it can create an instance.

## Absorption and level progression

### Improvement and level progress

A card increases its level by filling exact elemental progress. Only weak cards
of the same element may be consumed: fire to fire, water to water, air to air,
and earth to earth. The server revalidates ownership, current weak membership,
element, and target identity while rows are locked in one transaction.

The consumed instance is permanently deleted. Its native canonical elemental
value, filled level progress, and stored overflow are all transferred to the
target. `level_progress_elements` is the amount assigned to the current level;
`stored_elements` preserves overflow. Neither deletion nor a gold barrier may
discard potential. The target itself may be in or outside the active deck.

The client submits only instance IDs. Absorption preview, transferable values,
price, resulting power/rarity, balance, and replacement deck are authoritative
server calculations. A confirmation dialog is mandatory before deletion.

### Gold alternative and gold levels

For ordinary transitions, filled progress proportionally reduces the confirmed
full gold price down to zero. For gold-required transitions, it reduces only
the reducible portion and never crosses the confirmed mandatory minimum.

Every fifth target level through 85 is gold-required. Every target level from
90 through 180 is gold-required. One `game-core` helper owns this rule. A
level-up advances exactly one level, keeps `bonusPower`, derives the new rarity
and final power, deducts the authoritative price, then invokes the same
automatic-deck service in the transaction.

### Elemental potential

`CARD_LEVEL_TABLE` is the single canonical `game-core` view for level, base
power, increase, full gold price, minimum gold price, and elemental value.
Known source values are copied literally. Unknown source cells are `null`, not
zero and not extrapolated. An absorption or level-up that needs an unknown cell
returns `unsupported_level_data` without changing cards, progress, deck, or
currency. The supplied material confirms the complete 180-level base-power
column and only a subset of economy/element cells (including the documented
level-15 row and visible level-20 price); the remaining source cells still need
the actual reference table before they can be enabled.

### Magic Source

A normal card may eventually become a magic source. A source has power 1,
retains its original level and accumulated elemental potential, cannot level or
absorb cards, and can itself be consumed for improvement. This conversion and
all source state are deferred.

### Protection

Future progression must support protecting valuable instances from accidental
absorption. No field or UI is added until the consumption workflow is designed;
stable instance identity keeps that addition straightforward.

Magic-source conversion, protection, bulk consumption, recommended fodder,
free-upgrade items, and unrelated world/event systems remain outside this
milestone.
