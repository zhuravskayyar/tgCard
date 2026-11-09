import {
  CARD_ELEMENTS,
  type CardElement,
  type TournamentBracketMatch,
  type TournamentBuffOption,
  type TournamentLeague,
  type TournamentMatchResult,
  type TournamentMatchSource,
  type TournamentPrize,
  type TournamentRegularLeague,
  type TournamentSchedule,
  type TournamentSeed,
} from "@cardastika/shared";
import { shuffleCards, type RandomSource } from "./duel.js";

export const TOURNAMENT_RULES = Object.freeze({
  requiredDuelRating: 2_000,
  registrationMs: 30 * 60_000,
  cycleMs: 9_000,
  roundMs: 220_000,
  freeCardChanges: 1,
  hpMultiplier: 2,
  buffGold: 10,
  buffPercent: 15,
  collectionBuffPercent: 20,
  utcOffsetMinutes: 0,
  championCount: 128,
  championActivityMs: 14 * 24 * 60 * 60_000,
});

export const TOURNAMENT_LEAGUES: Readonly<Record<TournamentLeague, {
  name: string; minimumRating: number; hours: readonly number[];
}>> = Object.freeze({
  conqueror: { name: "Ліга Підкорювачів", minimumRating: 2_000, hours: [12, 22] },
  champion: { name: "Ліга Чемпіонів", minimumRating: 2_600, hours: [11, 21] },
  master: { name: "Ліга Майстрів", minimumRating: 3_200, hours: [10, 20] },
  ruler: { name: "Ліга Володарів", minimumRating: 3_800, hours: [9, 19] },
  crown: { name: "Ліга Чемпіонів (відбір)", minimumRating: 0, hours: [9, 19] },
});

const REGULAR_LEAGUES: readonly TournamentRegularLeague[] = ["conqueror", "champion", "master", "ruler"];
const COUNTER: Readonly<Record<CardElement, CardElement>> = { fire: "water", water: "earth", earth: "air", air: "fire" };
const DAY_MS = 24 * 60 * 60_000;

function integer(value: number, field: string, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) throw new RangeError(`Invalid tournament ${field}`);
  return value;
}

function timestamp(value: Date) {
  const result = value.getTime();
  if (!Number.isFinite(result)) throw new RangeError("Invalid tournament date");
  return result;
}

export function getInitialTournamentRating(duelRating: number, arenaRating: number) {
  return Math.min(3_800, Math.max(integer(duelRating, "duel rating"), integer(arenaRating, "arena rating")));
}

/** Global tournament leagues never demote; entering Ruler also requires a Master cup. */
export function getTournamentLeague(input: {
  rating: number; highestLeague?: TournamentRegularLeague; hasMasterCup?: boolean;
}): TournamentRegularLeague {
  integer(input.rating, "rating");
  const floor = input.highestLeague ? REGULAR_LEAGUES.indexOf(input.highestLeague) : 0;
  if (floor < 0) throw new RangeError("Invalid tournament highest league");
  let index = 0;
  REGULAR_LEAGUES.forEach((league, candidate) => {
    if (input.rating >= TOURNAMENT_LEAGUES[league].minimumRating) index = candidate;
  });
  if (index === 3 && !input.hasMasterCup) index = 2;
  return REGULAR_LEAGUES[Math.max(floor, index, 0)]!;
}

/** Cardastika tournaments use GMT (UTC+0), independent of host timezone and daylight saving. */
export function getNextTournamentSchedule(league: TournamentLeague, now: Date, truce = false): TournamentSchedule {
  const current = timestamp(now);
  const offset = TOURNAMENT_RULES.utcOffsetMinutes * 60_000;
  const local = new Date(current + offset);
  const localMidnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  for (let day = 0; day < 8; day++) {
    const midnight = localMidnight + day * DAY_MS;
    const weekday = new Date(midnight).getUTCDay();
    if (!truce && (weekday === 3 || weekday === 5)) continue;
    for (const hour of TOURNAMENT_LEAGUES[league].hours) {
      const startsAt = midnight + hour * 60 * 60_000 - offset;
      if (startsAt <= current) continue;
      const registrationOpensAt = startsAt - TOURNAMENT_RULES.registrationMs;
      return {
        league,
        startsAt: new Date(startsAt).toISOString(),
        registrationOpensAt: new Date(registrationOpensAt).toISOString(),
        registrationOpen: current >= registrationOpensAt,
        utcOffsetMinutes: TOURNAMENT_RULES.utcOffsetMinutes,
      };
    }
  }
  throw new Error("Tournament schedule has no upcoming event");
}

