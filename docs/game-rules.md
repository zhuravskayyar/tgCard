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

Card abilities, battles, collection bonuses, and further economy behavior are
purposely not specified yet.

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
