import assert from "node:assert/strict";
import test from "node:test";
import type { DuelCardSnapshot } from "@cardastika/shared";
import { getBasePowerForLevel } from "./cardProgression.js";
import {
  INVASION_BOSSES,
  INVASION_CYCLE_MS,
  INVASION_PRIZE_BONUS_POWER,
  canInvasionSlotStrike,
  createInvasionBattle,
  getInvasionAttackDiamonds,
  getInvasionAttackSilver,
  getInvasionPauseAfterBoss,
  getInvasionPowerPct,
  getInvasionStanding,
  getNextInvasionStart,
  quoteInvasionAttack,
  resolveInvasionPrizes,
  resolveInvasionStrike,
  runInvasionAutobattle,
  swapInvasionCards,
} from "./invasion.js";

const card = (id: string, finalPower: number, element: DuelCardSnapshot["element"] = "fire"): DuelCardSnapshot => ({
  artKey: null, basePower: finalPower, bonusPower: 0, cardId: id, code: id, displayName: id,
  element, finalPower, instanceId: id, level: 1, rarity: "common",
});
const noMods = { battleDamagePct: 0, elementDamagePct: {} };
const never = () => 0.5;

test("24 bosses match the reference table", () => {
  assert.equal(INVASION_BOSSES.length, 24);
  assert.equal(INVASION_BOSSES[0]!.health, 1_340_000_000);
  assert.equal(INVASION_BOSSES[23]!.health, 3_640_000_000);
  assert.equal(INVASION_BOSSES[22]!.cardId, "captain_daughter");
  assert.deepEqual(INVASION_BOSSES[14]!.collections, ["umutants", "usoldiers", "ugiants", "ufavorites"]);
});

test("first-place prize power is level base + 1398", () => {
  const expected: Record<number, number> = { 1: 4828, 3: 5378, 11: 7658, 24: 10718 };
  for (const [number, power] of Object.entries(expected)) {
    assert.equal(getBasePowerForLevel(INVASION_BOSSES[Number(number) - 1]!.prizeLevel) + INVASION_PRIZE_BONUS_POWER, power);
  }
});

test("pauses and even-hour start", () => {
  assert.equal(getInvasionPauseAfterBoss(4), 900_000);
  assert.equal(getInvasionPauseAfterBoss(5), 0);
  assert.equal(getInvasionPauseAfterBoss(16), 900_000);
  assert.equal(getInvasionPauseAfterBoss(24), 0);
  const start = getNextInvasionStart(Date.UTC(2026, 0, 1, 11, 30));
  assert.equal(start, Date.UTC(2026, 0, 1, 12, 0));
});

test("attack price is prorated by the remaining break (manual example)", () => {
  const now = 10_000_000_000;
  const quote = quoteInvasionAttack({ attacksMade: 12, lastAttackAt: now - 192 * 60_000, now });
  assert.equal(quote.gold, 10);
  assert.equal(quote.autoGold, 20);
  assert.deepEqual(quoteInvasionAttack({ attacksMade: 0, lastAttackAt: null, now }), { attackNumber: 1, readyAt: null, gold: 0, autoGold: 10 });
  assert.equal(quoteInvasionAttack({ attacksMade: 1, lastAttackAt: now - 3_600_000, now }).gold, 0);
});

test("silver formula matches the manual example", () => {
  assert.equal(getInvasionAttackSilver(900_000, 150_000, 4), 29_250);
});

test("power bonus from Mechanists and the champion title", () => {
  assert.equal(getInvasionPowerPct({ hasMechanists: true, firstPlaces: 19 }), 5);
  assert.equal(getInvasionPowerPct({ hasMechanists: true, firstPlaces: 20 }), 15);
});

test("a slot strikes once per 9 s cycle and refills from the queue", () => {
  const players = ["a", "b", "c", "d"].map((id) => card(id, 1000));
  const bosses = ["x", "y", "z"].map((id) => card(id, 500));
  let state = createInvasionBattle({ startedAt: 0, playerHp: 10_000, playerCards: players, bossCards: bosses });
  const first = resolveInvasionStrike({ state, slotIndex: 0, now: 1000, modifiers: noMods, bossHealthLeft: 1e9, random: never });
  state = first.state;
  assert.equal(first.strike.playerDamage, 1000);
  assert.equal(state.playerHp, 9_500);
  assert.equal(state.playerSlots[0]!.card.cardId, "d");
  assert.equal(canInvasionSlotStrike(state, 0, 5000), false);
  assert.equal(canInvasionSlotStrike(state, 1, 5000), true);
  assert.equal(canInvasionSlotStrike(state, 0, INVASION_CYCLE_MS), true);
});

test("super strike deals ×10 regardless of element and halves the counter", () => {
  const state = createInvasionBattle({
    startedAt: 0, playerHp: 10_000,
    playerCards: [card("a", 1000, "fire"), card("b", 1000), card("c", 1000)],
    bossCards: [card("x", 800, "water"), card("y", 500), card("z", 500)],
  });
  const result = resolveInvasionStrike({ state, slotIndex: 0, now: 0, modifiers: noMods, bossHealthLeft: 1e9, random: () => 0 });
  assert.equal(result.strike.superStrike, true);
  assert.equal(result.strike.playerDamage, 10_000);
  assert.ok(result.strike.bossDamage < 800 * 1.5);
});

