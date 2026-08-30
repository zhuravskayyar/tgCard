import assert from "node:assert/strict";
import test from "node:test";
import { getLariskaDailyReward } from "./dailyRewardsConfig.js";

test("Lariska daily rewards keep the useful seven-day mix", () => {
  assert.deepEqual(
    Array.from({ length: 7 }, (_, index) => getLariskaDailyReward(1, index + 1).kind),
    ["card", "equipment", "card", "gold", "arena_tokens_xp", "choice", "card"],
  );
  const dayThree = getLariskaDailyReward(1, 3);
  const daySeven = getLariskaDailyReward(1, 7);
  assert.equal(dayThree.kind, "card");
  assert.equal(daySeven.kind, "card");
  if (dayThree.kind === "card") assert.equal(dayThree.rarity, "rare");
  if (daySeven.kind === "card") assert.equal(daySeven.rarity, "epic");
});

test("the seventh day becomes stronger across accumulated weekly cycles", () => {
  assert.equal(getLariskaDailyReward(1, 7).kind, "card");
  assert.equal(getLariskaDailyReward(2, 7).label, "Скриня Лариски · Epic + 15 золота");
  assert.equal(getLariskaDailyReward(3, 7).kind, "equipment");
  assert.equal(getLariskaDailyReward(4, 7).kind, "choice");
});
