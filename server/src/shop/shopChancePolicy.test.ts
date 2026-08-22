import assert from "node:assert/strict";
import test from "node:test";
import {
  halveChanceAfterSuccess,
  LOWER_PITY_ON_HIGHER_SUCCESS_POLICY,
  resolveShopRarity,
  type ShopRandomSource,
} from "./shopChancePolicy.js";
import { SHOP_OFFERS } from "./shopCatalog.js";

class SequenceRandomSource implements ShopRandomSource {
  constructor(private readonly values: number[]) {}

  nextInt(maxExclusive: number) {
    const value = this.values.shift();
    if (value === undefined || value >= maxExclusive) throw new Error("Missing deterministic RNG value");
    return value;
  }
}

test("base catalog contains only the three confirmed accumulated-chance offers", () => {
  assert.deepEqual(SHOP_OFFERS, [
    {
      id: "card_uncommon",
      currency: "silver",
      price: 500,
      guaranteedRarity: "uncommon",
      upgrades: [
        { rarity: "rare", initialChanceBasisPoints: 0, incrementBasisPoints: 350 },
        { rarity: "epic", initialChanceBasisPoints: 0, incrementBasisPoints: 25 },
      ],
    },
    {
      id: "card_epic",
      currency: "gold",
      price: 50,
      guaranteedRarity: "epic",
      upgrades: [
        { rarity: "legendary", initialChanceBasisPoints: 0, incrementBasisPoints: 350 },
        { rarity: "mythic", initialChanceBasisPoints: 0, incrementBasisPoints: 25 },
      ],
    },
    {
      id: "card_legendary",
      currency: "gold",
      price: 150,
      guaranteedRarity: "legendary",
      upgrades: [
        { rarity: "mythic", initialChanceBasisPoints: 0, incrementBasisPoints: 350 },
      ],
    },
  ]);
});

test("success halves the old chance and rounds upward to a whole percent", () => {
  assert.equal(halveChanceAfterSuccess(825), 500);
  assert.equal(halveChanceAfterSuccess(2_250), 1_200);
  assert.equal(halveChanceAfterSuccess(1_000), 500);
  assert.equal(halveChanceAfterSuccess(100), 100);
});

test("misses apply the offer-specific fixed-point increments without drift", () => {
  const result = resolveShopRarity(
    SHOP_OFFERS[0]!,
    [
      { rarity: "rare", chanceBasisPoints: 2_250 },
      { rarity: "epic", chanceBasisPoints: 825 },
    ],
    new SequenceRandomSource([9_999, 9_999]),
  );

  assert.equal(result.rarity, "uncommon");
  assert.deepEqual(result.updatedChances, [
    { rarity: "rare", chanceBasisPoints: 2_600, incrementBasisPoints: 350 },
    { rarity: "epic", chanceBasisPoints: 850, incrementBasisPoints: 25 },
  ]);
});

test("highest successful rarity wins and lower pity continues as a miss", () => {
  const result = resolveShopRarity(
    SHOP_OFFERS[0]!,
    [
      { rarity: "rare", chanceBasisPoints: 1_750 },
      { rarity: "epic", chanceBasisPoints: 225 },
    ],
    new SequenceRandomSource([0]),
  );

  assert.equal(LOWER_PITY_ON_HIGHER_SUCCESS_POLICY, "increment_as_miss");
  assert.equal(result.rarity, "epic");
  assert.deepEqual(result.updatedChances, [
    { rarity: "rare", chanceBasisPoints: 2_100, incrementBasisPoints: 350 },
    { rarity: "epic", chanceBasisPoints: 200, incrementBasisPoints: 25 },
  ]);
});

test("a lower upgrade can hit only after higher targets miss", () => {
  const result = resolveShopRarity(
    SHOP_OFFERS[1]!,
    [
      { rarity: "legendary", chanceBasisPoints: 350 },
      { rarity: "mythic", chanceBasisPoints: 25 },
    ],
    new SequenceRandomSource([9_999, 0]),
  );

  assert.equal(result.rarity, "legendary");
  assert.deepEqual(result.updatedChances, [
    { rarity: "legendary", chanceBasisPoints: 200, incrementBasisPoints: 350 },
    { rarity: "mythic", chanceBasisPoints: 50, incrementBasisPoints: 25 },
  ]);
});
