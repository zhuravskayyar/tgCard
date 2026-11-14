import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseAutoDuelSlot,
  getDuelAutoRemainingPrice,
  getDuelBreakBasePrice,
  getDuelBreakPrice,
} from "./duelPaid.js";

const MINUTE = 60_000;

test("break price follows the reference examples", () => {
  // 50 with 72 of 120 minutes left gives 30.
  assert.equal(getDuelBreakPrice(1_000, 72 * MINUTE, 120 * MINUTE), 30);
  // 25 with 3 of 90 minutes left gives 1.
  assert.equal(getDuelBreakPrice(0, 3 * MINUTE, 90 * MINUTE), 1);
  assert.equal(getDuelBreakPrice(0, 120 * MINUTE, 120 * MINUTE), 25);
  assert.equal(getDuelBreakPrice(0, 0, 120 * MINUTE), 1);
});

test("base price rises every 1000 automatic Duels and stops at the top tier", () => {
  assert.deepEqual([0, 999, 1_000, 2_000, 3_000, 4_000, 5_000, 90_000].map(getDuelBreakBasePrice), [25, 25, 50, 100, 250, 500, 1000, 1000]);
});

test("remaining charges cost 1 gold each", () => {
  assert.equal(getDuelAutoRemainingPrice(7), 7);
  assert.equal(getDuelAutoRemainingPrice(0), 0);
});

test("automatic fights take the best trade", () => {
  const slot = chooseAutoDuelSlot(
    [{ element: "fire", finalPower: 100 }, { element: "water", finalPower: 100 }, { element: "air", finalPower: 100 }],
    [{ element: "water", finalPower: 100 }, { element: "fire", finalPower: 100 }, { element: "air", finalPower: 100 }],
  );
  assert.equal(slot, 1);
});
