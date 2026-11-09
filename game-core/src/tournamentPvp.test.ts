import assert from "node:assert/strict";
import test from "node:test";
import type { CardElement, DuelBattleModifiers, DuelCardSnapshot } from "@cardastika/shared";
import { TOURNAMENT_RULES } from "./tournament.js";
import {
  TOURNAMENT_PVP_RULES, calculateTournamentRatingChange, changeTournamentDuelCards, chooseTournamentBuff,
  createTournamentDuel, getTournamentFinish, getTournamentPendingMatches, getTournamentPodium,
  getTournamentStageAt, getTournamentStageWindow, isTournamentEligible, isTournamentEventComplete,
  planTournamentEvent, recordTournamentResult, settleTournamentDuelTimeout, strikeTournamentDuel,
  syncTournamentDuelSide, toTournamentRatingScale, getTournamentCollectionBonuses, getTournamentCardPower, type TournamentEventPlan,
} from "./tournamentPvp.js";

const random = () => 0.37;
const modifiers = (): DuelBattleModifiers => ({
  battleDamagePct: 0, battleHpPct: 0, deckPowerPct: 0, experienceRewardPct: 0, silverRewardPct: 0,
  elementDamagePct: { fire: 0, water: 0, air: 0, earth: 0 },
});
const ELEMENTS: CardElement[] = ["fire", "fire", "fire", "water", "water", "air", "air", "earth", "earth"];
const deck = (prefix: string, power = 100): DuelCardSnapshot[] => ELEMENTS.map((element, index) => ({
  artKey: null, basePower: power, bonusPower: 0, cardId: `${prefix}-card-${index}`, code: `${prefix}-${index}`,
  displayName: null, element, finalPower: power, instanceId: `${prefix}-${index}`, level: 1, rarity: "common",
}));

function playOut(plan: TournamentEventPlan, winnerOf: (ids: [string, string]) => string) {
  for (let guard = 0; guard < 600 && !isTournamentEventComplete(plan); guard++) {
    const [next] = getTournamentPendingMatches(plan);
    assert.ok(next);
    const winnerId = winnerOf(next.playerIds);
    plan = recordTournamentResult(plan, next.id, { winnerId, loserId: next.playerIds.find(id => id !== winnerId)! }, random);
  }
  return plan;
}

test("duel ratings map league to league onto the reference scale; entry is the third epic league", () => {
  assert.equal(toTournamentRatingScale(0), 0);
  assert.equal(toTournamentRatingScale(900), 2_000);
  assert.equal(toTournamentRatingScale(950), 2_100);
  assert.equal(toTournamentRatingScale(1_200), 2_600);
  assert.equal(toTournamentRatingScale(2_000), 4_200);
  assert.equal(isTournamentEligible(899), false);
  assert.equal(isTournamentEligible(900), true);
});

test("rating uses both ratings and both damages, and a winner can lose rating", () => {
  const even = { playerRating: 2400, opponentRating: 2400, playerMaxHp: 1000, opponentMaxHp: 1000 };
  assert.equal(calculateTournamentRatingChange({ ...even, won: true, damageDealt: 1000, damageTaken: 500 }), 11);
  assert.equal(calculateTournamentRatingChange({ ...even, won: false, damageDealt: 500, damageTaken: 1000 }), -11);
  assert.ok(calculateTournamentRatingChange({ ...even, opponentRating: 1800, won: true, damageDealt: 1000, damageTaken: 980 }) < 0);
  assert.ok(calculateTournamentRatingChange({ ...even, opponentRating: 3000, won: false, damageDealt: 990, damageTaken: 1000 }) > 0);
});

test("stages run in fixed slots of buff window plus a 3:40 round", () => {
  const start = Date.parse("2026-11-03T12:00:00Z");
  const first = getTournamentStageWindow(start, 0);
  assert.deepEqual(first, { pairedAt: start, battleStartsAt: start + 20_000, endsAt: start + 20_000 + 220_000 });
  assert.equal(getTournamentStageWindow(start, 1).pairedAt, first.endsAt);
  assert.equal(getTournamentStageAt(start, start - 1), -1);
  assert.equal(getTournamentStageAt(start, first.endsAt - 1), 0);
  assert.equal(getTournamentStageAt(start, first.endsAt), 1);
});

