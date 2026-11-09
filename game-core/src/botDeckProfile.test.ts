import assert from "node:assert/strict";
import test from "node:test";
import { distributeDeckPowerByProfile, getDeckPowerProfile } from "./botDeckProfile.js";

const options = { deckSize: 9, minCardPower: 10 };
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
const randomFrom = (seed: number) => () => {
  seed = (seed * 16_807) % 2_147_483_647;
  return (seed - 1) / 2_147_483_646;
};

test("bot copies a spiky player deck: most cards weak, one clearly strong", () => {
  const player = [12, 12, 12, 12, 84, 12, 12, 12, 12];
  for (let seed = 1; seed <= 50; seed += 1) {
    const total = 198; // +10% over the player's 180
    const powers = distributeDeckPowerByProfile(player, total, options, randomFrom(seed));
    assert.equal(powers.length, 9);
    assert.equal(sum(powers), total);
    const sorted = [...powers].sort((left, right) => right - left);
    assert.ok(sorted[0]! >= 75, `strong slot ${sorted[0]}`);
    assert.ok(sorted.slice(1).every((power) => power >= 10 && power <= 17), `weak slots ${sorted}`);
  }
});

test("flat player deck gives a flat bot deck with small spread", () => {
  const powers = distributeDeckPowerByProfile(Array(9).fill(100), 950, options, randomFrom(7));
  assert.equal(sum(powers), 950);
  assert.ok(powers.every((power) => power >= 90 && power <= 122), String(powers));
});

test("minimum card power is respected and the total stays exact", () => {
  const powers = distributeDeckPowerByProfile([10, 10, 10, 10, 10, 10, 10, 10, 500], 95, options, () => 0);
  assert.equal(sum(powers), 95);
  assert.ok(powers.every((power) => power >= 10));
});

test("empty and incomplete decks still produce nine valid slots", () => {
  assert.deepEqual(getDeckPowerProfile([], 9), Array(9).fill(1));
  assert.deepEqual(getDeckPowerProfile([50, 10, 30], 9), [50, 30, 10, 30, 30, 30, 30, 30, 30]);
  const empty = distributeDeckPowerByProfile([], 180, options, () => 0.5);
  assert.deepEqual(empty, Array(9).fill(20));
  const partial = distributeDeckPowerByProfile([84, 12], 300, options, () => 0.5);
  assert.equal(partial.length, 9);
  assert.equal(sum(partial), 300);
  assert.ok(partial.every((power) => power >= 10));
});

test("invalid totals and random sources are rejected", () => {
  assert.throws(() => distributeDeckPowerByProfile([], 89, options, () => 0), RangeError);
  assert.throws(() => distributeDeckPowerByProfile([], 180, options, () => 1), /RNG/);
});
