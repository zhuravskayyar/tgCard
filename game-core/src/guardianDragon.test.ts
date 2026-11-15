import assert from "node:assert/strict";
import test from "node:test";
import { MAX_CARD_LEVEL } from "./cardProgression.js";
import {
  GUARDIAN_DRAGON_FLAME_START_LEVEL,
  GUARDIAN_DRAGON_MAX_HEALTH,
  getGuardianDragonFlameUpgrade,
  addGuardianDragonHealth,
  canStartGuardianDragonHike,
  getGuardianDragonFeedMinutes,
  getGuardianDragonFlameDamage,
  getGuardianDragonFlamePower,
  isGuardianDragonFreeSendReady,
  resolveGuardianDragonFights,
  getGuardianDragonFreeFights,
  getGuardianDragonHike,
  getGuardianDragonMonthKey,
  getGuardianDragonPaidSendPrice,
  getGuardianDragonRebirthMastery,
  getGuardianDragonStage,
  selectGuardianDragonFeed,
} from "./guardianDragon.js";

test("hikes give the reference health", () => {
  assert.deepEqual([2, 4, 8].map((hours) => getGuardianDragonHike(hours as 2 | 4 | 8).health), [80, 160, 320]);
  assert.equal(getGuardianDragonHike(4).minutes, 240);
});

test("health stops at 17 600", () => {
  assert.equal(addGuardianDragonHealth(17_500, 320), GUARDIAN_DRAGON_MAX_HEALTH);
  assert.equal(addGuardianDragonHealth(0, 80), 80);
});

test("reference daily maximum: 3 eight-hour hikes give 960 and fill the cap in 18 d 8 h", () => {
  const perDay = 3 * getGuardianDragonHike(8).health;
  assert.equal(perDay, 960);
  assert.equal(Math.ceil(GUARDIAN_DRAGON_MAX_HEALTH / getGuardianDragonHike(8).health) * 8, 18 * 24 + 8);
});

test("a hike needs enough progress and no running hike", () => {
  assert.equal(canStartGuardianDragonHike(119, 2, false), false);
  assert.equal(canStartGuardianDragonHike(120, 2, false), true);
  assert.equal(canStartGuardianDragonHike(480, 8, true), false);
});

test("feeding stops once the 8-hour scale is full", () => {
  assert.equal(getGuardianDragonFeedMinutes(1), 1);
  assert.equal(getGuardianDragonFeedMinutes(1444), 14);
  const cards = [{ power: 30_000 }, { power: 30_000 }, { power: 10 }];
  const result = selectGuardianDragonFeed(0, cards);
  assert.equal(result.cards.length, 2);
  assert.equal(result.progressMinutes, 480);
  assert.equal(selectGuardianDragonFeed(480, cards).cards.length, 0);
});

test("free fights run from 10 at 0 to 220 at the cap, in steps", () => {
  assert.equal(getGuardianDragonFreeFights(0), 10);
  assert.equal(getGuardianDragonFreeFights(320), 10);
  assert.equal(getGuardianDragonFreeFights(1760), 31);
  assert.equal(getGuardianDragonFreeFights(17_600), 220);
  assert.equal(getGuardianDragonFreeFights(99_999), 220);
});

test("paid sends follow the reference ladder and total 5250 for 30", () => {
  const prices = Array.from({ length: 30 }, (_, index) => getGuardianDragonPaidSendPrice(index));
  assert.deepEqual(prices.slice(0, 11), [10, 10, 10, 20, 20, 20, 40, 40, 40, 40, 100]);
  assert.equal(prices.reduce((sum, price) => sum + price, 0), 5250);
  assert.equal(getGuardianDragonPaidSendPrice(40), 300);
});

