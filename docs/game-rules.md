# Game Rules Foundation

These are the current product constraints.

- A deck contains 9 cards.
- The game has 4 elements and 6 rarity levels.
- The canonical catalog contains 213 cards in 50 collections (16 of them outside
  any collection); see `docs/collections.md`.
- Collection bonuses come from completed collections; an instance's persisted
  creation `bonusPower` is part of its own final power, not a mutable card buff.
- A new account starts with 1,500 silver, 0 gold, and 11 starter cards, copied
  from the reference start (`server/src/inventory/starterCards.ts`).
- Starters are ordinary catalog cards and count toward collections. The deck gets
  Вітрогонка at Lv5 (power 84) and eight Lv1 cards at power 12: Ворон-пересмішник,
  Гірський орел, Вогнянка, Іфрита Жарина, Ящірка-блискавка, Наяда Ставка,
  Невисоклик Пиріжок, Ельф-слідопит. Крабоїд and Бабка-велетка start as weak
  cards at Lv1, power 10.
- The first campaign boss rewards Вовк Сіроманець at Lv15, as in the reference.
- Battle calculations must live in `game-core` and the server must remain
  authoritative over battle outcomes.

## Account experience

- A lost Duel grants no XP (Silver is still paid). A won Duel grants XP equal to
  the defeated opponent's starting HP; damage beyond it is not XP.
- Battle XP is based on the player's total damage dealt in the battle. The
  server accumulates that total separately from the truncated display log, so
  long battles do not lose experience.
- Experience bonuses are additive percentages of the damage-based base XP. The
  current account-wide x2 boost contributes +100% to XP.
- Account progression uses the explicit level-2 through level-120 XP table in
  `game-core`. Each table entry is the XP required for that target level.
- Reaching a level grants one-time gold equal to the new level. Level 120 is
  the progression cap.

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

## Lariska daily finds

Daily login rewards are server-owned and persisted independently from daily
Battle Pass tasks. They are presented in one AppShell-level `Нагорода за вхід`
modal after the profile is loaded; they must not be rendered or claimed from
the `Завдання` screen. A player may claim once per UTC date. Missing a date does
not reset the calendar: the next claim continues from the next accumulated day.

Each seven-day cycle contains:

- Day 1: one Common card.
- Day 2: one Uncommon-or-better equipment item.
- Day 3: one Rare-or-better card.
- Day 4: 5–10 Gold.
- Day 5: 250 account XP.
- Day 6: a choice of one of three Rare-or-better cards.
- Day 7: an Epic card with a 5% Legendary upgrade chance.

The seventh-day reward improves in later accumulated cycles: cycle 2 adds 15
Gold, cycle 3 grants Epic equipment, and cycle 4 becomes a choice of a
Legendary card, Epic equipment, or 30 Gold. The cycle position and choice
options are generated and stored by the server before the claim, so refreshing
the Mini App cannot reroll them. Seven-, fourteen-, and thirty-claim streaks
also have one-time bonuses (an extra Common card, 5 Gold, and a title).

## Permanent card content rules

Cards may represent humans, humanoid characters, animals, beasts, mythical
creatures, elemental creatures or spirits, relics, artifacts, magical or natural
objects, and manifestations of natural forces.

Power and rarity must remain logically consistent with the scale of the entity.
The intended progression is ordinary beast, elemental beast, mythical creature,
then ancient or primordial creature or major relic. A random mortal must not be
stronger than a divine or primordial entity. These are world and content-design
rules, not gameplay logic.
