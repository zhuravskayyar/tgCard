import assert from "node:assert/strict";
import test from "node:test";
import { DUEL_CAPACITY, DUEL_COOLDOWN_MS, getDuelAvailability, spendDuel } from "./duelCooldown.js";

const now = new Date("2026-11-11T12:00:00.000Z");

test("a completed ten-duel cycle starts a cooldown and refills only after it expires", () => {
  let availability = getDuelAvailability({ duel_remaining: DUEL_CAPACITY, duel_refill_at: null }, now);
  for (let duel = 0; duel < DUEL_CAPACITY; duel += 1) {
    availability = spendDuel(availability, now);
  }
  assert.equal(availability.remaining, 0);
  assert.equal(availability.refillAt, new Date(now.getTime() + DUEL_COOLDOWN_MS).toISOString());
  assert.throws(() => spendDuel(availability, now));
  assert.equal(getDuelAvailability({ duel_remaining: 0, duel_refill_at: availability.refillAt }, new Date(now.getTime() + DUEL_COOLDOWN_MS - 1)).remaining, 0);
  assert.deepEqual(getDuelAvailability({ duel_remaining: 0, duel_refill_at: availability.refillAt }, new Date(now.getTime() + DUEL_COOLDOWN_MS)), {
    remaining: 10, max: 10, refillAt: null,
  });
});

test("the completed collection shortens the duel break by 30 minutes", () => {
  const availability = spendDuel({ remaining: 1, max: 10, refillAt: null }, now, 30);
  assert.equal(availability.refillAt, new Date(now.getTime() + 90 * 60_000).toISOString());
});
