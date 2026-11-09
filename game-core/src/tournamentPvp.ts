import {
  ARENA_LEAGUE_CONFIG,
  DUEL_LEAGUE_CONFIG,
  getLeagueIndexByRating,
  type CardElement,
  type DuelBattleModifiers,
  type DuelCardSnapshot,
  type EquipmentBattleState,
  type TournamentBracketMatch,
  type TournamentMatchResult,
  type TournamentSeed,
} from "@cardastika/shared";
import { calculateDuelDamage, shuffleCards, type RandomSource } from "./duel.js";
import {
  TOURNAMENT_RULES,
  advanceTournamentCardCycle,
  changeTournamentCards,
  createTournamentBracket,
  getReadyTournamentMatches,
  getTournamentStartingHp,
  resolveTournamentTimeout,
  seedTournamentQualification,
  useTournamentCard,
  type TournamentCardCycle,
} from "./tournament.js";

export const TOURNAMENT_PVP_RULES = Object.freeze({
  /** Pause after pairing for the pre-battle buff purchase. Not stated by the reference. */
  buffWindowMs: 20_000,
  /** Reference entry is 2000 duel rating: the third epic league, index 9 of 21. */
  requiredDuelLeagueIndex: 9,
  logLimit: 40,
});

function integer(value: number, field: string, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) throw new RangeError(`Invalid tournament ${field}`);
  return value;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

/**
 * Duels use a 100-per-division scale; tournaments use the reference scale shared
 * with the arena. The same league maps to the same league, position kept inside it.
 */
export function toTournamentRatingScale(duelRating: number) {
  integer(duelRating, "duel rating");
  const index = getLeagueIndexByRating(duelRating, DUEL_LEAGUE_CONFIG);
  const duelLeague = DUEL_LEAGUE_CONFIG.leagues[index]!;
  const reference = ARENA_LEAGUE_CONFIG.leagues[index]!;
  const next = ARENA_LEAGUE_CONFIG.leagues[index + 1];
  const span = next ? next.minRating - reference.minRating : 200;
  return reference.minRating + Math.round((duelRating - duelLeague.minRating) * span / DUEL_LEAGUE_CONFIG.divisionRatingStep);
}

export function isTournamentEligible(duelRating: number) {
  return getLeagueIndexByRating(integer(duelRating, "duel rating"), DUEL_LEAGUE_CONFIG) >= TOURNAMENT_PVP_RULES.requiredDuelLeagueIndex;
}

/**
 * The reference publishes only the factors: both ratings and both sides' damage,
 * and a winner may lose rating. This is Cardastika's adaptation of those factors.
 */
export function calculateTournamentRatingChange(input: {
  won: boolean;
  playerRating: number;
  opponentRating: number;
  damageDealt: number;
  damageTaken: number;
  playerMaxHp: number;
  opponentMaxHp: number;
}) {
  integer(input.playerRating, "rating"); integer(input.opponentRating, "rating");
  integer(input.damageDealt, "damage"); integer(input.damageTaken, "damage");
  integer(input.playerMaxHp, "HP", 1); integer(input.opponentMaxHp, "HP", 1);
  const opposition = clamp((input.opponentRating - input.playerRating) / 40, -10, 10);
  const dealt = clamp(input.damageDealt / input.opponentMaxHp, 0, 1);
  const taken = clamp(input.damageTaken / input.playerMaxHp, 0, 1);
  return Math.round((input.won ? 8 : -8) + opposition + (dealt - taken) * 6);
}

/** Every stage pairs, waits for buffs, then runs one 3:40 round; slots are fixed from the start. */
export function getTournamentStageWindow(startsAtMs: number, stage: number) {
  integer(startsAtMs, "start");
  integer(stage, "stage");
  const pairedAt = startsAtMs + stage * (TOURNAMENT_PVP_RULES.buffWindowMs + TOURNAMENT_RULES.roundMs);
  const battleStartsAt = pairedAt + TOURNAMENT_PVP_RULES.buffWindowMs;
  return { pairedAt, battleStartsAt, endsAt: battleStartsAt + TOURNAMENT_RULES.roundMs };
}

export function getTournamentStageAt(startsAtMs: number, now: number) {
  if (now < startsAtMs) return -1;
  return Math.floor((now - startsAtMs) / (TOURNAMENT_PVP_RULES.buffWindowMs + TOURNAMENT_RULES.roundMs));
}

export interface TournamentEventPlan {
  qualification: { pairs: [string, string][]; byes: string[] } | null;
  bracket: TournamentBracketMatch[] | null;
  results: Record<string, TournamentMatchResult>;
  /** Stage of main round 1: 1 after a qualifier, otherwise 0. */
  mainStageOffset: number;
}

