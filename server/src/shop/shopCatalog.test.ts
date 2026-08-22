import assert from "node:assert/strict";
import test from "node:test";
import { getPlayerFacingShopCatalog, SHOP_OFFERS } from "./shopCatalog.js";

test("base shop catalog has the three approved server-owned offers without weights", () => {
  assert.deepEqual(
    SHOP_OFFERS.map(({ id, currency, price, minimumRarity, allowedRarities, rarityWeights }) => ({
      id,
      currency,
      price,
      minimumRarity,
      allowedRarities,
      rarityWeights,
    })),
    [
      {
        id: "silver_card",
        currency: "silver",
        price: 500,
        minimumRarity: "uncommon",
        allowedRarities: ["uncommon", "rare", "epic"],
        rarityWeights: null,
      },
      {
        id: "epic_card",
        currency: "gold",
        price: 50,
        minimumRarity: "epic",
        allowedRarities: ["epic", "legendary", "mythic"],
        rarityWeights: null,
      },
      {
        id: "legendary_card",
        currency: "gold",
        price: 150,
        minimumRarity: "legendary",
        allowedRarities: ["legendary", "mythic"],
        rarityWeights: null,
      },
    ],
  );
});

test("player-facing catalog never exposes internal rarity weights", () => {
  const catalog = getPlayerFacingShopCatalog();
  assert.equal(catalog.offers.length, 3);
  assert.ok(catalog.offers.every((offer) => !("rarityWeights" in offer)));
});
