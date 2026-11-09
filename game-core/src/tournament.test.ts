import assert from "node:assert/strict";
import test from "node:test";
import type { TournamentMatchResult, TournamentRegularLeague } from "@cardastika/shared";
import {
  TOURNAMENT_RULES, advanceTournamentCardCycle, changeTournamentCards, createTournamentBracket,
  getInitialTournamentRating, getNextTournamentSchedule, getReadyTournamentMatches,
  getTournamentBattleXp, getTournamentBuffOptions, getTournamentLeague, getTournamentPrize,
  getTournamentStartingHp, resolveTournamentTimeout, seedTournamentQualification,
  selectTournamentChampions, useTournamentCard, type TournamentCardCycle,
} from "./tournament.js";

const random = () => 0.41;
const players = (count: number) => Array.from({ length: count }, (_, index) => `player-${index}`);

test("provisional rating follows the stronger personal rating and caps at 3800", () => {
  assert.equal(getInitialTournamentRating(2000, 1400), 2000);
  assert.equal(getInitialTournamentRating(2300, 3100), 3100);
  assert.equal(getInitialTournamentRating(4400, 5000), 3800);
  assert.throws(() => getInitialTournamentRating(-1, 1400));
});

test("global league floors, no demotion and the Master-cup gate are independent", () => {
  const cases: [number, TournamentRegularLeague][] = [[1999, "conqueror"], [2000, "conqueror"], [2599, "conqueror"], [2600, "champion"], [3199, "champion"], [3200, "master"], [3800, "master"]];
  for (const [rating, expected] of cases) assert.equal(getTournamentLeague({ rating }), expected);
  assert.equal(getTournamentLeague({ rating: 3800, hasMasterCup: true }), "ruler");
  assert.equal(getTournamentLeague({ rating: 1000, highestLeague: "master" }), "master");
  assert.equal(getTournamentLeague({ rating: 1000, highestLeague: "ruler" }), "ruler");
});

test("all five schedules use GMT and the exact 30-minute registration window", () => {
  assert.equal(TOURNAMENT_RULES.utcOffsetMinutes, 0);
  const now = new Date("2026-11-03T00:00:00Z");
  for (const [league, utcHour] of [["conqueror", 12], ["champion", 11], ["master", 10], ["ruler", 9], ["crown", 9]] as const) {
    const schedule = getNextTournamentSchedule(league, now);
    assert.equal(schedule.startsAt, `2026-11-03T${String(utcHour).padStart(2, "0")}:00:00.000Z`);
    assert.equal(schedule.utcOffsetMinutes, 0);
    assert.equal(Date.parse(schedule.startsAt) - Date.parse(schedule.registrationOpensAt), 1800000);
  }
  assert.equal(getNextTournamentSchedule("conqueror", new Date("2026-11-03T11:29:59.999Z")).registrationOpen, false);
  assert.equal(getNextTournamentSchedule("conqueror", new Date("2026-11-03T11:30:00.000Z")).registrationOpen, true);
  assert.equal(getNextTournamentSchedule("conqueror", new Date("2026-11-03T12:00:00.000Z")).startsAt, "2026-11-03T22:00:00.000Z");
});

test("war days, truce, midnight and year rollover do not depend on host timezone", () => {
  assert.equal(getNextTournamentSchedule("conqueror", new Date("2026-11-03T22:00:00Z")).startsAt, "2026-11-05T12:00:00.000Z");
  assert.equal(getNextTournamentSchedule("conqueror", new Date("2026-11-03T22:00:00Z"), true).startsAt, "2026-11-04T12:00:00.000Z");
  assert.equal(getNextTournamentSchedule("conqueror", new Date("2026-11-05T22:00:00Z")).startsAt, "2026-11-07T12:00:00.000Z");
  assert.equal(getNextTournamentSchedule("ruler", new Date("2026-12-31T22:00:00Z"), true).startsAt, "2027-01-01T09:00:00.000Z");
  assert.throws(() => getNextTournamentSchedule("ruler", new Date("invalid")));
});