export interface TournamentStageMatch {
  id: string;
  stage: number;
  playerIds: [string, string];
}

/** Null when fewer than two real players registered: the event is cancelled, never filled with bots. */
export function planTournamentEvent(entries: readonly TournamentSeed[], random: RandomSource): TournamentEventPlan | null {
  if (entries.length < 2) return null;
  const seeded = seedTournamentQualification(entries, random);
  if (!seeded.pairs.length) {
    return { qualification: null, bracket: createTournamentBracket(seeded.byes, false, random), results: {}, mainStageOffset: 0 };
  }
  return { qualification: { pairs: seeded.pairs, byes: seeded.byes }, bracket: null, results: {}, mainStageOffset: 1 };
}

const qualificationId = (index: number) => `qual-${index}`;

/** Builds the main bracket once every qualifier has a winner. */
function ensureBracket(plan: TournamentEventPlan, random: RandomSource) {
  if (plan.bracket || !plan.qualification) return plan;
  const winners = plan.qualification.pairs.map((_, index) => plan.results[qualificationId(index)]?.winnerId);
  if (winners.some(winner => !winner)) return plan;
  return { ...plan, bracket: createTournamentBracket([...plan.qualification.byes, ...winners as string[]], false, random) };
}

export function getTournamentPendingMatches(plan: TournamentEventPlan): TournamentStageMatch[] {
  if (!plan.bracket) {
    return (plan.qualification?.pairs ?? [])
      .map((playerIds, index) => ({ id: qualificationId(index), stage: 0, playerIds }))
      .filter(match => !plan.results[match.id]);
  }
  return getReadyTournamentMatches(plan.bracket, bracketResults(plan)).map(({ match, playerIds }) => ({
    id: match.id,
    stage: plan.mainStageOffset + match.round - 1,
    playerIds,
  }));
}

function bracketResults(plan: TournamentEventPlan) {
  return Object.fromEntries(Object.entries(plan.results).filter(([id]) => !id.startsWith("qual-")));
}

export function recordTournamentResult(plan: TournamentEventPlan, matchId: string, result: TournamentMatchResult, random: RandomSource) {
  const pending = getTournamentPendingMatches(plan).find(match => match.id === matchId);
  if (!pending) throw new RangeError("Tournament match is not pending");
  const [a, b] = pending.playerIds;
  if (!((result.winnerId === a && result.loserId === b) || (result.winnerId === b && result.loserId === a))) {
    throw new RangeError("Tournament result does not match its participants");
  }
  return ensureBracket({ ...plan, results: { ...plan.results, [matchId]: result } }, random);
}

export type TournamentFinish =
  | { kind: "placement"; placement: 1 | 2 | 3 | 4 }
  | { kind: "eliminated"; eliminatedWith: number; label: string }
  | { kind: "qualifier" };

function fieldLabel(field: number) {
  return field >= 128 ? "1/64 і раніше" : `1/${field / 2}`;
}

/** A finish exists only once the player can no longer play in this event. */
export function getTournamentFinish(plan: TournamentEventPlan, playerId: string): TournamentFinish | null {
  const qualifier = plan.qualification?.pairs.findIndex(pair => pair.includes(playerId)) ?? -1;
  if (qualifier >= 0 && plan.results[qualificationId(qualifier)]?.loserId === playerId) return { kind: "qualifier" };
  if (!plan.bracket) return null;
  const size = plan.bracket.filter(match => match.lane === "upper" && match.round === 1).length * 2;
  const rounds = Math.log2(size);
  const final = plan.results[`upper-${rounds}-0`];
  if (final?.winnerId === playerId) return { kind: "placement", placement: 1 };
  if (final?.loserId === playerId) return { kind: "placement", placement: 2 };
  const bronze = plan.results.bronze;
  if (bronze?.winnerId === playerId) return { kind: "placement", placement: 3 };
  if (bronze?.loserId === playerId) return { kind: "placement", placement: 4 };
  for (let round = 1; round <= rounds - 2; round++) {
    const lost = plan.bracket.some(match => match.lane === "upper" && match.round === round && plan.results[match.id]?.loserId === playerId);
    if (lost) {
      const field = size / 2 ** (round - 1);
      return { kind: "eliminated", eliminatedWith: Math.min(128, field), label: fieldLabel(field) };
    }
  }
  return null;
}

export function isTournamentEventComplete(plan: TournamentEventPlan) {
  return Boolean(plan.bracket) && getTournamentPendingMatches(plan).length === 0;
}

