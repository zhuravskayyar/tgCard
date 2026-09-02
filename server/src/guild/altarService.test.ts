import assert from "node:assert/strict";
import test from "node:test";
import { buildGuildAltarView } from "./altarService.js";

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
