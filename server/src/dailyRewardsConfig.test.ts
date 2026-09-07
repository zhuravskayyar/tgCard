import assert from "node:assert/strict";
import test from "node:test";
import { getLariskaDailyReward } from "./dailyRewardsConfig.js";

const rewardAt = (streak: number) => getLariskaDailyReward(Math.floor((streak - 1) / 7) + 1, (streak - 1) % 7 + 1);
test("daily currency rewards grow across week boundaries and cap at day 30", () => {
  const first = rewardAt(1);
  assert.deepEqual([first.silver, first.gold, first.diamonds], [500, 2, 1]);
  for (let day = 2; day <= 30; day++) {
    const previous = rewardAt(day - 1);
    const current = rewardAt(day);
    assert.equal(current.kind, "currencies");
    assert.ok(current.silver > previous.silver);
    assert.ok(current.gold > previous.gold);
    assert.ok(current.diamonds >= previous.diamonds);
  }
  const maximum = rewardAt(30);
  assert.deepEqual([maximum.silver, maximum.gold, maximum.diamonds], [15000, 31, 10]);
  assert.deepEqual(rewardAt(31), maximum);
  assert.deepEqual(rewardAt(365), maximum);
});
test("invalid daily reward positions are rejected", () => {
  for (const [cycle, day] of [[0, 1], [1, 0], [1, 8], [1.5, 1], [1, NaN]]) {
    assert.throws(() => getLariskaDailyReward(cycle!, day!), RangeError);
  }
});