export function getTournamentPodium(plan: TournamentEventPlan): string[] | null {
  if (!plan.bracket || !isTournamentEventComplete(plan)) return null;
  const size = plan.bracket.filter(match => match.lane === "upper" && match.round === 1).length * 2;
  const final = plan.results[`upper-${Math.log2(size)}-0`]!;
  const bronze = plan.results.bronze;
  return [final.winnerId, final.loserId, ...bronze ? [bronze.winnerId, bronze.loserId] : []];
}

/**
 * Collection bonuses that act only in tournaments (reference manual):
 * the four element collections +5% to that element's card power but not HP,
 * the HP collection +5% HP only, and the giants collection makes the bought buff 5% stronger.
 */
export const TOURNAMENT_COLLECTION_EFFECTS: Readonly<Record<string, { element?: CardElement; powerPct?: number; hpPct?: number; buffPct?: number }>> = Object.freeze({
  sea_masters: { element: "water", powerPct: 5 },
  horde: { element: "fire", powerPct: 5 },
  sky_heroes: { element: "air", powerPct: 5 },
  forest_dwellers: { element: "earth", powerPct: 5 },
  wizards: { hpPct: 5 },
  ugiants: { buffPct: 5 },
});

export interface TournamentCollectionBonuses {
  elementPowerPct: Record<CardElement, number>;
  hpPct: number;
  buffPercent: number;
}

export function getTournamentCollectionBonuses(completedCodes: readonly string[]): TournamentCollectionBonuses {
  const result: TournamentCollectionBonuses = { elementPowerPct: { fire: 0, water: 0, air: 0, earth: 0 }, hpPct: 0, buffPercent: TOURNAMENT_RULES.buffPercent };
  for (const code of new Set(completedCodes)) {
    const effect = TOURNAMENT_COLLECTION_EFFECTS[code];
    if (!effect) continue;
    if (effect.element) result.elementPowerPct[effect.element] += effect.powerPct ?? 0;
    result.hpPct += effect.hpPct ?? 0;
    result.buffPercent += effect.buffPct ?? 0;
  }
  return result;
}

export interface TournamentDuelSide {
  playerId: string;
  modifiers: DuelBattleModifiers;
  buff: CardElement | null;
  buffPercent: number;
  /** Element collections: card power only, never HP. Missing in matches stored before this rule. */
  elementPowerPct?: Record<CardElement, number>;
  /** HP collection, added to the battle HP bonus. */
  collectionHpPct?: number;
  /** This side's own cards. */
  own: TournamentCardCycle<DuelCardSnapshot>;
  /** The opponent's cards in the order this side sees them; never the opponent's own layout. */
  view: TournamentCardCycle<DuelCardSnapshot>;
  hp: number;
  maxHp: number;
  damage: number;
  strikes: number;
  equipmentState: EquipmentBattleState;
}

export interface TournamentDuelExchange {
  turn: number;
  attacker: 0 | 1;
  slot: 0 | 1 | 2;
  attackerCard: DuelCardSnapshot;
  defenderCard: DuelCardSnapshot;
  attackerMultiplier: number;
  defenderMultiplier: number;
  attackerDamage: number;
  defenderDamage: number;
  at: number;
}

export interface TournamentDuelState {
  id: string;
  battleStartsAt: number;
  endsAt: number;
  sides: [TournamentDuelSide, TournamentDuelSide];
  log: TournamentDuelExchange[];
  result: { winnerIndex: 0 | 1; reason: "knockout" | "timeout" } | null;
}

function deckOf(side: Pick<TournamentDuelSide, "own">) {
  return [...side.own.active, ...side.own.reserve];
}

function cycleFrom(cards: readonly DuelCardSnapshot[], startedAt: number): TournamentCardCycle<DuelCardSnapshot> {
  if (cards.length < 6) throw new RangeError("Tournament decks need at least six cards");
  return { startedAt, cycle: 0, active: [cards[0]!, cards[1]!, cards[2]!], reserve: cards.slice(3), used: [false, false, false], changes: 0 };
}

export interface TournamentDuelEntrant {
  playerId: string;
  deck: readonly DuelCardSnapshot[];
  modifiers: DuelBattleModifiers;
  collections?: TournamentCollectionBonuses;
}

function hpPercentOf(side: Pick<TournamentDuelSide, "modifiers" | "collectionHpPct">) {
  return side.modifiers.battleHpPct + (side.collectionHpPct ?? 0);
}

