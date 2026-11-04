import assert from "node:assert/strict";
import test from "node:test";
import { SHOP_REWARD_CARDS } from "./shopRewardCards.js";

test("legacy fallback reward pool stays empty until canonical shop cards exist", () => {
  assert.deepEqual(SHOP_REWARD_CARDS, []);
});
