import assert from "node:assert/strict";
import test from "node:test";
import {
  BATTLE_PASS_CIRCLES,
  BATTLE_PASS_MILESTONES,
  DAILY_TASKS,
  getBattlePassMilestone,
  getMilestoneThreshold,
  getPlayerCircles,
  isGrantableReward,
} from "./battlePassConfig.js";

test("battle pass circles copy the reference thresholds", () => {
  assert.deepEqual(BATTLE_PASS_CIRCLES.map(({ thresholds }) => thresholds), [
    [50, 100, 150, 200, 250, 300, 400],
    [460, 520, 580, 640, 700, 760, 900],
    [970, 1040, 1110, 1180, 1250, 1320, 1500],
    [1600, 1700, 1800, 1900, 2000, 2100, 2500],
    [2300, 2400, 2500, 2600, 2700, 2800, 3200],
  ]);
  assert.deepEqual(getPlayerCircles(false).map(({ circle }) => circle), [1, 2, 3, 4]);
  assert.deepEqual(getPlayerCircles(true).map(({ circle }) => circle), [1, 2, 3, 4, 5]);
  const circle4 = BATTLE_PASS_MILESTONES.filter(({ circle }) => circle === 4);
  assert.deepEqual(circle4.map((milestone) => getMilestoneThreshold(milestone, true)), [1580, 1660, 1740, 1820, 1900, 1980, 2200]);
});

test("VIP hunting permits sit at 200, 1900 and 2400; locked items cannot be granted", () => {
  const permits = BATTLE_PASS_MILESTONES.filter(({ vip }) => vip?.reward.kind === "item" && vip.reward.item === "hunting_permit");
  assert.deepEqual(permits.map(({ threshold }) => threshold), [200, 1900, 2400]);
  assert.ok(permits.every(({ vip }) => isGrantableReward(vip?.reward)));
  assert.equal(isGrantableReward(getBattlePassMilestone("circle-2-520-vip")?.milestone.vip?.reward), false);
  assert.equal(getBattlePassMilestone("circle-1-200-vip")?.vip, true);
  assert.equal(getBattlePassMilestone("circle-1-200")?.vip, false);
  assert.ok(BATTLE_PASS_CIRCLES.every(({ circle }) => BATTLE_PASS_MILESTONES.filter((milestone) => milestone.circle === circle).at(-1)?.vip === null));
});

test("reference reward nodes use a currency boost, silver, gold, and a lowest-deck-level card", () => {
  assert.deepEqual(BATTLE_PASS_MILESTONES.filter(({ circle }) => circle === 1).map(({ reward }) => reward?.kind ?? null), ["boost", "equipment", "silver", "equipment", "gold", "equipment", "card"]);
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

test("the daily task reward pool remains thirteen diamonds before the multiplier", () => {
  assert.equal(DAILY_TASKS.reduce((total, task) => total + task.rewardDiamonds, 0), 13);
});

test("only the arena wins task pays a card, the rest pay gold", () => {
  assert.deepEqual(DAILY_TASKS.filter(({ card }) => card).map(({ id }) => id), ["win-arenas"]);
  assert.ok(DAILY_TASKS.filter(({ card }) => !card).every(({ rewardGold }) => rewardGold > 0));
});
