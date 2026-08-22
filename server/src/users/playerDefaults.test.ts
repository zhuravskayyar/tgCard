import assert from "node:assert/strict";
import test from "node:test";
import { NEW_PLAYER_DEFAULTS } from "./playerDefaults.js";

test("new Cardastika players receive the canonical account defaults", () => {
  assert.deepEqual(NEW_PLAYER_DEFAULTS, {
    level: 1,
    silver: 1_500,
    gold: 0,
  });
  assert.equal(Object.isFrozen(NEW_PLAYER_DEFAULTS), true);
});
