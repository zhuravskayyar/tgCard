import assert from "node:assert/strict";
import test from "node:test";
import { createInvasionBattle, INVASION_BOSSES, INVASION_LOG_SIZE, INVASION_CYCLE_MS } from "@cardastika/game-core";
import type { DuelCardSnapshot, InvasionLogEntry } from "@cardastika/shared";
import { COLLECTION_CARDS } from "../collections/collectionCatalog.js";
import { INVASION_CARDS_BY_COLLECTION } from "./invasionService.js";
import {
  appendLog,
  applyInvasionPowerPct,
  buildBossDeckSnapshots,
  toBattleView,
  toSafeNumber,
  type StoredInvasionBattle,
} from "./invasionHelpers.js";

const card = (id: string, finalPower: number): DuelCardSnapshot => ({
  artKey: null, basePower: finalPower, bonusPower: 0, cardId: id, code: id, displayName: id,
  element: "fire", finalPower, instanceId: id, level: 1, rarity: "common",
});

test("every boss card and all five Urfin collections exist in the catalog", () => {
  const ids = new Set(COLLECTION_CARDS.map((entry) => entry.id));
  for (const boss of INVASION_BOSSES) assert.ok(ids.has(boss.cardId), `${boss.cardId} is missing`);
  for (const [code, cardIds] of Object.entries(INVASION_CARDS_BY_COLLECTION)) {
    assert.ok(cardIds.length > 0, `${code} is empty`);
    for (const id of cardIds) assert.ok(ids.has(id));
  }
});

test("bigint strings become numbers and bad values are refused", () => {
  assert.equal(toSafeNumber("3640000000", "health"), 3_640_000_000);
  assert.equal(toSafeNumber(null, "health"), 0);
  assert.throws(() => toSafeNumber("-1", "health"));
  assert.throws(() => toSafeNumber("abc", "health"));
});

test("power bonus raises final power and leaves a zero bonus untouched", () => {
  const base = card("a", 1_000);
  assert.equal(applyInvasionPowerPct(base, 0), base);
  assert.equal(applyInvasionPowerPct(base, 5).finalPower, 1_050);
  assert.equal(applyInvasionPowerPct(base, 15).finalPower, 1_150);
});

test("boss deck snapshots take names and art from the cards table and get unique ids", () => {
  const boss = INVASION_BOSSES[0]!;
  const seeds = [
    { cardId: "flying_monkey", collection: "umutants" as const, element: "water" as const, finalPower: 2_700 },
    { cardId: "gloomy_rhino", collection: "umutants" as const, element: "fire" as const, finalPower: 2_800 },
  ];
  const rows = new Map([["flying_monkey", { id: "flying_monkey", code: "flying_monkey", display_name: "Мавпа", art_key: "monkey" }]]);
  const deck = buildBossDeckSnapshots(boss, seeds, rows, "inv1");
  assert.equal(deck[0]!.displayName, "Мавпа");
  assert.equal(deck[0]!.artKey, "monkey");
  assert.equal(deck[0]!.element, "water");
  assert.equal(deck[1]!.displayName, null);
  assert.equal(deck[1]!.code, "gloomy_rhino");
  assert.notEqual(deck[0]!.instanceId, deck[1]!.instanceId);
  assert.equal(deck[0]!.level, boss.prizeLevel);
});

test("the battle log keeps only the last strikes", () => {
  const entry = (turn: number): InvasionLogEntry => ({
    slotIndex: 0, turnNumber: turn, playerCard: card("p", 1), bossCard: card("b", 1),
    playerDamage: 1, playerMultiplier: 1, bossDamage: 1, bossMultiplier: 1, superStrike: false,
  });
  let log: InvasionLogEntry[] = [];
  for (let turn = 1; turn <= INVASION_LOG_SIZE + 3; turn += 1) log = appendLog(log, [entry(turn)]);
  assert.equal(log.length, INVASION_LOG_SIZE);
  assert.equal(log.at(-1)!.turnNumber, INVASION_LOG_SIZE + 3);
});

test("the battle view carries the cycle clock and the stored cards", () => {
  const cards = Array.from({ length: 4 }, (_, index) => card(`p${index}`, 100 + index));
  const bossCards = Array.from({ length: 3 }, (_, index) => card(`b${index}`, 200 + index));
  const startedAt = 1_000_000;
  const row: StoredInvasionBattle = {
    id: "battle", version: 3, boss_number: 2, finished: false, log: [],
    state: {
      core: createInvasionBattle({ startedAt, playerHp: 500, playerCards: cards, bossCards }),
      modifiers: { battleDamagePct: 0, elementDamagePct: {}, experienceRewardPct: 0, silverRewardPct: 0 },
      deckPower: 400,
    },
  };
  const view = toBattleView(row, startedAt + INVASION_CYCLE_MS * 2 + 5);
  assert.equal(view.cycleIndex, 2);
  assert.equal(view.cycleMs, INVASION_CYCLE_MS);
  assert.equal(view.playerSlots.length, 3);
  assert.equal(view.bossSlots.length, 3);
  assert.equal(view.playerMaxHp, 500);
  assert.equal(view.serverNow, new Date(startedAt + INVASION_CYCLE_MS * 2 + 5).toISOString());
});
