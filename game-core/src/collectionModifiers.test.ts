import assert from "node:assert/strict";
import test from "node:test";
import { applyAbsorptionEfficiency, getPlayerCollectionModifiers } from "./collectionModifiers.js";

test("completed collection modifiers stack additively in one aggregation", () => {
  const modifiers = getPlayerCollectionModifiers([
    { type: "battle_damage_pct", value: 3 },
    { type: "battle_damage_pct", value: 5 },
    { type: "element_damage_pct", value: 4, element: "water" },
    { type: "absorption_efficiency_pct", value: 4 },
    { type: "absorption_efficiency_pct", value: 6 },
  ]);
  assert.equal(modifiers.battleDamagePct, 8);
  assert.equal(modifiers.elementDamagePct.water, 4);
  assert.equal(modifiers.absorptionEfficiencyPct, 10);
  assert.equal(applyAbsorptionEfficiency(100, modifiers), 110);
});