test("fewer than two real players cancel the event; nobody is filled in", () => {
  assert.equal(planTournamentEvent([], random), null);
  assert.equal(planTournamentEvent([{ playerId: "a", rating: 2000 }], random), null);
});

test("odd fields qualify first; finishes follow the reference prize categories", () => {
  const entries = Array.from({ length: 11 }, (_, index) => ({ playerId: `p${index}`, rating: 2000 + index }));
  const plan = planTournamentEvent(entries, random)!;
  assert.equal(plan.qualification!.pairs.length, 3);
  assert.equal(plan.qualification!.byes.length, 5);
  assert.equal(plan.mainStageOffset, 1);
  assert.ok(getTournamentPendingMatches(plan).every(match => match.stage === 0));
  // The strongest entries receive byes.
  assert.ok(plan.qualification!.byes.includes("p10"));

  const finished = playOut(plan, ([a, b]) => a < b ? a : b);
  const podium = getTournamentPodium(finished)!;
  assert.equal(podium.length, 4);
  const finishes = entries.map(entry => getTournamentFinish(finished, entry.playerId));
  assert.ok(finishes.every(Boolean));
  assert.equal(finishes.filter(finish => finish?.kind === "qualifier").length, 3);
  assert.equal(finishes.filter(finish => finish?.kind === "eliminated" && finish.label === "1/4").length, 4);
  assert.deepEqual(podium.map(id => getTournamentFinish(finished, id)), [1, 2, 3, 4].map(placement => ({ kind: "placement", placement })));
});

test("a forged or premature result cannot advance the event", () => {
  const plan = planTournamentEvent(["a", "b", "c", "d"].map(playerId => ({ playerId, rating: 2000 })), random)!;
  assert.equal(plan.qualification, null);
  const [first] = getTournamentPendingMatches(plan);
  assert.throws(() => recordTournamentResult(plan, first!.id, { winnerId: "x", loserId: first!.playerIds[0] }, random));
  assert.throws(() => recordTournamentResult(plan, "bronze", { winnerId: "a", loserId: "b" }, random));
  const two = playOut(planTournamentEvent([{ playerId: "a", rating: 1 }, { playerId: "b", rating: 2 }], random)!, ([a]) => a);
  assert.deepEqual(getTournamentPodium(two)!.length, 2);
});

function duel(opponentPower = 100) {
  const start = 1_000_000;
  return createTournamentDuel({
    id: "m1", battleStartsAt: start, random,
    sides: [{ playerId: "a", deck: deck("a"), modifiers: modifiers() }, { playerId: "b", deck: deck("b", opponentPower), modifiers: modifiers() }],
  });
}

test("each side sees its own order of the opponent's cards and HP doubles the deck", () => {
  const state = duel();
  assert.equal(state.sides[0].maxHp, 1800);
  assert.equal(state.endsAt - state.battleStartsAt, TOURNAMENT_RULES.roundMs);
  const aView = state.sides[0].view.active.map(card => card.instanceId);
  const bOwn = state.sides[1].own.active.map(card => card.instanceId);
  assert.ok(aView.every(id => id.startsWith("b-")));
  assert.ok(bOwn.every(id => id.startsWith("b-")));
});

test("buffs are bought only before the battle and raise power and HP of that element", () => {
  const state = duel();
  const buffed = chooseTournamentBuff(state, 0, "fire", state.battleStartsAt - 1);
  assert.equal(buffed.sides[0].maxHp, 2 * (6 * 100 + 3 * 115));
  assert.throws(() => chooseTournamentBuff(state, 0, "fire", state.battleStartsAt));
});