test("damage is capped at the boss's remaining health", () => {
  const state = createInvasionBattle({ startedAt: 0, playerHp: 10_000, playerCards: ["a", "b", "c"].map((id) => card(id, 1000)), bossCards: ["x", "y", "z"].map((id) => card(id, 1)) });
  const result = resolveInvasionStrike({ state, slotIndex: 1, now: 0, modifiers: noMods, bossHealthLeft: 300, random: never });
  assert.equal(result.countedDamage, 300);
});

test("swap brings the next three cards in", () => {
  const state = createInvasionBattle({ startedAt: 0, playerHp: 1, playerCards: ["a", "b", "c", "d", "e", "f"].map((id) => card(id, 10)), bossCards: ["x", "y", "z"].map((id) => card(id, 1)) });
  const swapped = swapInvasionCards(state, 0);
  assert.deepEqual(swapped.playerSlots.map((slot) => slot.card.cardId), ["d", "e", "f"]);
  assert.deepEqual(swapped.playerQueue.map((entry) => entry.cardId), ["a", "b", "c"]);
});

test("swap does not make a used slot strike again in the same cycle", () => {
  let state = createInvasionBattle({ startedAt: 0, playerHp: 10_000, playerCards: ["a", "b", "c", "d", "e", "f"].map((id) => card(id, 10)), bossCards: ["x", "y", "z"].map((id) => card(id, 1)) });
  state = resolveInvasionStrike({ state, slotIndex: 0, now: 0, modifiers: noMods, bossHealthLeft: 1e9, random: never }).state;
  const swapped = swapInvasionCards(state, 100);
  assert.equal(canInvasionSlotStrike(swapped, 0, 100), false);
  assert.equal(canInvasionSlotStrike(swapped, 1, 100), true);
});

test("autobattle fights until the player falls", () => {
  const state = createInvasionBattle({ startedAt: 0, playerHp: 2_000, playerCards: ["a", "b", "c", "d"].map((id) => card(id, 1000)), bossCards: ["x", "y", "z"].map((id) => card(id, 500)) });
  const result = runInvasionAutobattle({ state, modifiers: noMods, bossHealthLeft: 1e9, random: never });
  assert.equal(result.state.playerHp, 0);
  assert.equal(result.strikes.length, 4);
  assert.equal(result.state.damageDealt, 4000);
});

test("prizes: first place, N random damage winners, super strikers", () => {
  const rows = Array.from({ length: 10 }, (_, index) => ({ playerId: `p${index}`, damage: 1000 - index, superStrikes: index === 5 ? 2 : 0 }));
  const prizes = resolveInvasionPrizes(3, rows, () => 0.3);
  assert.equal(prizes[0]!.playerId, "p0");
  assert.equal(prizes[0]!.kind, "first_place");
  assert.equal(prizes.filter((prize) => prize.kind === "damage").length, 3);
  assert.ok(prizes.filter((prize) => prize.kind === "damage").every((prize) => prize.playerId !== "p0"));
  assert.deepEqual(prizes.filter((prize) => prize.kind === "super_strike").map((prize) => prize.playerId), ["p5"]);
});

test("standing shows place, gap ahead by one strike and the next player behind", () => {
  const standing = getInvasionStanding([5000, 4000, 3100, 3000, 2830], 3000, 500);
  assert.deepEqual(standing, { place: 4, damage: 3000, ahead: { place: 2, gap: 1000 }, behind: { place: 5, gap: 170 } });
  assert.equal(getInvasionStanding([1], 0, 1), null);
});

test("hunting permit halves every paid price; free stays free", () => {
  const now = 10_000_000_000;
  const paid = quoteInvasionAttack({ attacksMade: 12, lastAttackAt: now - 192 * 60_000, now, huntingPermit: true });
  assert.equal(paid.gold, 5);
  assert.equal(paid.autoGold, 10);
  const first = quoteInvasionAttack({ attacksMade: 0, lastAttackAt: null, now, huntingPermit: true });
  assert.equal(first.gold, 0);
  assert.equal(first.autoGold, 5);
});

test("diamonds: 2 per attack up to 8 a day (16 with treasure hunters), bonus above the norm", () => {
  const noBonus = () => 0.99;
  assert.equal(getInvasionAttackDiamonds({ normDiamondsToday: 0, hasTreasureHunters: false, random: noBonus }).total, 2);
  assert.equal(getInvasionAttackDiamonds({ normDiamondsToday: 8, hasTreasureHunters: false, random: noBonus }).total, 0);
  assert.equal(getInvasionAttackDiamonds({ normDiamondsToday: 8, hasTreasureHunters: true, random: noBonus }).norm, 2);
  assert.equal(getInvasionAttackDiamonds({ normDiamondsToday: 15, hasTreasureHunters: true, random: noBonus }).norm, 1);
  const bonus = getInvasionAttackDiamonds({ normDiamondsToday: 8, hasTreasureHunters: false, random: () => 0 });
  assert.deepEqual(bonus, { norm: 0, bonus: 1, total: 1 });
});

test("fortune title gives three super-strike cards", () => {
  const rows = [{ playerId: "a", damage: 10, superStrikes: 1 }, { playerId: "b", damage: 5, superStrikes: 1 }];
  const prizes = resolveInvasionPrizes(1, rows, () => 0.5, new Set(["b"]));
  assert.equal(prizes.filter((prize) => prize.kind === "super_strike" && prize.playerId === "b").length, 3);
  assert.equal(prizes.filter((prize) => prize.kind === "super_strike" && prize.playerId === "a").length, 1);
});
