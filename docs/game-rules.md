# Game Rules Foundation

These are the current product constraints.

- A deck contains 9 cards.
- The game has 4 elements and 6 rarity levels.
- The final card target is 180 cards arranged as 20 collections of 9 cards.
- There are also 9 starter cards outside those collections.
- Bonuses come from completed collections, not individual card buffs.
- A new account starts with 1,500 silver, 0 gold, and 9 starter cards.
- Each starter card has power 12 and does not belong to a collection.
- Battle calculations must live in `game-core` and the server must remain
  authoritative over battle outcomes.

## Deck element balance

- The battle deck is automatic; players do not manually edit or save deck slots.
- The server always assembles the strongest possible deck from cards the player
  owns, using canonical power-first and card-code/ID tie-breaking.
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

The server owns the permanent base catalog and accepts only an offer ID from the
client:

- `silver_card`: 500 silver; minimum Uncommon; may reward Rare or Epic.
- `epic_card`: 50 gold; minimum Epic; may reward Legendary or Mythic.
- `legendary_card`: 150 gold; minimum Legendary; may reward Mythic.

Exact rarity probabilities are not finalized yet. Production purchases fail
closed until explicit server-side rarity weights are approved and configured;
the client never displays invented odds and never selects a reward, price, or
rarity.

A shop purchase changes inventory only. Currency deduction, canonical card
ownership, and automatic deck recalculation commit in one database transaction.
The automatic deck service remains the sole owner of active deck composition.

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