test("a strike is an exchange, closes the lane until the cycle turns and ends on knockout", () => {
  let state = duel();
  assert.throws(() => strikeTournamentDuel(state, 0, 0, state.battleStartsAt - 1));
  const now = state.battleStartsAt + 10;
  state = strikeTournamentDuel(state, 0, 1, now);
  const [hit] = state.log;
  assert.equal(hit!.attacker, 0);
  assert.equal(state.sides[1].hp, 1800 - hit!.attackerDamage);
  assert.equal(state.sides[0].hp, 1800 - hit!.defenderDamage);
  assert.equal(state.sides[0].damage, hit!.attackerDamage);
  assert.equal(state.sides[1].damage, hit!.defenderDamage);
  assert.throws(() => strikeTournamentDuel(state, 0, 1, now + 1));
  // The opponent acts independently on its own rows.
  state = strikeTournamentDuel(state, 1, 1, now + 2);
  const next = syncTournamentDuelSide(state, 0, now + TOURNAMENT_RULES.cycleMs);
  assert.deepEqual(next.own.used, [false, false, false]);

  const weak = createTournamentDuel({
    id: "m2", battleStartsAt: 0, random,
    sides: [{ playerId: "a", deck: deck("a", 1000), modifiers: modifiers() }, { playerId: "b", deck: deck("b", 1), modifiers: modifiers() }],
  });
  let fight = weak;
  for (let cycle = 0; !fight.result && cycle < 24; cycle++) {
    for (const slot of [0, 1, 2] as const) if (!fight.result) fight = strikeTournamentDuel(fight, 0, slot, cycle * TOURNAMENT_RULES.cycleMs + slot);
  }
  assert.deepEqual(fight.result, { winnerIndex: 0, reason: "knockout" });
  assert.throws(() => strikeTournamentDuel(fight, 0, 0, 24 * TOURNAMENT_RULES.cycleMs));
});

test("one free card change, then the round ends by damage at its deadline", () => {
  let state = duel(200);
  const now = state.battleStartsAt + 5;
  state = strikeTournamentDuel(state, 1, 0, now);
  state = changeTournamentDuelCards(state, 0, now + 1);
  assert.throws(() => changeTournamentDuelCards(state, 0, now + 2));
  assert.equal(settleTournamentDuelTimeout(state, state.endsAt - 1).result, null);
  const ended = settleTournamentDuelTimeout(state, state.endsAt);
  assert.ok(state.sides[1].damage > state.sides[0].damage);
  assert.deepEqual(ended.result, { winnerIndex: 1, reason: "timeout" });
  assert.throws(() => strikeTournamentDuel(state, 0, 0, state.endsAt));
  assert.ok(TOURNAMENT_PVP_RULES.buffWindowMs > 0);
});

test("tournament collections: element power without HP, HP collection, stronger buff with the giants", () => {
  const bonuses = getTournamentCollectionBonuses(["sea_masters", "wizards", "ugiants", "elementals", "wizards"]);
  assert.deepEqual(bonuses, { elementPowerPct: { fire: 0, water: 5, air: 0, earth: 0 }, hpPct: 5, buffPercent: 20 });
  const state = createTournamentDuel({
    id: "c1", battleStartsAt: 1_000, random,
    sides: [
      { playerId: "a", deck: deck("a"), modifiers: modifiers(), collections: bonuses },
      { playerId: "b", deck: deck("b"), modifiers: modifiers() },
    ],
  });
  // HP: 2 x 900 x 1.05; the water collection adds no HP.
  assert.equal(state.sides[0].maxHp, 1890);
  assert.equal(state.sides[1].maxHp, 1800);
  const water = deck("a").find(card => card.element === "water")!;
  assert.equal(getTournamentCardPower(water, state.sides[0]), 105);
  const buffed = chooseTournamentBuff(state, 0, "water", 999);
  assert.equal(getTournamentCardPower(water, buffed.sides[0]), 125);
  // 2 x (7 x 100 + 2 x 120) x 1.05
  assert.equal(buffed.sides[0].maxHp, Math.round(2 * (7 * 100 + 2 * 120) * 1.05));
});