test("dragon flame matches the reference example", () => {
  assert.equal(getGuardianDragonFlameDamage(10_000, 56), 5600);
  assert.equal(getGuardianDragonFlameDamage(10_000, 56, { dragonFans: true }), 6600);
  assert.equal(getGuardianDragonFlameDamage(10_000, 56, { dragonWhisperers: true }), 11_200);
  assert.equal(getGuardianDragonFlameDamage(10_000, 56, { dragonFans: true, dragonWhisperers: true }), 13_200);
});

test("the dragon is an egg without health", () => {
  assert.equal(getGuardianDragonStage(0), 0);
  assert.equal(getGuardianDragonStage(80), 1);
  assert.equal(getGuardianDragonStage(17_600), 4);
});

test("month key and rebirth mastery", () => {
  assert.equal(getGuardianDragonMonthKey(new Date("2026-11-30T23:59:59Z")), "2026-11");
  assert.equal(getGuardianDragonMonthKey(new Date("2026-12-01T00:00:00Z")), "2026-12");
  assert.equal(getGuardianDragonRebirthMastery(80, 100), 80);
  assert.equal(getGuardianDragonRebirthMastery(80, 101), 45);
  assert.equal(getGuardianDragonRebirthMastery(80, null), 45);
});

test("the flame card matches the live reference: level 90 gives 2817 at 45 and 3130 at 50", () => {
  assert.equal(getGuardianDragonFlamePower(90, 45), 2817);
  assert.equal(getGuardianDragonFlamePower(90, 50), 3130);
  assert.equal(getGuardianDragonFlamePower(91, 50) - getGuardianDragonFlamePower(90, 50), 45);
});

test("fights add half a mastery point each and rating only for wins", () => {
  const allWins = resolveGuardianDragonFights(10, 450, () => 0);
  assert.equal(allWins.masteryTenths, 500);
  assert.equal(allWins.wins, 10);
  assert.equal(allWins.ratingGain, 110);
  const noWins = resolveGuardianDragonFights(10, 450, () => 0.999);
  assert.equal(noWins.wins, 0);
  assert.equal(noWins.ratingGain, 0);
  assert.equal(noWins.masteryTenths, 500);
});

test("the free send reopens after the cooldown", () => {
  const now = new Date("2031-01-01T10:00:00Z");
  assert.equal(isGuardianDragonFreeSendReady(null, now), true);
  assert.equal(isGuardianDragonFreeSendReady(new Date("2031-01-01T10:00:01Z"), now), false);
  assert.equal(isGuardianDragonFreeSendReady(new Date("2031-01-01T09:59:59Z"), now), true);
});

test("the flame levels up like a card: 90 to 91 costs 3400 and adds +45 power at mastery 50", () => {
  const start = { level: GUARDIAN_DRAGON_FLAME_START_LEVEL, levelProgressElements: 0, storedElements: 0 };
  const upgrade = getGuardianDragonFlameUpgrade(start, 3400, 50);
  assert.equal(upgrade.requiredGold, 3400);
  assert.equal(upgrade.powerGain, 45);
  assert.equal(upgrade.availability, "ready");
  assert.equal(getGuardianDragonFlameUpgrade(start, 3399, 50).availability, "insufficient_gold");
  // Elemental progress lowers the price exactly as it does for cards.
  const half = getGuardianDragonFlameUpgrade({ ...start, levelProgressElements: upgrade.requiredElements / 2 }, 0, 50);
  assert.ok(half.requiredGold! < 3400 && half.requiredGold! >= 1500);
  assert.equal(half.percent, 50);
  // Fans add 10 mastery, whisperers double the gain.
  assert.equal(getGuardianDragonFlameUpgrade(start, 0, 50, { dragonFans: true, dragonWhisperers: true }).powerGain, 108);
});

test("the flame stops at the maximum card level", () => {
  const top = getGuardianDragonFlameUpgrade({ level: MAX_CARD_LEVEL, levelProgressElements: 0, storedElements: 0 }, 1_000_000, 50);
  assert.equal(top.availability, "maximum_level");
  assert.equal(top.requiredGold, null);
  assert.equal(top.powerGain, null);
});
