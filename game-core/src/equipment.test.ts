import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateEquipmentSummary,
  EQUIPMENT_BONUS_BY_RARITY,
  EQUIPMENT_FORGE_RECIPES,
  getEquipmentBattleModifiers,
  getEquipmentCollectionElementPct,
  getEquipmentQuickForgeOptions,
  resolveEquipmentAtelierResult,
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

test("«Вибір» collections make their element's things 25% stronger before the sets apply", () => {
  const pct = getEquipmentCollectionElementPct(["collection_choiceof_fire", "choiceof_fire", "collection_mythic"]);
  assert.deepEqual(pct, { fire: 25, water: 0, air: 0, earth: 0 });
  const things = definitions(
    "equipment_head_fire_common",
    "equipment_cloak_fire_common",
    "equipment_gloves_fire_common",
    "equipment_boots_fire_common",
  );
  const summary = calculateEquipmentSummary(things, pct);
  assert.equal(summary.itemBonusTotal, 125);
  assert.equal(summary.adjustedItemBonusTotal, 156);
  assert.equal(summary.elementBonuses.fire, 156);
  assert.equal(calculateEquipmentSummary(things, getEquipmentCollectionElementPct(["choiceof_water"])).elementBonuses.fire, 125);
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

  const mixedSlots = definitions("equipment_head_fire_common", "equipment_head_fire_common", "equipment_boots_fire_common", "equipment_boots_fire_common");
  assert.throws(() => resolveEquipmentForgeResult(mixedSlots, () => 0), /share one slot/);
  const mixedArtifacts = definitions("equipment_weapon_common", "equipment_weapon_common", "equipment_shield_common", "equipment_shield_common");
  assert.equal(resolveEquipmentForgeResult(mixedArtifacts, () => 0).id, "equipment_weapon_uncommon");
});

test("quick forge offers only whole batches of identical items", () => {
  const options = getEquipmentQuickForgeOptions(new Map([
    ["equipment_head_earth_common", 9],
    ["equipment_head_fire_common", 2],
    ["equipment_shield_uncommon", 5],
    ["equipment_boots_air_mythic", 20],
  ]));
  assert.deepEqual(options.map(({ itemId, available, resultItemId, goldCost }) => ({ itemId, available, resultItemId, goldCost })), [
    { itemId: "equipment_head_earth_common", available: 2, resultItemId: "equipment_head_earth_uncommon", goldCost: 5 },
    { itemId: "equipment_shield_uncommon", available: 1, resultItemId: "equipment_shield_rare", goldCost: 50 },
  ].sort((a, b) => options.findIndex((o) => o.itemId === a.itemId) - options.findIndex((o) => o.itemId === b.itemId)));
});

test("atelier changes the element of legendary and mythic things only", () => {
  const [legendary, epic, artifact] = definitions("equipment_cloak_fire_legendary", "equipment_cloak_fire_epic", "equipment_weapon_mythic");
  assert.equal(resolveEquipmentAtelierResult(legendary!, "water").id, "equipment_cloak_water_legendary");
  assert.throws(() => resolveEquipmentAtelierResult(legendary!, "fire"), /already/);
  assert.throws(() => resolveEquipmentAtelierResult(epic!, "water"), /legendary and mythic/);
  assert.throws(() => resolveEquipmentAtelierResult(artifact!, "water"), /Only things/);
});
