import assert from "node:assert/strict";
import test from "node:test";
import { getStartingHp } from "./duel.js";
import { GUARDIAN_DRAGON_MAX_HEALTH } from "./guardianDragon.js";
import { addFlatBattleHp, getGuardianDragonBattleHealthBonus } from "./guardianDragonBattle.js";

const now = new Date("2026-11-15T12:00:00Z");
const base = { unlocked: true, rowMonthKey: "2026-11", currentMonthKey: "2026-11", health: 500, hikeEndsAt: null, now };

test("dragon bonus equals its health when unlocked, current month and at home", () => {
  assert.equal(getGuardianDragonBattleHealthBonus(base), 500);
});

test("dragon bonus is zero when locked, reborn month is stale or no row exists", () => {
  assert.equal(getGuardianDragonBattleHealthBonus({ ...base, unlocked: false }), 0);
  assert.equal(getGuardianDragonBattleHealthBonus({ ...base, rowMonthKey: "2026-10" }), 0);
  assert.equal(getGuardianDragonBattleHealthBonus({ ...base, rowMonthKey: null }), 0);
});

test("dragon bonus is zero while a hike runs and includes the gain once it is over", () => {
  assert.equal(getGuardianDragonBattleHealthBonus({ ...base, hikeEndsAt: new Date("2026-11-15T13:00:00Z"), hikeHealthGain: 80 }), 0);
  assert.equal(getGuardianDragonBattleHealthBonus({ ...base, hikeEndsAt: new Date("2026-11-15T11:00:00Z"), hikeHealthGain: 80 }), 580);
  assert.equal(getGuardianDragonBattleHealthBonus({ ...base, health: GUARDIAN_DRAGON_MAX_HEALTH, hikeEndsAt: now, hikeHealthGain: 80 }), GUARDIAN_DRAGON_MAX_HEALTH);
});

test("flat bonus is added after percent bonuses and multipliers, and is never multiplied", () => {
  const arena = getStartingHp(1_000 * 3, 10);
  assert.equal(arena, 3_300);
  assert.equal(addFlatBattleHp(arena, 500), 3_800);
  assert.equal(addFlatBattleHp(1_000), 1_000);
  assert.equal(addFlatBattleHp(1_000, -5), 1_000);
});