function assertPlayers(playerIds: readonly string[]) {
  if (playerIds.some(id => !id.trim()) || new Set(playerIds).size !== playerIds.length) {
    throw new RangeError("Tournament players must have unique non-empty IDs");
  }
}

/** Only the lowest-rated players qualify; the strongest receive byes. No bot filling. */
export function seedTournamentQualification(entries: readonly TournamentSeed[], random: RandomSource) {
  if (entries.length < 2) throw new RangeError("A tournament needs at least two real players");
  assertPlayers(entries.map(entry => entry.playerId));
  entries.forEach(entry => integer(entry.rating, "seed rating"));
  const sorted = [...entries].sort((a, b) => b.rating - a.rating || a.playerId.localeCompare(b.playerId));
  const bracketSize = 2 ** Math.floor(Math.log2(entries.length));
  const qualifierCount = entries.length - bracketSize;
  const byeCount = entries.length - qualifierCount * 2;
  const qualifiers = shuffleCards(sorted.slice(byeCount), random);
  const pairs: [string, string][] = [];
  for (let index = 0; index < qualifiers.length; index += 2) {
    pairs.push([qualifiers[index]!.playerId, qualifiers[index + 1]!.playerId]);
  }
  return { bracketSize, byes: sorted.slice(0, byeCount).map(entry => entry.playerId), pairs };
}

const winner = (matchId: string): TournamentMatchSource => ({ kind: "winner", matchId });
const loser = (matchId: string): TournamentMatchSource => ({ kind: "loser", matchId });

/** Match dependencies preserve the bracket after the random first round. */
export function createTournamentBracket(playerIds: readonly string[], doubleElimination: boolean, random: RandomSource) {
  assertPlayers(playerIds);
  if (playerIds.length < 2 || !Number.isInteger(Math.log2(playerIds.length))) {
    throw new RangeError("Main tournament bracket must have a power-of-two size");
  }
  const seeds = shuffleCards(playerIds, random);
  const matches: TournamentBracketMatch[] = [];
  const upper: string[][] = [];
  let sources: TournamentMatchSource[] = seeds.map(playerId => ({ kind: "player", playerId }));
  const rounds = Math.log2(seeds.length);
  for (let round = 1; round <= rounds; round++) {
    const ids: string[] = [];
    for (let index = 0; index < sources.length; index += 2) {
      const id = `upper-${round}-${index / 2}`;
      matches.push({ id, lane: "upper", round, sides: [sources[index]!, sources[index + 1]!] });
      ids.push(id);
    }
    upper.push(ids);
    sources = ids.map(winner);
  }
  const upperFinal = upper.at(-1)![0]!;
  if (!doubleElimination) {
    if (rounds >= 2) matches.push({
      id: "bronze", lane: "bronze", round: rounds,
      sides: [loser(upper.at(-2)![0]!), loser(upper.at(-2)![1]!)],
    });
    return matches;
  }
  if (rounds === 1) {
    matches.push({ id: "final", lane: "final", round: 2, sides: [winner(upperFinal), loser(upperFinal)] });
  } else {
    let lower: string[] = [];
    for (let index = 0; index < upper[0]!.length; index += 2) {
      const id = `lower-1-${index / 2}`;
      matches.push({ id, lane: "lower", round: 1, sides: [loser(upper[0]![index]!), loser(upper[0]![index + 1]!)] });
      lower.push(id);
    }
    for (let upperRound = 2; upperRound <= rounds; upperRound++) {
      const mixed: string[] = [];
      const incoming = upper[upperRound - 1]!;
      for (let index = 0; index < lower.length; index++) {
        const id = `lower-${upperRound * 2 - 2}-${index}`;
        // Cross adjacent upper losers to avoid an immediate repeat of the previous upper pairing.
        const upperIndex = incoming.length > 1 ? index ^ 1 : index;
        matches.push({ id, lane: "lower", round: upperRound * 2 - 2, sides: [winner(lower[index]!), loser(incoming[upperIndex]!)] });
        mixed.push(id);
      }
      lower = mixed;
      if (upperRound < rounds) {
        const reduced: string[] = [];
        for (let index = 0; index < lower.length; index += 2) {
          const id = `lower-${upperRound * 2 - 1}-${index / 2}`;
          matches.push({ id, lane: "lower", round: upperRound * 2 - 1, sides: [winner(lower[index]!), winner(lower[index + 1]!)] });
          reduced.push(id);
        }
        lower = reduced;
      }
    }
    matches.push({ id: "final", lane: "final", round: rounds * 2, sides: [winner(upperFinal), winner(lower[0]!)] });
  }
  matches.push({ id: "reset", lane: "reset", round: rounds * 2 + 1, sides: [winner("final"), loser("final")] });
  return matches;
}

