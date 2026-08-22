import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient } from "pg";
import { SHOP_OFFERS, type ShopOfferDefinition } from "./shopCatalog.js";
import {
  selectCanonicalShopReward,
  selectConfiguredShopRarity,
  ShopRewardPolicyUnavailableError,
} from "./shopRewardSelector.js";

test("production rarity selection fails closed while exact weights are absent", () => {
  assert.throws(
    () => selectConfiguredShopRarity(SHOP_OFFERS[0]!),
    (error) => error instanceof ShopRewardPolicyUnavailableError,
  );
});

test("configured rarity selection uses only complete approved weights", () => {
  const offer: ShopOfferDefinition = {
    ...SHOP_OFFERS[0]!,
    rarityWeights: [
      { rarity: "uncommon", weight: 5 },
      { rarity: "rare", weight: 3 },
      { rarity: "epic", weight: 2 },
    ],
  };

  assert.equal(selectConfiguredShopRarity(offer, () => 0), "uncommon");
  assert.equal(selectConfiguredShopRarity(offer, () => 5), "rare");
  assert.equal(selectConfiguredShopRarity(offer, () => 9), "epic");
});

test("canonical reward selection cannot return an unknown card or disallowed rarity", async () => {
  let selectedRarity: unknown;
  const client = {
    query: async (_sql: string, values: unknown[]) => {
      selectedRarity = values[0];
      return {
        rows: [{
          card_id: "canonical_01",
          code: "canonical_01",
          display_name: "Canonical card",
          art_key: null,
          element: "fire",
          rarity: "rare",
          power: 25,
          collection_id: null,
        }],
      };
    },
  } as unknown as PoolClient;

  const reward = await selectCanonicalShopReward(client, SHOP_OFFERS[0]!, () => "rare", () => 0);
  assert.equal(selectedRarity, "rare");
  assert.equal(reward.cardId, "canonical_01");
  assert.equal(reward.rarity, "rare");

  await assert.rejects(
    selectCanonicalShopReward(client, SHOP_OFFERS[0]!, () => "mythic", () => 0),
    (error) => error instanceof ShopRewardPolicyUnavailableError,
  );
});
