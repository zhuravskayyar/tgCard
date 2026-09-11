import assert from "node:assert/strict";
import test from "node:test";
import { isShopBundlePurchaseRequest, isShopPurchaseRequest } from "./shopRoute.js";

test("purchase input accepts only the canonical offer id", () => {
  assert.equal(isShopPurchaseRequest({ offerId: "card_uncommon" }), true);
  assert.equal(isShopPurchaseRequest({ offerId: "card_uncommon", price: 1 }), false);
  assert.equal(isShopPurchaseRequest({ offerId: "card_uncommon", rarity: "mythic" }), false);
  assert.equal(isShopPurchaseRequest({ offerId: " " }), false);
  assert.equal(isShopPurchaseRequest(null), false);
});

test("bundle purchase input accepts only the canonical bundle id", () => {
  assert.equal(isShopBundlePurchaseRequest({ bundleId: "elemental-spirits" }), true);
  assert.equal(isShopBundlePurchaseRequest({ bundleId: "elemental-spirits", price: 1 }), false);
  assert.equal(isShopBundlePurchaseRequest({ offerId: "elemental-spirits" }), false);
  assert.equal(isShopBundlePurchaseRequest({ bundleId: " " }), false);
  assert.equal(isShopBundlePurchaseRequest(null), false);
});
