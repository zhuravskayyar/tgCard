import assert from "node:assert/strict";
import test from "node:test";
import { applyAbsorptionEfficiency, applyGuildXpCollectionBonus, getPlayerCollectionModifiers } from "./collectionModifiers.js";

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

test("collection bonuses stay inside their declared game context", () => {
  const modifiers = [
    { type: "battle_damage_pct" as const, value: 3, scope: "duel" as const },
    { type: "battle_damage_pct" as const, value: 6, scope: "guild_raid" as const },
    { type: "absorption_efficiency_pct" as const, value: 4, scope: "absorption" as const },
    { type: "duel_cooldown_minutes" as const, value: 30, scope: "duel" as const },
  ];
  assert.equal(getPlayerCollectionModifiers(modifiers, "duel").battleDamagePct, 3);
  assert.equal(getPlayerCollectionModifiers(modifiers, "guild_raid").battleDamagePct, 6);
  assert.equal(getPlayerCollectionModifiers(modifiers, "absorption").battleDamagePct, 0);
  assert.equal(getPlayerCollectionModifiers(modifiers, "absorption").absorptionEfficiencyPct, 4);
  assert.equal(getPlayerCollectionModifiers(modifiers, "duel").duelCooldownMinutes, 30);
  assert.equal(getPlayerCollectionModifiers(modifiers, "guild_raid").duelCooldownMinutes, 0);
});

test("«Весняний цвіт» and «Старі вояки» each add 10% guild XP and stack", () => {
  assert.equal(applyGuildXpCollectionBonus(10, []), 10);
  assert.equal(applyGuildXpCollectionBonus(10, ["collection_spring_bloom", "spring_bloom"]), 11);
  assert.equal(applyGuildXpCollectionBonus(10, ["collection_spring_bloom", "collection_old_soldiers"]), 12);
  assert.equal(applyGuildXpCollectionBonus(18, ["collection_old_soldiers", "collection_mythic"]), 20);
});
