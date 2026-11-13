import assert from "node:assert/strict";
import test from "node:test";
import { CATALOG_DATA } from "../collections/catalogData.generated.js";
import { WITCHES_COLLECTION_ID, buildGuildAltarView } from "./altarService.js";

test("altar bonus points at the real «Чотири чаклунки» catalog collection", () => {
  assert.equal(WITCHES_COLLECTION_ID, "collection_sorceresses");
  assert.ok(CATALOG_DATA.collections.some(({ code }) => `collection_${code}` === WITCHES_COLLECTION_ID));
});

test("altar potions follow last week's witch level; the collection lifts only the gold potion", () => {
  const plain = buildGuildAltarView(10, 100, 100_000, false, 34);
  assert.deepEqual(plain.upgrades.map(({ currency, hpPct, price }) => ({ currency, hpPct, price })), [
    { currency: "gold", hpPct: 10, price: 20 },
    { currency: "silver", hpPct: 5, price: 10_000 },
  ]);
  const complete = buildGuildAltarView(10, 100, 100_000, true, 34);
  assert.equal(complete.upgrades[0]?.hpPct, 12);
  assert.equal(complete.upgrades[0]?.price, 20);
  assert.equal(complete.upgrades[1]?.hpPct, 5);
});

test("altar is locked below guild level 34 and empty without last week's witches", () => {
  assert.equal(buildGuildAltarView(10, 100, 100_000, false, 33).unlocked, false);
  assert.ok(buildGuildAltarView(10, 100, 100_000, false, 33).upgrades.every(({ canAfford }) => !canAfford));
  assert.ok(buildGuildAltarView(0, 100, 100_000, false, 40).upgrades.every(({ canAfford }) => !canAfford));
});

test("a potion bought today cannot be bought again", () => {
  const view = buildGuildAltarView(5, 100, 100_000, false, 34, [{ currency: "gold", hpPct: 5 }]);
  assert.equal(view.upgrades[0]?.canAfford, false);
  assert.equal(view.upgrades[1]?.canAfford, true);
  assert.equal(view.active?.hpPct, 5);
});
