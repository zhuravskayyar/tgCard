import assert from "node:assert/strict";
import test from "node:test";
import { calculateGuildRaidCurrencyReward, getGuildRaidCurrencyRewardPercentage } from "./guildRaid.js";

test("guild raid currency rewards stay equal through place ten", () => {
  assert.deepEqual(
    Array.from({ length: 7 }, (_, index) => calculateGuildRaidCurrencyReward(index + 4, 1)),
    Array.from({ length: 7 }, () => ({ gold: 50, percentage: 100, silver: 50_000 })),
  );
});

test("guild raid currency rewards fall from place eleven", () => {
  assert.deepEqual(
    [11, 12, 13, 14, 15, 16].map(getGuildRaidCurrencyRewardPercentage),
    [50, 40, 30, 20, 10, 0],
  );
  assert.deepEqual(calculateGuildRaidCurrencyReward(11, 1), { gold: 25, percentage: 50, silver: 25_000 });
  assert.deepEqual(calculateGuildRaidCurrencyReward(11, 2), { gold: 50, percentage: 50, silver: 50_000 });
});
