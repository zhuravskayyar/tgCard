import assert from "node:assert/strict";
import test from "node:test";
import { getRarityForLevel, validateDeckElementBalance } from "@cardastika/game-core";
import {
  STARTER_CARDS,
  STARTER_CARD_COUNT,
  STARTER_CARD_GRANTS,
  STARTER_DECK_CODES,
  getStarterGrantPower,
} from "./starterCards.js";

test("starters mirror the reference start with shared catalog cards", () => {
  assert.deepEqual(
    STARTER_CARD_GRANTS.map((grant) => [grant.code, getStarterGrantPower(grant)]),
    [
      ["wind_fairy", 84],
      ["black_raven", 12],
      ["salamander", 12],
      ["impetuous_lizard", 12],
      ["carefree_hobbit", 12],
      ["mountain_eagle", 12],
      ["fire_ifrit", 12],
      ["river_naiad", 12],
      ["elvish_scout", 12],
      ["crabman", 10],
      ["giant_dragonfly", 10],
    ],
  );
  assert.equal(STARTER_CARD_COUNT, 11);
  assert.equal(new Set(STARTER_CARDS.map(({ id }) => id)).size, STARTER_CARD_COUNT);
  assert.deepEqual(STARTER_CARDS.map(({ code }) => code), STARTER_CARD_GRANTS.map(({ code }) => code));
  assert.equal(getRarityForLevel(STARTER_CARD_GRANTS[0]!.level), "uncommon");
  assert.ok(STARTER_CARD_GRANTS.slice(1).every(({ level }) => getRarityForLevel(level) === "common"));
});

test("the nine starter deck cards form a valid 3/2/2/2 deck", () => {
  const deck = STARTER_CARDS.filter(({ code }) => STARTER_DECK_CODES.includes(code));
  assert.equal(deck.length, 9);
  assert.equal(validateDeckElementBalance(deck).valid, true);
});
