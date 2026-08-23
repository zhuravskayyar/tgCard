# Game Rules Foundation

These are the current product constraints.

- A deck contains 9 cards.
- The game has 4 elements and 6 rarity levels.
- The final card target is 180 cards arranged as 20 collections of 9 cards.
- There are also 9 starter cards outside those collections.
- Collection bonuses come from completed collections; an instance's persisted
  creation `bonusPower` is part of its own final power, not a mutable card buff.
- A new account starts with 1,500 silver, 0 gold, and 9 starter cards.
- Each starter instance is Lv1 with base power 10, bonus power 2, final power
  12, Common rarity, and no collection.
- Battle calculations must live in `game-core` and the server must remain
  authoritative over battle outcomes.

## Deck element balance

- The battle deck is automatic; players do not manually edit or save deck slots.
- The server always assembles the strongest possible deck from cards the player
  owns, using final instance power and stable instance/card tie-breaking.
- A complete deck contains exactly 9 cards across exactly 4 elements.
- Every element must contribute at least 2 and at most 3 cards.
- Therefore every complete deck has a `3/2/2/2` element distribution.
- Any of the four elements may be the element represented three times.

Inventory is unrestricted by element balance. The rule applies only to active
deck composition. Inventory-changing systems never edit deck slots directly;
after changing inventory in their transaction, they trigger the shared automatic
deck recalculation service. That service persists a new deck only when the
strongest valid selection differs from the current deck.

If owned cards cannot form a valid deck, the server does not create an invalid
one. It preserves an existing valid deck when possible and otherwise returns the
structured `insufficient_valid_cards` state.

Card abilities, battles, collection bonuses, and further economy behavior are
purposely not specified yet.

## Base card shop

The server owns the permanent Cards catalog and accepts only an offer ID from
the client:

- `card_uncommon`: 500 silver; Uncommon guaranteed; Rare pity increases by
  3.5 percentage points on a miss and Epic pity by 0.25.
- `card_epic`: 50 gold; Epic guaranteed; Legendary pity increases by 3.5
  percentage points on a miss and Mythic pity by 0.25.
- `card_legendary`: 150 gold; Legendary guaranteed; Mythic pity increases by
  3.5 percentage points on a miss.

Shop rarity chances are persistent per player, offer, and target rarity. No
unapproved base chance is added: a new accumulated meter starts with zero
progress. Chance math uses integer basis points. After an unsuccessful upgrade
roll, the meter increases by its offer-specific increment. When it succeeds:

`newChance = ceil(oldChance / 2)`

The result is rounded upward to a whole percentage. Higher rarities are resolved
first. The isolated current cross-rarity policy treats lower targets as misses
when a higher target succeeds, so their pity continues to accumulate rather
than being silently reset.

A shop purchase changes inventory only. Currency deduction, instance creation,
and automatic deck recalculation commit in one database transaction.
The automatic deck service remains the sole owner of active deck composition.
Only canonical cards in the explicit Shop rarity pool can be selected, and the
generated instance level must belong to the resolved rarity.

Shop-pool membership is configuration attached to canonical definitions, not
owned-card rarity. Instance rarity and power derive from the generated level.
The exact level-selection distribution inside a resolved rarity remains an
explicit unresolved product rule; see `docs/card-progression.md`.

## Permanent card content rules

Cards may represent animals, beasts, mythical creatures, non-humanoid elemental
creatures or spirits, relics, artifacts, magical or natural objects, and
manifestations of natural forces.

Card content must never include humans, humanoid characters, anthropomorphic
animals, human faces on creatures, animals wearing human clothing, or animals
presented as knights, mages, warriors, priests, or other human roles. Do not add
human-like arms or body structures to animals.

Power and rarity must remain logically consistent with the scale of the entity.
The intended progression is ordinary beast, elemental beast, mythical creature,
then ancient or primordial creature or major relic. A random mortal must not be
stronger than a divine or primordial entity. These are world and content-design
rules, not gameplay logic.
