import assert from "node:assert/strict";
import test from "node:test";
import type { CardRarity } from "@cardastika/shared";
import { SHOP_LEVEL_RANGES, selectShopLevelForRarity } from "./cardProgression.js";

for (const rarity of ["uncommon", "rare", "epic", "legendary", "mythic"] as const satisfies readonly CardRarity[]) {
  test(`Shop ${rarity} levels stay inside the canonical range`, () => {
    const range = SHOP_LEVEL_RANGES[rarity]!;
    assert.equal(selectShopLevelForRarity(rarity, { nextInt: () => 0 }), range.minimumLevel);
    assert.equal(
      selectShopLevelForRarity(rarity, { nextInt: (size) => size - 1 }),
      range.maximumLevel,
    );
  });
}

test("normal Shop never generates Mythic levels 76–180", () => {
  const levels = Array.from({ length: 16 }, (_, offset) => (
    selectShopLevelForRarity("mythic", { nextInt: () => offset })
  ));
  assert.deepEqual(levels, Array.from({ length: 16 }, (_, index) => index + 60));
  assert.equal(Math.max(...levels), 75);
});
