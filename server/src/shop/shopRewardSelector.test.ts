import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient } from "pg";
import { selectCanonicalShopReward, ShopRewardUnavailableError } from "./shopRewardSelector.js";

test("reward selection queries only exact-rarity explicitly shop-eligible cards", async () => {
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
          art_key: null,
          element: "air",
          rarity: "rare",
          power: 28,
          collection_id: null,
        }],
      };
    },
  } as unknown as PoolClient;

  const reward = await selectCanonicalShopReward(client, "rare", { nextInt: () => 0 });
  assert.match(queryText, /shop_eligible = TRUE/);
  assert.deepEqual(queryValues, ["rare"]);
  assert.equal(reward.cardId, "eligible_rare");
  assert.equal(reward.rarity, "rare");
});

test("missing eligible canonical cards return a clear blocker", async () => {
  const client = { query: async () => ({ rows: [] }) } as unknown as PoolClient;
  await assert.rejects(
    selectCanonicalShopReward(client, "mythic", { nextInt: () => 0 }),
    (error) => error instanceof ShopRewardUnavailableError && error.rarity === "mythic",
  );
});