/** Accepts results only for real, ready matches; duplicate/forged winners cannot advance. */
export function getReadyTournamentMatches(bracket: readonly TournamentBracketMatch[], results: Readonly<Record<string, TournamentMatchResult>>) {
  const resolved = new Map<string, TournamentMatchResult>();
  const ready: { match: TournamentBracketMatch; playerIds: [string, string] }[] = [];
  const read = (source: TournamentMatchSource) => source.kind === "player" ? source.playerId :
    source.kind === "winner" ? resolved.get(source.matchId)?.winnerId : resolved.get(source.matchId)?.loserId;
  const pending = [...bracket];
  // Lower-bracket matches depend on one another as well as upper-bracket matches.
  for (let pass = 0; pass < bracket.length && pending.length; pass++) {
    let progressed = false;
    for (let index = pending.length - 1; index >= 0; index--) {
      const match = pending[index]!;
      const a = read(match.sides[0]), b = read(match.sides[1]);
      if (!a || !b) continue;
      if (a === b) throw new RangeError("A tournament player cannot face themselves");
      if (match.lane === "reset") {
        const final = bracket.find(row => row.id === "final");
        if (!final || resolved.get("final")?.winnerId === read(final.sides[0])) {
          if (results[match.id]) throw new RangeError("Tournament final reset is not required");
          pending.splice(index, 1);
          continue;
        }
      }
      const result = results[match.id];
      if (result) {
        if (!((result.winnerId === a && result.loserId === b) || (result.winnerId === b && result.loserId === a))) {
          throw new RangeError("Tournament result does not match its participants");
        }
        resolved.set(match.id, result);
      } else ready.push({ match, playerIds: [a, b] });
      pending.splice(index, 1);
      progressed = true;
    }
    if (!progressed) break;
  }
  if (Object.keys(results).some(id => !resolved.has(id))) throw new RangeError("Tournament result refers to an unready or unknown match");
  return ready;
}

export function getTournamentBuffOptions(
  own: readonly { element: CardElement; finalPower: number }[],
  opponent: readonly { element: CardElement; finalPower: number }[],
  percent: number = TOURNAMENT_RULES.buffPercent,
): [TournamentBuffOption, TournamentBuffOption] {
  if (!own.length || !opponent.length) throw new RangeError("Tournament buffs require both decks");
  integer(percent, "buff percentage");
  const gain = (cards: typeof own, element: CardElement) => cards.reduce((sum, card) => {
    integer(card.finalPower, "card power", 1);
    return sum + (card.element === element ? Math.round(card.finalPower * (100 + percent) / 100) - card.finalPower : 0);
  }, 0);
  const strongest = (cards: typeof own) => CARD_ELEMENTS.reduce((best, element) => gain(cards, element) > gain(cards, best) ? element : best);
  const ownElement = strongest(own);
  let counter = COUNTER[strongest(opponent)];
  if (counter === ownElement) counter = COUNTER[COUNTER[ownElement]];
  return [ownElement, counter].map(element => ({ element, addedPower: gain(own, element) })) as [TournamentBuffOption, TournamentBuffOption];
}

/** Elemental damage collections do not enter this HP calculation. */
export function getTournamentStartingHp(cards: readonly { element: CardElement; finalPower: number }[], input: {
  additionalCards?: readonly { element: CardElement; finalPower: number }[];
  hpPercent?: number; buffElement?: CardElement; buffPercent?: number;
} = {}) {
  const hpPercent = integer(input.hpPercent ?? 0, "HP percentage");
  const buffPercent = integer(input.buffPercent ?? TOURNAMENT_RULES.buffPercent, "buff percentage");
  const power = [...cards, ...input.additionalCards ?? []].reduce((sum, card) => sum + Math.round(integer(card.finalPower, "card power", 1)
    * (card.element === input.buffElement ? (100 + buffPercent) / 100 : 1)), 0);
  return Math.round(power * TOURNAMENT_RULES.hpMultiplier * (100 + hpPercent) / 100);
}

