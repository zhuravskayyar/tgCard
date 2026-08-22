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
