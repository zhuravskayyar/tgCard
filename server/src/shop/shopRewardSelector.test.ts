import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient } from "pg";
import { selectCanonicalShopReward, ShopRewardUnavailableError } from "./shopRewardSelector.js";

test("reward selection filters canonical Shop cards by minimum rarity", async () => {
  let queryText = "";
  let queryValues: unknown[] = [];
  const client = {
    query: async (text: string, values: unknown[]) => {
      queryText = text;
      queryValues = values;
      return {
        rows: [{
          card_id: "eligible_rare",
          code: "eligible_rare",
          display_name: "Eligible rare",
          description: "Static test description for an eligible rare card returned by the selector fixture.",
          art_key: null,
          element: "air",
          min_rarity: "uncommon",
          target_rarity: "rare",
          collection_id: null,
        }],
      };
    },
  } as unknown as PoolClient;

  const reward = await selectCanonicalShopReward(client, "rare", { nextInt: () => 0 });
  assert.match(queryText, /cards\.shop_eligible = TRUE/);
  assert.match(queryText, /cards\.min_rarity/);
  assert.match(queryText, /cards\.source = 'standard'/);
  assert.deepEqual(queryValues, ["rare"]);
  assert.equal(reward.id, "eligible_rare");
  assert.equal(reward.targetRarity, "rare");
});

test("missing eligible canonical cards return a clear blocker", async () => {
  const client = { query: async () => ({ rows: [] }) } as unknown as PoolClient;
  await assert.rejects(
    selectCanonicalShopReward(client, "mythic", { nextInt: () => 0 }),
    (error) => error instanceof ShopRewardUnavailableError && error.rarity === "mythic",
  );
});
