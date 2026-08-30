import assert from "node:assert/strict";
import test from "node:test";
import { EQUIPMENT_MANUAL_SOURCE_URL, type EquipmentManual } from "@cardastika/game-core";
import { EquipmentManualService, EquipmentManualUnavailableError } from "./equipmentManualService.js";

function manual(): EquipmentManual {
  return {
    sourceUrl: EQUIPMENT_MANUAL_SOURCE_URL,
    title: "Мануал: снаряжение",
    equipmentTypeCount: 9,
    thingTypeCount: 4,
    artifactTypeCount: 5,
    storageLimit: { things: 888, artifacts: 888 },
    rarityPowerBonus: { common: 25, uncommon: 50, rare: 100, epic: 200, legendary: 400, mythic: 1000 },
    setRules: [],
    artifactRules: [],
    forgeRecipes: [],
    acquisitionSources: [],
    artifactBattleModes: [],
    notes: [],
  };
}

test("loads and caches the parsed equipment manual", async () => {
  let fetchCount = 0;
  let now = 100;
  const expected = manual();
  const service = new EquipmentManualService(
    async (url, init) => {
      fetchCount += 1;
      assert.equal(url, EQUIPMENT_MANUAL_SOURCE_URL);
      assert.equal(init?.headers && (init.headers as Record<string, string>)["User-Agent"], "Cardastika-equipment-manual-parser/1.0");
      return new Response("source", { status: 200 });
    },
    (html, sourceUrl) => {
      assert.equal(html, "source");
      assert.equal(sourceUrl, EQUIPMENT_MANUAL_SOURCE_URL);
      return expected;
    },
    () => now,
    1000,
  );

  assert.equal(await service.get(), expected);
  assert.equal(await service.get(), expected);
  assert.equal(fetchCount, 1);
  now = 1101;
  assert.equal(await service.get(), expected);
  assert.equal(fetchCount, 2);
});

test("turns source and parser failures into an unavailable error", async () => {
  const unavailable = new EquipmentManualService(async () => new Response("", { status: 502 }));
  await assert.rejects(unavailable.get(), (error) => error instanceof EquipmentManualUnavailableError);

  const invalid = new EquipmentManualService(
    async () => new Response("invalid", { status: 200 }),
    () => { throw new Error("invalid manual"); },
  );
  await assert.rejects(invalid.get(), (error) => error instanceof EquipmentManualUnavailableError);
});
