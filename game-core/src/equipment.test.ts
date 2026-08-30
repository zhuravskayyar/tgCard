import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateEquipmentSummary,
  EQUIPMENT_BONUS_BY_RARITY,
  EQUIPMENT_FORGE_RECIPES,
  getEquipmentBattleModifiers,
  resolveEquipmentForgeResult,
  STARTER_EQUIPMENT_DEFINITIONS,
} from "./equipment.js";

function definitions(...ids: string[]) {
  return ids.map((id) => {
    const definition = STARTER_EQUIPMENT_DEFINITIONS.find((item) => item.id === id);
    assert.ok(definition, `Missing equipment ${id}`);
    return definition;
  });
}

test("contains the full source-compatible equipment catalog", () => {
  assert.equal(STARTER_EQUIPMENT_DEFINITIONS.length, 126);
  assert.deepEqual(EQUIPMENT_BONUS_BY_RARITY, {
    common: 25,
    uncommon: 50,
    rare: 100,
    epic: 200,
    legendary: 400,
    mythic: 1_000,
  });
  assert.equal(STARTER_EQUIPMENT_DEFINITIONS.filter(({ category }) => category === "things").length, 96);
  assert.equal(STARTER_EQUIPMENT_DEFINITIONS.filter(({ category }) => category === "artifacts").length, 30);
});

test("reuses one base sprite key across rarity records", () => {
  const thingAssetKeys = new Set(
    STARTER_EQUIPMENT_DEFINITIONS.filter(({ category }) => category === "things").map(({ assetKey }) => assetKey),
  );
  const artifactAssetKeys = new Set(
    STARTER_EQUIPMENT_DEFINITIONS.filter(({ category }) => category === "artifacts").map(({ assetKey }) => assetKey),
  );
  assert.equal(thingAssetKeys.size, 16);
  assert.deepEqual([...artifactAssetKeys].sort(), ["amulet", "relic", "shield", "voodoo", "weapon"]);

  const commonBoots = STARTER_EQUIPMENT_DEFINITIONS.find(({ id }) => id === "equipment_boots_fire_common");
  const mythicBoots = STARTER_EQUIPMENT_DEFINITIONS.find(({ id }) => id === "equipment_boots_fire_mythic");
  assert.equal(commonBoots?.assetKey, "boots-fire");
  assert.equal(mythicBoots?.assetKey, commonBoots?.assetKey);
  assert.equal(commonBoots?.frameKey, "rarity-common");
  assert.equal(mythicBoots?.frameKey, "rarity-mythic");
  assert.equal(commonBoots?.effectKey, undefined);
});

test("applies the same-rarity set bonus to four things", () => {
  const summary = calculateEquipmentSummary(definitions(
    "equipment_head_fire_common",
    "equipment_cloak_fire_common",
    "equipment_gloves_fire_common",
    "equipment_boots_fire_common",
  ));

  assert.equal(summary.itemBonusTotal, 100);
  assert.equal(summary.adjustedItemBonusTotal, 125);
  assert.equal(summary.elementBonuses.fire, 125);
  assert.equal(summary.activeSets[0]?.id, "single_rarity");
  assert.equal(summary.allDecksReceiveElementBonuses, false);
});

test("activates the all-elements set and combines it with same rarity", () => {
  const summary = calculateEquipmentSummary(definitions(
    "equipment_head_fire_common",
    "equipment_cloak_water_common",
    "equipment_gloves_earth_common",
    "equipment_boots_air_common",
  ));

  assert.deepEqual(summary.activeSets.map(({ id }) => id), ["single_rarity", "elemental_harmony"]);
  assert.equal(summary.allDecksReceiveElementBonuses, true);
  assert.deepEqual(summary.elementBonuses, { fire: 125, water: 125, earth: 125, air: 125 });
});

test("models all five artifact effects, including the mirror pair", () => {
  const summary = calculateEquipmentSummary(definitions(
    "equipment_weapon_common",
    "equipment_shield_uncommon",
    "equipment_relic_rare",
    "equipment_amulet_epic",
    "equipment_voodoo_legendary",
  ));

  assert.equal(summary.itemBonusTotal, 0);
  assert.equal(summary.artifactBonuses.length, 5);
  assert.equal(summary.artifactBonuses.find(({ itemId }) => itemId === "equipment_relic_rare")?.secondaryValue, 4);
  assert.deepEqual(getEquipmentBattleModifiers(summary), {
    damageReflectionPct: 4,
    incomingDamageReductionPct: 7,
    outgoingDamagePct: 2,
    reviveHpPct: 12,
    voodooHpReductionPct: 9,
  });
  assert.equal(summary.equipmentRating, 34);
});

test("resolves exact and mixed forge results using the source recipes", () => {
  assert.deepEqual(EQUIPMENT_FORGE_RECIPES, [
    { inputRarity: "common", inputCount: 4, goldCost: 5, outputRarity: "uncommon" },
    { inputRarity: "uncommon", inputCount: 5, goldCost: 50, outputRarity: "rare" },
    { inputRarity: "rare", inputCount: 6, goldCost: 500, outputRarity: "epic" },
    { inputRarity: "epic", inputCount: 7, goldCost: 5_000, outputRarity: "legendary" },
    { inputRarity: "legendary", inputCount: 8, goldCost: 50_000, outputRarity: "mythic" },
  ]);

  const exact = definitions("equipment_head_fire_common", "equipment_head_fire_common", "equipment_head_fire_common", "equipment_head_fire_common");
  assert.equal(resolveEquipmentForgeResult(exact, () => 0).id, "equipment_head_fire_uncommon");

  const mixed = definitions("equipment_head_fire_common", "equipment_head_fire_common", "equipment_head_fire_common", "equipment_head_water_common");
  assert.equal(resolveEquipmentForgeResult(mixed, () => 0).id, "equipment_head_fire_uncommon");
  assert.throws(() => resolveEquipmentForgeResult(exact.slice(0, 3), () => 0), /requires 4/);
});