export function createTournamentDuel(input: {
  id: string;
  battleStartsAt: number;
  sides: [TournamentDuelEntrant, TournamentDuelEntrant];
  random: RandomSource;
}): TournamentDuelState {
  integer(input.battleStartsAt, "battle start");
  const [a, b] = input.sides;
  if (a.playerId === b.playerId) throw new RangeError("A tournament player cannot face themselves");
  const side = (self: typeof a, other: typeof a): TournamentDuelSide => {
    const collections = self.collections ?? getTournamentCollectionBonuses([]);
    const maxHp = getTournamentStartingHp(self.deck, { hpPercent: self.modifiers.battleHpPct + collections.hpPct });
    return {
      playerId: self.playerId,
      modifiers: self.modifiers,
      buff: null,
      buffPercent: collections.buffPercent,
      elementPowerPct: { ...collections.elementPowerPct },
      collectionHpPct: collections.hpPct,
      own: cycleFrom(shuffleCards(self.deck, input.random), input.battleStartsAt),
      view: cycleFrom(shuffleCards(other.deck, input.random), input.battleStartsAt),
      hp: maxHp,
      maxHp,
      damage: 0,
      strikes: 0,
      equipmentState: { reviveUsed: false, voodooUsed: false },
    };
  };
  return {
    id: input.id,
    battleStartsAt: input.battleStartsAt,
    endsAt: input.battleStartsAt + TOURNAMENT_RULES.roundMs,
    sides: [side(a, b), side(b, a)],
    log: [],
    result: null,
  };
}

/** Card power with this side's bought buff and element collections; the percentages add up. */
export function getTournamentCardPower(card: DuelCardSnapshot, side: Pick<TournamentDuelSide, "buff" | "buffPercent" | "elementPowerPct">) {
  const percent = (card.element === side.buff ? side.buffPercent : 0) + (side.elementPowerPct?.[card.element] ?? 0);
  return percent ? Math.round(card.finalPower * (100 + percent) / 100) : card.finalPower;
}

/** Before the battle a buff can be bought and changed; each choice is paid separately by the caller. */
export function chooseTournamentBuff(state: TournamentDuelState, sideIndex: 0 | 1, element: CardElement, now: number): TournamentDuelState {
  if (now >= state.battleStartsAt) throw new RangeError("Tournament buffs close when the battle starts");
  const sides = [...state.sides] as TournamentDuelState["sides"];
  const side = sides[sideIndex];
  const maxHp = getTournamentStartingHp(deckOf(side), { hpPercent: hpPercentOf(side), buffElement: element, buffPercent: side.buffPercent });
  sides[sideIndex] = { ...side, buff: element, maxHp, hp: maxHp };
  return { ...state, sides };
}

function isLive(state: TournamentDuelState, now: number) {
  return !state.result && now >= state.battleStartsAt && now < state.endsAt;
}

/** Brings both rows to the current nine-second cycle without acting. */
export function syncTournamentDuelSide(state: TournamentDuelState, sideIndex: 0 | 1, now: number) {
  const side = state.sides[sideIndex];
  if (!isLive(state, now)) return { own: side.own, view: side.view };
  return { own: advanceTournamentCardCycle(side.own, new Date(now)), view: advanceTournamentCardCycle(side.view, new Date(now)) };
}

function applyDeathArtifacts(fallen: TournamentDuelSide, killer: TournamentDuelSide) {
  const equipment = fallen.modifiers.equipment;
  if (fallen.hp > 0 || !equipment) return;
  if (!fallen.equipmentState.reviveUsed && equipment.reviveHpPct > 0) {
    fallen.hp = Math.max(1, Math.round(fallen.maxHp * equipment.reviveHpPct / 100));
    fallen.equipmentState = { ...fallen.equipmentState, reviveUsed: true };
  } else if (!fallen.equipmentState.voodooUsed && equipment.voodooHpReductionPct > 0) {
    killer.hp = Math.max(0, killer.hp - Math.round(killer.maxHp * equipment.voodooHpReductionPct / 100));
    fallen.equipmentState = { ...fallen.equipmentState, voodooUsed: true };
  }
}

function settleKnockout(state: TournamentDuelState) {
  const [a, b] = state.sides;
  if (a.hp > 0 && b.hp > 0) return null;
  if (a.hp === 0 && b.hp === 0) {
    return { winnerIndex: resolveTournamentTimeout({ damage: a.damage, remainingHp: 0 }, { damage: b.damage, remainingHp: 0 }, `${state.id}:${a.playerId}:${b.playerId}`), reason: "knockout" as const };
  }
  return { winnerIndex: (a.hp === 0 ? 1 : 0) as 0 | 1, reason: "knockout" as const };
}

