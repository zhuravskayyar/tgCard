import assert from "node:assert/strict";
import test from "node:test";
import { isShopPurchaseRequest } from "./shopRoute.js";

test("purchase input accepts only the canonical offer id", () => {
  assert.equal(isShopPurchaseRequest({ offerId: "silver_card" }), true);
  assert.equal(isShopPurchaseRequest({ offerId: "silver_card", price: 1 }), false);
  assert.equal(isShopPurchaseRequest({ offerId: "silver_card", rarity: "mythic" }), false);
  assert.equal(isShopPurchaseRequest({ offerId: " " }), false);
  assert.equal(isShopPurchaseRequest(null), false);
});
