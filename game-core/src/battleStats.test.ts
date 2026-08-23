import assert from "node:assert/strict";
import test from "node:test";
import { getBaseBattleHp, getDeckPower } from "./battleStats.js";

test("starter deck power and base battle HP are both 108", () => {
  const cards = Array.from({ length: 9 }, () => ({ finalPower: 12 }));
  assert.equal(getDeckPower(cards), 108);
  assert.equal(getBaseBattleHp(cards), 108);
});