/**
 * A strike is an exchange, as in duels and the arena: the card this side sees in
 * that lane answers. The lane closes on both of this side's rows until the cycle turns.
 */
export function strikeTournamentDuel(state: TournamentDuelState, sideIndex: 0 | 1, slot: 0 | 1 | 2, now: number): TournamentDuelState {
  if (!isLive(state, now)) throw new RangeError("Tournament battle is not live");
  const sides = state.sides.map(side => ({ ...side })) as TournamentDuelState["sides"];
  const attacker = sides[sideIndex];
  const defender = sides[sideIndex === 0 ? 1 : 0];
  const at = new Date(now);
  const used = useTournamentCard(attacker.own, slot, at);
  const view = advanceTournamentCardCycle(attacker.view, at);
  const attackerCard = used.card;
  const defenderCard = view.active[slot];
  const viewUsed: [boolean, boolean, boolean] = [...view.used];
  viewUsed[slot] = true;
  attacker.own = used.state;
  attacker.view = { ...view, used: viewUsed };

  const attackerPower = getTournamentCardPower(attackerCard, attacker);
  const hit = calculateDuelDamage({
    attackerFinalPower: attackerPower,
    attackerElement: attackerCard.element,
    defenderElement: defenderCard.element,
    battleDamagePct: attacker.modifiers.battleDamagePct,
    attackerElementDamagePct: attacker.modifiers.elementDamagePct[attackerCard.element],
    attackerEquipment: attacker.modifiers.equipment,
  });
  const damage = Math.round(hit.damage * Math.max(0, 1 - (defender.modifiers.equipment?.incomingDamageReductionPct ?? 0) / 100));
  defender.hp = Math.max(0, defender.hp - damage);
  attacker.hp = Math.max(0, attacker.hp - Math.round(attackerPower * (defender.modifiers.equipment?.damageReflectionPct ?? 0) / 100));
  applyDeathArtifacts(defender, attacker);
  applyDeathArtifacts(attacker, defender);
  // The answer ignores artifacts, as in the arena.
  const counter = attacker.hp > 0 ? calculateDuelDamage({
    attackerFinalPower: getTournamentCardPower(defenderCard, defender),
    attackerElement: defenderCard.element,
    defenderElement: attackerCard.element,
    battleDamagePct: defender.modifiers.battleDamagePct,
    attackerElementDamagePct: defender.modifiers.elementDamagePct[defenderCard.element],
  }) : { damage: 0, multiplier: 1 };
  attacker.hp = Math.max(0, attacker.hp - counter.damage);
  applyDeathArtifacts(attacker, defender);
  applyDeathArtifacts(defender, attacker);
  attacker.damage += damage;
  defender.damage += counter.damage;
  attacker.strikes += 1;

  const exchange: TournamentDuelExchange = {
    turn: (state.log[0]?.turn ?? 0) + 1,
    attacker: sideIndex,
    slot,
    attackerCard: { ...attackerCard, finalPower: attackerPower },
    defenderCard: { ...defenderCard, finalPower: getTournamentCardPower(defenderCard, defender) },
    attackerMultiplier: hit.multiplier,
    defenderMultiplier: counter.multiplier,
    attackerDamage: damage,
    defenderDamage: counter.damage,
    at: now,
  };
  const next: TournamentDuelState = { ...state, sides, log: [exchange, ...state.log].slice(0, TOURNAMENT_PVP_RULES.logLimit) };
  return { ...next, result: settleKnockout(next) };
}

/** One free change of this side's own cards; already used lanes stay closed this cycle. */
export function changeTournamentDuelCards(state: TournamentDuelState, sideIndex: 0 | 1, now: number): TournamentDuelState {
  if (!isLive(state, now)) throw new RangeError("Tournament battle is not live");
  const sides = [...state.sides] as TournamentDuelState["sides"];
  const side = sides[sideIndex];
  sides[sideIndex] = { ...side, own: changeTournamentCards(side.own, new Date(now)), view: advanceTournamentCardCycle(side.view, new Date(now)) };
  return { ...state, sides };
}

/** Closes the round at its deadline: more damage, then more HP, then a stable seed. */
export function settleTournamentDuelTimeout(state: TournamentDuelState, now: number): TournamentDuelState {
  if (state.result || now < state.endsAt) return state;
  const [a, b] = state.sides;
  const winnerIndex = resolveTournamentTimeout(
    { damage: a.damage, remainingHp: a.hp },
    { damage: b.damage, remainingHp: b.hp },
    `${state.id}:${a.playerId}:${b.playerId}`,
  );
  return { ...state, result: { winnerIndex, reason: "timeout" } };
}