test("qualification preserves every real entrant and gives the highest ratings byes", () => {
  for (let count = 2; count <= 257; count++) {
    const entries = players(count).map((playerId, rating) => ({ playerId, rating }));
    const result = seedTournamentQualification(entries, random);
    assert.ok(Number.isInteger(Math.log2(result.bracketSize)));
    assert.equal(result.byes.length + result.pairs.length, result.bracketSize);
    const seeded = [...result.byes, ...result.pairs.flat()];
    assert.equal(new Set(seeded).size, count);
    assert.deepEqual([...seeded].sort(), entries.map(row => row.playerId).sort());
    if (result.pairs.length && result.byes.length) {
      const ratings = new Map(entries.map(row => [row.playerId, row.rating]));
      assert.ok(Math.min(...result.byes.map(id => ratings.get(id)!)) > Math.max(...result.pairs.flat().map(id => ratings.get(id)!)));
    }
  }
  assert.throws(() => seedTournamentQualification([{ playerId: "one", rating: 2000 }], random));
  assert.throws(() => seedTournamentQualification([{ playerId: "one", rating: 2000 }, { playerId: "one", rating: 2100 }], random));
});

function finishBracket(count: number, double: boolean, lowerWinsFinal: boolean) {
  const bracket = createTournamentBracket(players(count), double, random);
  const results: Record<string, TournamentMatchResult> = {};
  const losses = new Map<string, number>();
  for (let pass = 0; pass < bracket.length; pass++) {
    const ready = getReadyTournamentMatches(bracket, results);
    if (!ready.length) break;
    for (const { match, playerIds: [a, b] } of ready) {
      assert.notEqual(a, b);
      if (double) {
        assert.ok((losses.get(a) ?? 0) < 2);
        assert.ok((losses.get(b) ?? 0) < 2);
      }
      const win = match.lane === "final" && lowerWinsFinal ? b : a;
      const loss = win === a ? b : a;
      results[match.id] = { winnerId: win, loserId: loss };
      losses.set(loss, (losses.get(loss) ?? 0) + 1);
    }
  }
  assert.deepEqual(getReadyTournamentMatches(bracket, results), []);
  return { bracket, results, losses };
}

test("single elimination preserves the bracket and sends both semifinal losers to bronze", () => {
  for (const count of [2, 4, 8, 16, 32, 128]) {
    const { bracket, results } = finishBracket(count, false, false);
    assert.equal(Object.keys(results).length, count - 1 + Number(count >= 4));
    if (count >= 4) {
      const semifinals = bracket.filter(row => row.lane === "upper" && row.round === Math.log2(count) - 1);
      assert.deepEqual(new Set([results.bronze!.winnerId, results.bronze!.loserId]), new Set(semifinals.map(row => results[row.id]!.loserId)));
    }
  }
});

test("double elimination keeps everyone until their second defeat and resets only when needed", () => {
  for (const count of [2, 4, 8, 16, 32, 128]) {
    for (const lowerWinsFinal of [false, true]) {
      const { results, losses } = finishBracket(count, true, lowerWinsFinal);
      assert.equal(Object.keys(results).length, count * 2 - 2 + Number(lowerWinsFinal));
      assert.equal(Boolean(results.reset), lowerWinsFinal);
      const champion = (results.reset ?? results.final)!.winnerId;
      assert.ok((losses.get(champion) ?? 0) <= 1);
      for (const id of players(count).filter(id => id !== champion)) assert.equal(losses.get(id), 2);
    }
  }
});

test("forged results, duplicate players and malformed brackets cannot advance", () => {
  assert.throws(() => createTournamentBracket(["a", "a"], false, random));
  assert.throws(() => createTournamentBracket(["a", "b", "c"], false, random));
  const bracket = createTournamentBracket(players(4), false, random);
  assert.throws(() => getReadyTournamentMatches(bracket, { "upper-2-0": { winnerId: "player-0", loserId: "player-1" } }));
  assert.throws(() => getReadyTournamentMatches(bracket, { "upper-1-0": { winnerId: "intruder", loserId: "player-0" } }));
  const completed = finishBracket(4, true, false);
  assert.throws(() => getReadyTournamentMatches(completed.bracket, { ...completed.results, reset: completed.results.final! }));
});

