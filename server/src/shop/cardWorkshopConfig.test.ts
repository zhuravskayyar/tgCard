import assert from "node:assert/strict";
import test from "node:test";
import { CARD_CRAFT_COSTS, selectWorkshopCardIds } from "./cardWorkshopConfig.js";

test("card workshop exposes six deterministic cards in the configured rarity mix", () => {
  const cards = [
    ...Array.from({ length: 4 }, (_, index) => ({ id: `common_${index}`, rarity: "common" as const })),
    ...Array.from({ length: 4 }, (_, index) => ({ id: `uncommon_${index}`, rarity: "uncommon" as const })),
    ...Array.from({ length: 3 }, (_, index) => ({ id: `rare_${index}`, rarity: "rare" as const })),
    { id: "epic_0", rarity: "epic" as const },
    { id: "legendary_0", rarity: "legendary" as const },
    { id: "mythic_0", rarity: "mythic" as const },
  ];
  const selected = selectWorkshopCardIds(cards, "2026-08-24");
  assert.equal(selected.length, 6);
  assert.equal(selected.filter((id) => id.startsWith("common_")).length, 1);
  assert.equal(selected.filter((id) => id.startsWith("uncommon_")).length, 1);
  assert.equal(selected.filter((id) => id.startsWith("rare_")).length, 1);
  assert.equal(selected.filter((id) => id.startsWith("epic_")).length, 1);
  assert.equal(selected.filter((id) => id.startsWith("legendary_")).length, 1);
  assert.equal(selected.filter((id) => id.startsWith("mythic_")).length, 1);
  assert.deepEqual(selectWorkshopCardIds(cards, "2026-08-24"), selected);
});

test("card workshop craft costs are server-owned", () => {
  assert.deepEqual(CARD_CRAFT_COSTS, {
    common: 100,
    uncommon: 250,
    rare: 600,
    epic: 1_400,
    legendary: 3_000,
    mythic: 6_000,
  });
});
