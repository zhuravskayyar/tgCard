import assert from "node:assert/strict";
import test from "node:test";
import { BATTLE_PASS_CIRCLES, BATTLE_PASS_MILESTONES, DAILY_TASKS } from "./battlePassConfig.js";

test("battle pass thresholds fit the monthly diamond income", () => {
  assert.deepEqual(BATTLE_PASS_CIRCLES.map(({ thresholds }) => thresholds), [[50, 100, 150, 200, 250, 300, 400]]);
  assert.equal(BATTLE_PASS_CIRCLES.at(-1)?.thresholds.at(-1), 400);
});

test("reference reward nodes use a currency boost, silver, gold, and a lowest-deck-level card", () => {
  assert.deepEqual(BATTLE_PASS_MILESTONES.map(({ reward }) => reward?.kind ?? null), ["boost", null, "silver", null, "gold", null, "card"]);
  assert.deepEqual(BATTLE_PASS_MILESTONES[0]?.reward, {
    durationHours: 24,
    kind: "boost",
    label: "×2 срібла та золота · 24 години",
    multiplier: 2,
  });
  assert.deepEqual(BATTLE_PASS_MILESTONES[2]?.reward, {
    amount: 3_500_000,
    kind: "silver",
    label: "3,5 млн срібла",
  });
  assert.deepEqual(BATTLE_PASS_MILESTONES.at(-1)?.reward, {
    kind: "card",
    label: "Випадкова карта",
    levelSource: "lowest_deck",
  });
});

test("the daily task reward pool remains seven diamonds before the multiplier", () => {
  assert.equal(DAILY_TASKS.reduce((total, task) => total + task.rewardDiamonds, 0), 7);
});