/**
 * Damage dealt wins first; with equal damage (the reference names the 0:0 case)
 * more remaining HP wins. An exact tie is settled by a stable match seed.
 */
export function resolveTournamentTimeout(
  a: { damage: number; remainingHp: number },
  b: { damage: number; remainingHp: number },
  tieSeed: string,
): 0 | 1 {
  integer(a.damage, "damage"); integer(b.damage, "damage");
  integer(a.remainingHp, "remaining HP"); integer(b.remainingHp, "remaining HP");
  if (a.damage !== b.damage) return a.damage > b.damage ? 0 : 1;
  if (a.remainingHp !== b.remainingHp) return a.remainingHp > b.remainingHp ? 0 : 1;

  // FNV-1a gives the same side for the same match after retries/restarts.
  let hash = 2166136261;
  for (const character of tieSeed) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return ((hash >>> 0) & 1) as 0 | 1;
}

/** Tracks used slots; unused cards remain on the table when the nine-second cycle turns. */
export interface TournamentCardCycle<T> {
  startedAt: number;
  cycle: number;
  active: [T, T, T];
  reserve: T[];
  used: [boolean, boolean, boolean];
  changes: number;
}

export function advanceTournamentCardCycle<T>(state: TournamentCardCycle<T>, now: Date): TournamentCardCycle<T> {
  const elapsed = timestamp(now) - state.startedAt;
  if (elapsed < 0 || elapsed >= TOURNAMENT_RULES.roundMs) throw new RangeError("Tournament round is outside its action window");
  const cycle = Math.floor(elapsed / TOURNAMENT_RULES.cycleMs);
  if (cycle < state.cycle) throw new RangeError("Tournament clock cannot go backwards");
  if (cycle === state.cycle) return state;
  const active: [T, T, T] = [...state.active];
  const reserve = [...state.reserve];
  for (let slot = 0; slot < 3; slot++) {
    if (!state.used[slot]) continue;
    if (!reserve.length) throw new RangeError("Tournament reserve is empty");
    const next = reserve.shift()!;
    reserve.push(active[slot]!);
    active[slot as 0 | 1 | 2] = next;
  }
  return { ...state, cycle, active, reserve, used: [false, false, false] };
}

export function useTournamentCard<T>(state: TournamentCardCycle<T>, slot: 0 | 1 | 2, now: Date) {
  if (slot !== 0 && slot !== 1 && slot !== 2) throw new RangeError("Invalid tournament slot");
  const current = advanceTournamentCardCycle(state, now);
  if (current.used[slot]) throw new RangeError("Tournament card already used in this cycle");
  const used: [boolean, boolean, boolean] = [...current.used];
  used[slot] = true;
  return { card: current.active[slot], state: { ...current, used } };
}

export function changeTournamentCards<T>(state: TournamentCardCycle<T>, now: Date): TournamentCardCycle<T> {
  const current = advanceTournamentCardCycle(state, now);
  if (current.changes >= TOURNAMENT_RULES.freeCardChanges) throw new RangeError("Tournament free card change already used");
  if (current.reserve.length < 3) throw new RangeError("Tournament reserve needs three replacement cards");
  return {
    ...current,
    active: [current.reserve[0]!, current.reserve[1]!, current.reserve[2]!],
    reserve: [...current.reserve.slice(3), ...current.active],
    // Changing cards never grants extra strikes within the current cycle.
    used: [...current.used],
    changes: current.changes + 1,
  };
}

const EPIC_PRIZES = {
  podium: ["beautiful_valkyrie", "forest_dryad", "fire_witch", "cruel_medusa"],
  bronze: ["battle_gryphon", "rogue_bear", "giant_orc", "killer_shark"],
  quarter: ["sky_scout", "elvish_scout", "orc_raider", "river_naiad"],
  eighth: ["air_mage", "forest_keeper", "fire_servant", "fruity_siren"],
  participant: ["sky_priestess", "gloomy_wayfarer", "mountain_troll", "submarine_warrior"],
} as const;

