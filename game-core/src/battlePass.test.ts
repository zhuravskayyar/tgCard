import assert from "node:assert/strict";
import test from "node:test";
import {
  getNextBattlePassThreshold,
  isBattlePassCircleComplete,
  isBattlePassMilestoneClaimable,
} from "./battlePass.js";

test("battle pass finds the next cumulative threshold", () => {
  const thresholds = [
    { circle: 1, threshold: 50 },
    { circle: 1, threshold: 400 },
    { circle: 2, threshold: 460 },
  ] as const;
  assert.equal(getNextBattlePassThreshold(400, thresholds), 460);
  assert.equal(getNextBattlePassThreshold(500, thresholds), null);
});

test("battle pass only exposes an unclaimed reached reward", () => {
  assert.equal(isBattlePassMilestoneClaimable(50, 50, false), true);
  assert.equal(isBattlePassMilestoneClaimable(49, 50, false), false);
  assert.equal(isBattlePassMilestoneClaimable(50, 50, true), false);
});

test("empty control points do not block circle completion", () => {
  assert.equal(isBattlePassCircleComplete([
    { claimed: true, reward: { kind: "silver" } },
    { claimed: false, reward: null },
  ]), true);
});
