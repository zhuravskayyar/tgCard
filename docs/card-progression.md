# Card instances and progression foundation

## Implemented foundation

- `cards` stores only canonical identity and presentation: ID, code, name,
  element, collection, and artwork key.
- `player_card_instances` is the single authoritative ownership model. Every
  copy has its own stable ID, owner, canonical card ID, level, creation bonus,
  and creation time. Duplicate canonical cards are independent instances.
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
- Deck power is the sum of the nine final powers; current base battle HP equals
  that same value. Starter instances are Lv1, base 10, bonus 2, final 12, Common.

The Shop pity system resolves a rarity tier. Product policy has not yet defined
how to choose a specific level inside that tier. The server therefore exposes a
central validated `selectGeneratedLevelForRarity` abstraction with an injected
policy and does not silently ship an arbitrary distribution. Catalog and pity
remain available; production purchase generation must receive an approved
policy before it can create an instance.

## Confirmed future rules — not implemented

### Improvement and level progress

A card can eventually increase its level by filling progress with elemental
potential absorbed only from cards of the same element: fire to fire, water to
water, air to air, and earth to earth. Cross-element absorption is forbidden
unless a later explicit product rule changes it. Filled progress permits the
next level subject to the gold-level rules below.

### Gold alternative and gold levels

Gold may eventually replace part of the normal progress requirement; its cost
decreases as progress is filled. No formula or price is confirmed yet.

Every fifth level (5, 10, 15, 20, …) and every level starting at 90 is a
gold-required level. Even full progress requires some gold. Absorption can
reduce that gold requirement under future rules but cannot remove it entirely.

### Elemental potential

Every owned card will carry elemental potential based on level. Potential
previously absorbed by a card is accumulated and transferred if that card is
later consumed, so consumed value must never be inferred only from current
level. The numeric potential table is intentionally not implemented because
its high-level values are not fully confirmed.

### Magic Source

A normal card may eventually become a magic source. A source has power 1,
retains its original level and accumulated elemental potential, cannot level or
absorb cards, and can itself be consumed for improvement. This conversion and
all source state are deferred.

### Protection

Future progression must support protecting valuable instances from accidental
absorption. No field or UI is added until the consumption workflow is designed;
stable instance identity keeps that addition straightforward.

Absorption, deletion, upgrade actions/costs, progress math, gold payments,
magic-source state, and protection UI are outside this foundation. Reference
world content and events are likewise not adopted; only system principles are.