/** Remaining is the round's initial field size; the qualifier is a separate category. */
export function getTournamentPrize(league: TournamentLeague, result: {
  placement?: 1 | 2 | 3 | 4; eliminatedWith?: number; qualifier?: boolean;
}): TournamentPrize {
  const { placement, eliminatedWith, qualifier } = result;
  if (Number(Boolean(qualifier)) + Number(placement !== undefined) + Number(eliminatedWith !== undefined) !== 1) {
    throw new RangeError("Specify exactly one tournament finish category");
  }
  if (placement !== undefined && ![1, 2, 3, 4].includes(placement)) throw new RangeError("Invalid tournament placement");
  if (eliminatedWith !== undefined && (!Number.isSafeInteger(eliminatedWith) || eliminatedWith < 8 || !Number.isInteger(Math.log2(eliminatedWith)))) {
    throw new RangeError("Invalid tournament elimination round");
  }
  if (qualifier) return { badge: null, diamonds: league === "crown" || league === "ruler" ? 2 : league === "master" ? 1 : 0, reward: null };
  const badge = placement ? `cup_${placement}` as TournamentPrize["badge"] : league === "crown" ? "participant"
    : eliminatedWith === 8 ? "quarterfinal" : eliminatedWith === 16 ? "eighthfinal" : "participant";
  if (league === "conqueror") {
    const key = placement ? placement <= 2 ? "podium" : "bronze" : eliminatedWith === 8 ? "quarter" : eliminatedWith === 16 ? "eighth" : "participant";
    const level = placement ? placement <= 2 ? 35 : 30 : eliminatedWith === 8 || eliminatedWith === 16 ? 25 : 20;
    return { badge, diamonds: 0, reward: { kind: "card", level, cardCodes: EPIC_PRIZES[key] } };
  }
  const field = eliminatedWith ?? 0;
  const level = league === "champion"
    ? placement ? placement <= 2 ? 60 : 55 : field === 8 ? 50 : field === 16 ? 45 : field === 32 ? 40 : 35
    : league === "master"
      ? placement ? 75 : field <= 16 ? 70 : field <= 64 ? 65 : 60
      : league === "ruler"
        ? placement ? 90 : field <= 16 ? 85 : field === 32 ? 80 : 75
        : placement ? 105 : field <= 32 ? 100 : 95;
  const diamonds = league === "champion" ? placement === 1 ? 2 : 1
    : league === "master" ? placement ? 3 : 2
      : league === "ruler" ? placement ? 5 : 3 : placement && placement <= 2 ? 5 : 3;
  return { badge, diamonds, reward: { kind: "source", level, cardCodes: [] } };
}

export function getTournamentBattleXp(input: {
  damageDealt: number; opponentStartingHp: number; experiencePercent?: number; outcome: "win" | "loss";
}) {
  const { damageDealt, opponentStartingHp, experiencePercent = 0, outcome } = input;
  integer(damageDealt, "damage"); integer(opponentStartingHp, "opponent HP", 1); integer(experiencePercent, "XP percentage");
  const base = outcome === "win" ? opponentStartingHp : Math.min(damageDealt, opponentStartingHp);
  return Math.round(base * (100 + experiencePercent) / 100);
}

export function selectTournamentChampions(candidates: readonly {
  playerId: string; deckPower: number; guildPower: number; allyPower: number;
  hasRulerCup: boolean; lastRulerTournamentAt: string | null;
}[], selectionAt: Date) {
  const at = timestamp(selectionAt);
  const local = new Date(at + TOURNAMENT_RULES.utcOffsetMinutes * 60_000);
  if (local.getUTCDay() !== 1 || local.getUTCHours() !== 0 || local.getUTCMinutes() !== 0 || local.getUTCSeconds() !== 0 || local.getUTCMilliseconds() !== 0) {
    throw new RangeError("Champion selection is Monday at midnight GMT");
  }
  assertPlayers(candidates.map(row => row.playerId));
  return candidates.map(row => ({ ...row, power: integer(row.deckPower, "deck power") + integer(row.guildPower, "guild power") + integer(row.allyPower, "ally power") }))
    .filter(row => {
      const last = row.lastRulerTournamentAt === null ? NaN : Date.parse(row.lastRulerTournamentAt);
      return row.hasRulerCup && last <= at && last >= at - TOURNAMENT_RULES.championActivityMs;
    })
    .sort((a, b) => b.power - a.power || a.playerId.localeCompare(b.playerId))
    .slice(0, TOURNAMENT_RULES.championCount).map(row => row.playerId);
}