test("buff choice uses our strongest element and their counter, with a counter-counter fallback", () => {
  const own = [{ element: "fire" as const, finalPower: 1000 }, { element: "earth" as const, finalPower: 200 }];
  assert.deepEqual(getTournamentBuffOptions(own, [{ element: "water", finalPower: 500 }]), [
    { element: "fire", addedPower: 150 }, { element: "earth", addedPower: 30 },
  ]);
  assert.deepEqual(getTournamentBuffOptions(own, [{ element: "air", finalPower: 500 }]), [
    { element: "fire", addedPower: 150 }, { element: "earth", addedPower: 30 },
  ]);
  assert.equal(getTournamentBuffOptions(own, [{ element: "air", finalPower: 500 }], 20)[0].addedPower, 200);
});

test("starting HP doubles the deck plus additional cards and includes the purchased element buff", () => {
  const deck = [{ element: "fire" as const, finalPower: 1000 }, { element: "water" as const, finalPower: 500 }];
  assert.equal(getTournamentStartingHp(deck), 3000);
  assert.equal(getTournamentStartingHp(deck, { additionalCards: [{ element: "fire", finalPower: 100 }] }), 3200);
  assert.equal(getTournamentStartingHp(deck, { additionalCards: [{ element: "fire", finalPower: 100 }], buffElement: "fire" }), 3530);
  assert.equal(getTournamentStartingHp(deck, { buffElement: "fire", hpPercent: 5 }), 3465);
});

const startedAt = Date.parse("2026-11-03T09:00:00Z");
const at = (elapsed: number) => new Date(startedAt + elapsed);
const cycle = (): TournamentCardCycle<number> => ({ startedAt, cycle: 0, active: [1, 2, 3], reserve: [4, 5, 6, 7, 8, 9], used: [false, false, false], changes: 0 });

test("a slot strikes once per cycle; only used cards rotate at exactly nine seconds", () => {
  const strike = useTournamentCard(cycle(), 1, at(8999));
  assert.equal(strike.card, 2);
  assert.throws(() => useTournamentCard(strike.state, 1, at(8999)));
  const next = advanceTournamentCardCycle(strike.state, at(9000));
  assert.deepEqual(next.active, [1, 4, 3]);
  assert.deepEqual(next.reserve, [5, 6, 7, 8, 9, 2]);
  assert.deepEqual(next.used, [false, false, false]);
  assert.equal(useTournamentCard(next, 1, at(9000)).card, 4);
  assert.deepEqual(advanceTournamentCardCycle(strike.state, at(90000)).active, [1, 4, 3]);
});

test("round deadlines are authoritative and a free change cannot grant extra strikes", () => {
  const struck = useTournamentCard(cycle(), 0, at(1)).state;
  const changed = changeTournamentCards(struck, at(2));
  assert.deepEqual(changed.active, [4, 5, 6]);
  assert.throws(() => useTournamentCard(changed, 0, at(3)));
  assert.throws(() => changeTournamentCards(changed, at(3)));
  assert.doesNotThrow(() => useTournamentCard(cycle(), 2, at(219999)));
  assert.throws(() => useTournamentCard(cycle(), 2, at(220000)));
  assert.throws(() => useTournamentCard(cycle(), 2, at(-1)));
});

test("timeouts prefer damage, then more remaining HP, then a stable match tiebreak", () => {
  assert.equal(resolveTournamentTimeout({ damage: 10, remainingHp: 40 }, { damage: 9, remainingHp: 90 }, "match-1"), 0);
  assert.equal(resolveTournamentTimeout({ damage: 0, remainingHp: 50 }, { damage: 0, remainingHp: 100 }, "match-2"), 1);
  assert.equal(resolveTournamentTimeout({ damage: 10, remainingHp: 40 }, { damage: 10, remainingHp: 90 }, "match-3"), 1);
  const exactTie = resolveTournamentTimeout({ damage: 10, remainingHp: 40 }, { damage: 10, remainingHp: 40 }, "match-4:alpha:beta");
  assert.equal(exactTie, resolveTournamentTimeout({ damage: 10, remainingHp: 40 }, { damage: 10, remainingHp: 40 }, "match-4:alpha:beta"));
  assert.ok(exactTie === 0 || exactTie === 1);
  assert.equal(getTournamentBattleXp({ damageDealt: 1500, opponentStartingHp: 1000, experiencePercent: 10, outcome: "loss" }), 1100);
  assert.equal(getTournamentBattleXp({ damageDealt: 100, opponentStartingHp: 1000, outcome: "loss" }), 100);
  assert.equal(getTournamentBattleXp({ damageDealt: 100, opponentStartingHp: 1000, outcome: "win" }), 1000);
});

