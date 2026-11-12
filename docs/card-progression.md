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
The required amount is the canonical elemental value of the target's current
level, not a fixed 100-point percentage: a level-17 card contributes `2.8`,
and a level-22 card requires `5.6`. The UI derives the percentage only for
display (`2.8 / 5.6 = 50%`); the database stores the raw elemental amounts.
When absorption crosses a threshold, the current level is filled and the
remaining raw amount stays in `stored_elements` for the next level.
Source-table elemental values are kept with two decimal places, so a level-1
card transfers `0.02` rather than being rounded up to a false 1% of progress.
When the source table has no value, absorption uses the universal minimum native
value of 1. Missing upgrade-price data remains unsupported and cannot block
absorption.

The client submits only instance IDs. Absorption preview, transferable values,
price, resulting power/rarity, balance, and replacement deck are authoritative
server calculations. A confirmation dialog is mandatory before deletion.

### Absorb weak cards (bulk)

The reference card page shows one «Поглотить слабые» button between the level-up
block and the weak-card list, with the summed level-progress gain under it. We
mirror it as «Поглинути слабкі» on Card Detail:

- Candidates are the player's weak cards of the target's element: outside the
  active deck, unprotected, not the target.
- `game-core` `selectBulkAbsorption` takes them weakest first (by transferable
  elements, collection absorption bonus included) while the sum still fits into
  what the current level needs. A card that would overflow the level is left for
  a manual, per-card absorb; the bulk action never spills into stored overflow.
  At most 100 cards per action.
- `GET /api/player/cards/:id/absorb-weak-preview` returns the picked IDs and the
  resulting progress; the UI shows it as «Прогрес рівня: +N%».
- `POST /api/player/cards/:id/absorb-weak` re-selects the cards under row locks
  and absorbs them in one transaction through the same validation as a manual
  absorb. The client sends no IDs. Nothing fitting returns `nothing_to_absorb`.
- A confirmation dialog (count + gain) is shown before deletion. The button is
  disabled when nothing fits and hidden at maximum level or without weak cards.

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
Known source values are copied literally, including the full price/minimum-price
rows and the two-decimal elemental values. Unknown source cells are `null`, not
zero and not extrapolated. Absorption alone applies the universal minimum native
value of 1 for a null elemental cell so every eligible weak card remains usable.
A level-up that needs an unknown economy cell still returns
`unsupported_level_data` without changing cards, progress, deck, or currency.

### Magic Source

A magic source is an instance of one of the four `el_*` cards (see below). It
has power 1 at any level, retains its level and accumulated elemental
potential, cannot level or absorb cards, and can itself be consumed for
improvement. Converting a normal card into a source is still deferred.

### Protection

Each instance can be protected from absorption. A protected card is excluded
from weak-card candidates and server-side absorption validation rejects it until
the owner removes the protection.

Magic-source conversion, recommended fodder,
free-upgrade items, and unrelated world/event systems remain outside this
milestone.

## Source cards (`el_*`)

Four catalog cards are magic sources, one per element. They are outside every
collection, are not sold in the shop, and nothing grants them yet:

| Card | Element | Reference card |
|---|---|---|
| Небесна вись | Air | `el_air` «Небесные просторы» |
| Пралісна галявина | Earth | `el_earth` «Опушка в Древнем лесу» |
| Вогняна ущелина | Fire | `el_fire` «Ущелье в Огненных горах» |
| Північний шторм | Water | `el_water` «Шторм в Северном море» |

Reference rules (elem.mobi forum «ИнфоВоздух / Земля / Огонь / Вода»):

- A source has power 1 and any level from 1 to 150. It keeps the full magic
  potential of its level, so it is pure fodder for upgrading other cards.
- Ways to get one:
  - the daily reward, under certain conditions;
  - the chest shop;
  - a gift from the game;
  - a weekly guild-war gift (winner: the level of the enemy Guild Card; loser:
    10 levels lower);
  - a guild gift when the Guild Card reaches a gold level (the source has that level);
  - legendary, mythic and master tournaments, up to level 90;
  - crafting one from any card of the same element once the Tower of Mages is open.

Manual («Карти, бойова колода») source list, in our build order: tournament
prizes; each gold level of the Guild Card; guild-war mass battles; guild-war
results; the chest shop; the daily reward when the 9th deck card was a source
at the moment the reward card was formed; converting any card (cost 1) after the
«Башня магов» campaign.

### Built

- Identity: `isMagicSourceCode` / `MAGIC_SOURCE_CARD_CODES` in
  `game-core/src/cardProgression.ts`. Only the four exact codes count
  (`el_minotauro` is an ordinary card).
- Power: `getCardPower({ ..., magicSource: true })` returns
  `MAGIC_SOURCE_POWER` (1) everywhere: card mapper, automatic deck, weak-card
  ordering, deck leaderboard, public profile, deck-power story trials. A source
  therefore drops into weak cards unless the deck has no other card.
- Potential: absorbing a source transfers `getTransferableElementValue` (the
  level's native value plus its progress and stored elements), like any card.
  It is valid fodder for player cards and the Guild Card.
- Restrictions: level-up, absorb and «Поглинути слабкі» with a source as the
  target fail with `magic_source`; its absorption candidates are empty; it
  cannot be chosen as the Guild Card. Card Detail hides the upgrade plate and
  shows how many elements the source gives.
- Grant: `createMagicSourceInstance` (`server/src/cards/cardInstanceCreator.ts`)
  creates a source of an element at a level with zero bonus power. Tournament
  `kind: "source"` prizes (Champion and higher) now grant one of a random
  element at the prize level. Entries finished before this change keep
  `sourcePending: true` and were not back-filled.

- Guild Card gift: when the leader or an officer raises the Guild Card to a gold
  level with treasury gold (`levelUpGuildCard`, `server/src/guild/treasuryService.ts`),
  every member gets a source of that level and a random element; the guild
  journal logs `guild_card_upgraded` (migration 083).

Not built yet: the daily reward, guild war, chest
shop and card-to-source conversion.
