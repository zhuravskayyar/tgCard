import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { CardRarity } from "@cardastika/shared";
import {
  BASE_POWER_BY_LEVEL,
  CARD_LEVEL_TABLE,
  advanceCardLevel,
  applyElementalPotential,
  canLevelUp,
  generateStandardBonusPower,
  getBasePowerForLevel,
  getCardPower,
  getRarityForLevel,
  getTransferableElementValue,
  getUpgradeGoldPrice,
  isGoldLevel,
  selectGeneratedLevelForRarity,
} from "./cardProgression.js";

test("derives rarity at every canonical boundary and rejects invalid levels", () => {
  const boundaries: readonly (readonly [number, CardRarity])[] = [
    [1, "common"], [4, "common"], [5, "uncommon"], [9, "uncommon"],
    [10, "rare"], [19, "rare"], [20, "epic"], [34, "epic"],
    [35, "legendary"], [59, "legendary"], [60, "mythic"], [180, "mythic"],
  ];
  for (const [level, rarity] of boundaries) assert.equal(getRarityForLevel(level), rarity);
  assert.throws(() => getRarityForLevel(0), RangeError);
  assert.throws(() => getRarityForLevel(181), RangeError);
});

test("contains and exposes the exhaustive canonical 180-level base-power table", () => {
  assert.equal(BASE_POWER_BY_LEVEL.length, 180);
  assert.equal(
    createHash("sha256").update(BASE_POWER_BY_LEVEL.join(",")).digest("hex"),
    "5225fa63d7af7f281a3ba94a2eb83394a16127afd7bf79449f34f9f4a119bf97",
  );
  for (let level = 1; level <= 180; level += 1) {
    assert.equal(getBasePowerForLevel(level), BASE_POWER_BY_LEVEL[level - 1]);
  }
  assert.deepEqual(
    [1, 5, 10, 20, 35, 60, 80, 99, 120, 150, 180].map(getBasePowerForLevel),
    [10, 70, 170, 500, 1240, 2930, 5230, 7090, 9320, 12640, 16660],
  );
  assert.throws(() => getBasePowerForLevel(0), RangeError);
  assert.throws(() => getBasePowerForLevel(181), RangeError);
  assert.equal(CARD_LEVEL_TABLE.length, 180);
  assert.deepEqual(CARD_LEVEL_TABLE[14], {
    level: 15,
    basePower: 310,
    powerIncrease: 60,
    goldUpgradeCost: 4,
    minimumGoldCost: 2,
    elementValue: 2,
  });
});

test("gold-level boundaries use the one permanent rule", () => {
  for (const level of [5, 10, 85, 90, 91, 120, 180]) assert.equal(isGoldLevel(level), true);
  for (const level of [1, 4, 86, 89]) assert.equal(isGoldLevel(level), false);
});

test("canonical price reduction preserves the mandatory gold minimum", () => {
  assert.equal(getUpgradeGoldPrice(15, 0), 4);
  assert.equal(getUpgradeGoldPrice(15, 50), 3);
  assert.equal(getUpgradeGoldPrice(15, 100), 2);
  assert.equal(getUpgradeGoldPrice(14, 100), null);
  assert.deepEqual(
    canLevelUp({ level: 14, levelProgressElements: 100, storedElements: 0 }, 1),
    { availability: "insufficient_gold", requiredGold: 2 },
  );
});

test("absorbed potential and overflow remain transferable across cards", () => {
  assert.equal(getTransferableElementValue({ level: 10, levelProgressElements: 7, storedElements: 11 }), 20);
  assert.deepEqual(
    applyElementalPotential({ level: 14, levelProgressElements: 96, storedElements: 2 }, 10),
    { levelProgressElements: 100, storedElements: 8 },
  );
  assert.deepEqual(
    advanceCardLevel({ level: 14, levelProgressElements: 100, storedElements: 8 }),
    { level: 15, levelProgressElements: 8, storedElements: 0 },
  );
});

test("starter and level-up power retain the instance bonus", () => {
  assert.equal(getCardPower({ level: 1, bonusPower: 2 }), 12);
  assert.equal(getCardPower({ level: 79, bonusPower: 900 }), 5680);
  assert.equal(getCardPower({ level: 80, bonusPower: 900 }), 6130);
  assert.equal(
    getCardPower({ level: 80, bonusPower: 900 }) - getCardPower({ level: 79, bonusPower: 900 }),
    450,
  );
});

test("level 19 to 20 keeps bonus power and crosses the rare-to-epic boundary", () => {
  assert.equal(getBasePowerForLevel(19), 390);
  assert.equal(getCardPower({ level: 19, bonusPower: 40 }), 430);
  assert.equal(getRarityForLevel(19), "rare");
  assert.equal(getBasePowerForLevel(20), 500);
  assert.equal(getCardPower({ level: 20, bonusPower: 40 }), 540);
  assert.equal(getRarityForLevel(20), "epic");
});

test("standard creation bonus is integral, bounded by twenty percent, and injectable", () => {
  assert.equal(generateStandardBonusPower(10, { nextInt: () => 0 }), 0);
  assert.equal(generateStandardBonusPower(10, { nextInt: (maximum) => maximum - 1 }), 2);
  assert.equal(generateStandardBonusPower(2930, { nextInt: (maximum) => maximum - 1 }), 586);
  assert.throws(() => generateStandardBonusPower(10, { nextInt: () => 3 }), RangeError);
});

test("shop level selection has no hidden policy and validates an injected one", () => {
  const rng = { nextInt: () => 0 };
  assert.equal(selectGeneratedLevelForRarity("rare", rng, () => 10), 10);
  assert.throws(() => selectGeneratedLevelForRarity("rare", rng, () => 9), RangeError);
});
