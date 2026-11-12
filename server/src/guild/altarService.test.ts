import assert from "node:assert/strict";
import test from "node:test";
import { CATALOG_DATA } from "../collections/catalogData.generated.js";
import { WITCHES_COLLECTION_ID, buildGuildAltarView } from "./altarService.js";

test("altar bonus points at the real «Чотири чаклунки» catalog collection", () => {
  assert.equal(WITCHES_COLLECTION_ID, "collection_sorceresses");
  assert.ok(CATALOG_DATA.collections.some(({ code }) => `collection_${code}` === WITCHES_COLLECTION_ID));
});

test("altar view keeps the base increase and applies the Witch bonus only to gold", () => {
  const incomplete = buildGuildAltarView(10, 20, 10_000, false);
  assert.equal(incomplete.upgrades.find(({ currency }) => currency === "gold")?.totalIncrease, 1);
  assert.equal(incomplete.upgrades.find(({ currency }) => currency === "gold")?.collectionBonus, 0);

  const complete = buildGuildAltarView(10, 20, 10_000, true);
  assert.equal(complete.upgrades.find(({ currency }) => currency === "gold")?.totalIncrease, 3);
  assert.equal(complete.upgrades.find(({ currency }) => currency === "gold")?.collectionBonus, 2);
  assert.equal(complete.upgrades.find(({ currency }) => currency === "silver")?.totalIncrease, 1);
  assert.equal(complete.upgrades.find(({ currency }) => currency === "silver")?.collectionBonus, 0);
});
