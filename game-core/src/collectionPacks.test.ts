import assert from "node:assert/strict";
import test from "node:test";
import { COLLECTION_PACK_IDS, getCollectionPackRotation, getCollectionPackSchedule, priceFullCollection, priceMissingCollectionCards } from "./collectionPacks.js";

const WEEK_MS = 7 * 86_400_000;

test("a week boundary is Monday 00:00 UTC", () => {
  const sunday = getCollectionPackRotation(new Date("2026-11-15T23:59:59.999Z"));
  const monday = getCollectionPackRotation(new Date("2026-11-16T00:00:00.000Z"));
  assert.equal(sunday.weekKey, "2026-11-09");
  assert.equal(monday.weekKey, "2026-11-16");
  assert.equal(sunday.endsAt.toISOString(), "2026-11-16T00:00:00.000Z");
  assert.equal(monday.startsAt.toISOString(), "2026-11-16T00:00:00.000Z");
  assert.notDeepEqual(sunday.packIds, monday.packIds);
  assert.deepEqual(getCollectionPackRotation(new Date("2026-11-10T08:00:00Z")).packIds, sunday.packIds);
});

test("each week has two different packs and every pack returns in a 5 week cycle", () => {
  const start = Date.UTC(2026, 0, 5);
  const seen = new Set<string>();
  for (let week = 0; week < 5; week += 1) {
    const { packIds } = getCollectionPackRotation(new Date(start + week * WEEK_MS + 3_600_000));
    assert.notEqual(packIds[0], packIds[1]);
    packIds.forEach((id) => seen.add(id));
  }
  assert.deepEqual([...seen].sort(), [...COLLECTION_PACK_IDS].sort());
  for (let week = 0; week < 60; week += 1) {
    assert.deepEqual(
      getCollectionPackRotation(new Date(start + week * WEEK_MS)).packIds,
      getCollectionPackRotation(new Date(start + (week + 5) * WEEK_MS)).packIds,
    );
  }
});

test("the rotation is deterministic and works before the anchor week", () => {
  const date = new Date("2031-03-05T12:00:00Z");
  assert.deepEqual(getCollectionPackRotation(date), getCollectionPackRotation(new Date(date)));
  const early = getCollectionPackRotation(new Date("1969-12-20T00:00:00Z"));
  assert.notEqual(early.packIds[0], early.packIds[1]);
  assert.equal(new Date(early.weekKey).getUTCDay(), 1);
});

test("the schedule lists next week's packs and when each active pack returns", () => {
  const now = new Date("2026-11-18T10:00:00Z");
  const schedule = getCollectionPackSchedule(now);
  assert.deepEqual(schedule.nextWeekPackIds, getCollectionPackRotation(new Date(now.getTime() + WEEK_MS)).packIds);
  assert.deepEqual(Object.keys(schedule.returnsInWeeks).sort(), [...getCollectionPackRotation(now).packIds].sort());
  assert.ok(Object.values(schedule.returnsInWeeks).every((weeks) => weeks === 5));
  assert.equal(schedule.nextWeekPackIds.some((id) => id in schedule.returnsInWeeks), false);
});

test("the schedule follows an injected rotation", () => {
  const rotation = (date: Date) => ({ packIds: [Math.floor(date.getTime() / WEEK_MS) % 3 === 0 ? "a" : "b"] });
  const schedule = getCollectionPackSchedule(new Date(0), rotation);
  assert.deepEqual(schedule.nextWeekPackIds, ["b"]);
  assert.deepEqual(schedule.returnsInWeeks, { a: 3 });
});

test("missing cards are priced by the ladder, rounded and capped at the full price", () => {
  const epic = ["epic", "epic", "epic", "epic"];
  assert.equal(priceMissingCollectionCards(epic, 4, 150), 150);
  assert.equal(priceMissingCollectionCards(epic.slice(0, 3), 4, 150), 110);
  assert.equal(priceMissingCollectionCards(epic.slice(0, 2), 4, 150), 75);
  assert.equal(priceMissingCollectionCards(epic.slice(0, 1), 4, 150), 40);
  // Mixed rarities add per card: 2 epic + 1 legendary missing = 195 → 200, below the set price of 230.
  assert.equal(priceMissingCollectionCards(["epic", "epic", "legendary"], 4, 230), 200);
  assert.equal(priceMissingCollectionCards(["legendary"], 4, 230), 120);
  // A configured full price below the ladder still wins: never above the set.
  assert.equal(priceMissingCollectionCards(["uncommon", "uncommon", "rare"], 4, 40), 40);
  assert.equal(priceMissingCollectionCards(["uncommon", "uncommon", "rare", "rare"], 4, 60), 60);
  assert.throws(() => priceMissingCollectionCards(["mythic"], 4, 150), /No collection price/);
});

test("the full collection ladder", () => {
  assert.equal(priceFullCollection(["epic", "epic", "epic", "epic"]), 150);
  assert.equal(priceFullCollection(["rare", "rare", "rare", "rare"]), 100);
  assert.equal(priceFullCollection(Array(6).fill("epic")), 230);
  assert.equal(priceFullCollection(["epic", "epic", "epic"]), 110);
  assert.equal(priceFullCollection(Array(8).fill("uncommon")), 120);
  assert.equal(priceFullCollection([...Array(3).fill("epic"), "legendary"]), 230);
});