test("conqueror prizes preserve the exact reference card pools and levels", () => {
  for (const placement of [1, 2, 3, 4] as const) {
    const prize = getTournamentPrize("conqueror", { placement });
    assert.equal(prize.diamonds, 0);
    assert.equal(prize.reward!.kind, "card");
    assert.equal(prize.reward!.level, placement <= 2 ? 35 : 30);
    assert.equal(prize.reward!.cardCodes.length, 4);
  }
  assert.equal(getTournamentPrize("conqueror", { eliminatedWith: 8 }).reward!.level, 25);
  assert.equal(getTournamentPrize("conqueror", { eliminatedWith: 16 }).reward!.level, 25);
  assert.equal(getTournamentPrize("conqueror", { eliminatedWith: 32 }).reward!.level, 20);
  assert.deepEqual(getTournamentPrize("conqueror", { qualifier: true }), { badge: null, diamonds: 0, reward: null });
});

test("higher leagues award sources and diamonds according to placement and elimination round", () => {
  const cases = [
    ["champion", 1, 60, 2], ["champion", 3, 55, 1],
    ["master", 1, 75, 3], ["ruler", 4, 90, 5], ["crown", 1, 105, 5], ["crown", 4, 105, 3],
  ] as const;
  for (const [league, placement, level, diamonds] of cases) {
    const prize = getTournamentPrize(league, { placement });
    assert.equal(prize.reward!.level, level);
    assert.equal(prize.diamonds, diamonds);
    assert.equal(prize.reward!.kind, "source");
  }
  for (const [league, field, level, diamonds] of [
    ["champion", 8, 50, 1], ["champion", 16, 45, 1], ["champion", 32, 40, 1], ["champion", 64, 35, 1],
    ["master", 8, 70, 2], ["master", 32, 65, 2], ["master", 64, 65, 2], ["master", 128, 60, 2],
    ["ruler", 8, 85, 3], ["ruler", 16, 85, 3], ["ruler", 32, 80, 3], ["ruler", 64, 75, 3],
    ["crown", 32, 100, 3], ["crown", 64, 95, 3],
  ] as const) {
    const prize = getTournamentPrize(league, { eliminatedWith: field });
    assert.equal(prize.reward!.level, level);
    assert.equal(prize.diamonds, diamonds);
  }
  assert.equal(getTournamentPrize("master", { qualifier: true }).diamonds, 1);
  assert.equal(getTournamentPrize("ruler", { qualifier: true }).diamonds, 2);
  assert.equal(getTournamentPrize("crown", { qualifier: true }).diamonds, 2);
  assert.throws(() => getTournamentPrize("master", {}));
  assert.throws(() => getTournamentPrize("master", { placement: 1, qualifier: true }));
});

test("weekly top 128 is selected at Monday midnight GMT and requires a cup and recent activity", () => {
  const selectionAt = new Date("2026-11-09T00:00:00Z");
  const candidates = players(132).map((playerId, index) => ({ playerId, deckPower: index, guildPower: 0, allyPower: 0, hasRulerCup: true, lastRulerTournamentAt: "2026-11-01T09:00:00Z" }));
  candidates[0]!.allyPower = 10000;
  candidates[1]!.guildPower = 10000;
  candidates[131]!.hasRulerCup = false;
  candidates[130]!.lastRulerTournamentAt = "2026-10-25T23:59:59Z";
  const selected = selectTournamentChampions(candidates, selectionAt);
  assert.equal(selected.length, TOURNAMENT_RULES.championCount);
  assert.equal(selected[0], "player-1");
  assert.equal(selected[1], "player-0");
  assert.ok(!selected.includes("player-131") && !selected.includes("player-130"));
  assert.throws(() => selectTournamentChampions(candidates, new Date("2026-11-08T21:00:00Z")));
  assert.throws(() => selectTournamentChampions(candidates, new Date("2026-11-09T00:00:01Z")));
});
