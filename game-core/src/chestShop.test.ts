import assert from "node:assert/strict";
import test from "node:test";
import {
  canOpenChestShop,
  CHEST_SHOP_CHESTS,
  CHEST_SHOP_OPEN_MS,
  getChestPrizeLevel,
  getChestShopChest,
  getChestShopWeekKey,
  pickChestPrizeKind,
} from "./chestShop.js";

test("the table matches the reference: 15 chests for 20 010 000 silver", () => {
  assert.equal(CHEST_SHOP_CHESTS.length, 15);
  assert.equal(CHEST_SHOP_CHESTS.reduce((sum, { price }) => sum + price, 0), 20_010_000);
  assert.deepEqual(getChestShopChest(1), { number: 1, price: 10_000, goldSmall: 20, goldLarge: 40, diamonds: 1, equipmentRarity: "common", levelsBelowNinthCard: 19 });
  assert.deepEqual(getChestShopChest(11), { number: 11, price: 1_000_000, goldSmall: 130, goldLarge: 260, diamonds: 11, equipmentRarity: "uncommon", levelsBelowNinthCard: 9 });
  assert.deepEqual(getChestShopChest(15), { number: 15, price: 7_000_000, goldSmall: 210, goldLarge: 420, diamonds: 15, equipmentRarity: "rare", levelsBelowNinthCard: 5 });
  assert.throws(() => getChestShopChest(16), RangeError);
});

test("card and source prizes follow the 9th deck card, level 1 below level 19", () => {
  assert.equal(getChestPrizeLevel(1, 18), 1);
  assert.equal(getChestPrizeLevel(1, 19), 1);
  assert.equal(getChestPrizeLevel(1, 40), 21);
  assert.equal(getChestPrizeLevel(15, 40), 35);
});

test("every prize kind can drop", () => {
  const kinds = new Set([0, 0.2, 0.4, 0.6, 0.8, 0.99].map((value) => pickChestPrizeKind(() => value)));
  assert.deepEqual([...kinds].sort(), ["card", "diamonds", "equipment", "gold_large", "gold_small", "source"]);
});

test("one weekly opening per Monday-to-Sunday week, never while open", () => {
  const sunday = new Date("2026-11-15T23:00:00Z");
  const monday = new Date("2026-11-16T00:30:00Z");
  assert.equal(getChestShopWeekKey(sunday), "2026-11-09");
  assert.equal(getChestShopWeekKey(monday), "2026-11-16");
  const closed = { openUntil: null, nextChest: 1, weeklyOpenedWeek: null };
  assert.equal(canOpenChestShop(closed, sunday), true);
  const used = { ...closed, weeklyOpenedWeek: "2026-11-09" };
  assert.equal(canOpenChestShop(used, sunday), false);
  assert.equal(canOpenChestShop(used, monday), true);
  const open = { ...closed, openUntil: new Date(monday.getTime() + CHEST_SHOP_OPEN_MS) };
  assert.equal(canOpenChestShop(open, monday), false);
});
