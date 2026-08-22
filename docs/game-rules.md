# Game Rules Foundation

These are product constraints, not implemented systems yet.

- A deck contains 9 cards.
- The game has 4 elements and 6 rarity levels.
- The final card target is 180 cards arranged as 20 collections of 9 cards.
- There are also 9 starter cards outside those collections.
- Bonuses come from completed collections, not individual card buffs.
- A new account will start with 1,500 silver, 0 gold, and the 9 starter cards.
- Battle calculations must live in `game-core` and the server must remain
  authoritative over battle outcomes.

Cards, battles, collection bonuses, inventory, and economy behavior are purposely
not specified or implemented in this scaffold.
