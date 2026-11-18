/**
 * «Навала Шуліки»: a server-wide chain of 24 bosses, copied from the reference
 * (docs/reference-elem-invasion.md). Only names are our own; numbers follow the manual.
 * Everything here is pure: time is passed in, randomness is injected.
 */
import type { CardElement, DuelBattleModifiers, DuelCardSnapshot } from "@cardastika/shared";
import { calculateDuelDamage, getElementMultiplier, type RandomSource } from "./duel.js";

export type InvasionCollectionCode = "umutants" | "usoldiers" | "ugiants" | "ufavorites" | "ugenerals";

export interface InvasionBossDefinition {
  /** 1–24. */
  number: number;
  /** Card id of the boss; the boss art and name come from this card. */
  cardId: string;
  health: number;
  /** Level of the card for first place; power is the level base + {@link INVASION_PRIZE_BONUS_POWER}. */
  prizeLevel: number;
  /** Silver coefficient K. */
  silverK: number;
  collections: readonly InvasionCollectionCode[];
}

const G = 1_000_000_000;
const M1: readonly InvasionCollectionCode[] = ["umutants"];
const M2: readonly InvasionCollectionCode[] = ["umutants", "usoldiers"];
const M3: readonly InvasionCollectionCode[] = ["umutants", "usoldiers", "ugiants"];
const M4: readonly InvasionCollectionCode[] = ["umutants", "usoldiers", "ugiants", "ufavorites"];
const M5: readonly InvasionCollectionCode[] = ["umutants", "usoldiers", "ugiants", "ufavorites", "ugenerals"];

const BOSS_ROWS: readonly [string, number, number, number, readonly InvasionCollectionCode[]][] = [
  ["flying_monkey", 1.34, 65, 4_500, M1],
  ["gloomy_rhino", 1.4, 65, 4_500, M1],
  ["furious_rat", 1.46, 70, 4_875, M2],
  ["merry_croco", 1.53, 70, 4_875, M2],
  ["snow_warrior", 1.6, 75, 5_250, M2],
  ["sandstorm", 1.67, 75, 5_250, M2],
  ["drunk_cyclop", 1.74, 80, 6_000, M2],
  ["ancient_turtle", 1.81, 80, 6_000, M2],
  ["wild_wolf", 1.9, 85, 6_375, M3],
  ["forest_bride", 1.98, 85, 6_375, M3],
  ["el_minotauro", 2.07, 90, 6_750, M3],
  ["night_fury", 2.16, 90, 6_750, M3],
  ["air_serpent", 2.25, 95, 7_500, M3],
  ["mamukrajua", 2.35, 95, 7_500, M3],
  ["eternal_phoenix", 2.46, 100, 9_000, M4],
  ["sage_basilisk", 2.56, 100, 9_000, M4],
  ["north_witch", 2.68, 105, 11_250, M5],
  ["wood_mistress", 2.79, 105, 11_250, M5],
  ["fire_knight", 2.92, 110, 15_000, M5],
  ["lakes_princess", 3.05, 110, 15_000, M5],
  ["heaven_mistress", 3.18, 115, 16_500, M5],
  ["shadow_heritress", 3.32, 115, 16_500, M5],
  ["captain_daughter", 3.47, 120, 18_750, M5],
  ["black_widow", 3.64, 120, 18_750, M5],
];

export const INVASION_BOSSES: readonly InvasionBossDefinition[] = Object.freeze(BOSS_ROWS.map(
  ([cardId, healthG, prizeLevel, silverK, collections], index) => Object.freeze({
    number: index + 1,
    cardId,
    health: Math.round(healthG * G),
    prizeLevel,
    silverK,
    collections: Object.freeze([...collections]),
  }),
));

export const INVASION_BOSS_COUNT = INVASION_BOSSES.length;

export function getInvasionBoss(number: number) {
  const boss = INVASION_BOSSES[number - 1];
  if (!boss) throw new RangeError(`Invasion boss ${number} does not exist`);
  return boss;
}

/** Boss deck card power by collection (reference observations). */
export const INVASION_COLLECTION_POWER: Readonly<Record<InvasionCollectionCode, readonly [number, number]>> = Object.freeze({
  umutants: [2_600, 2_900],
  usoldiers: [3_100, 3_500],
  ugiants: [5_000, 5_500],
  ufavorites: [6_800, 7_500],
  ugenerals: [7_900, 8_700],
});

export const INVASION_BOSS_DECK_SIZE = 9;
export const INVASION_CYCLE_MS = 9_000;
export const INVASION_SLOT_COUNT = 3;
export const INVASION_LOG_SIZE = 6;
export const INVASION_CARD_SWAP_GOLD = 10;
export const INVASION_PRIZE_BONUS_POWER = 1_398;
export const INVASION_SUPER_STRIKE_MULTIPLIER = 10;
export const INVASION_SUPER_STRIKE_COUNTER_MULTIPLIER = 0.5;
/** The manual only says "extremely small"; our assumption, see the reference doc. */
export const INVASION_SUPER_STRIKE_CHANCE = 0.001;
export const INVASION_SUPER_STRIKE_CARD_LEVEL: readonly [number, number] = Object.freeze([54, 74] as const);
export const INVASION_BOSS_PAUSE_MS = 15 * 60_000;
export const INVASION_MECHANISTS_PCT = 5;
export const INVASION_CHAMPION_PCT = 10;
export const INVASION_CHAMPION_FIRST_PLACES = 20;
/** Random prize winners are drawn from these places (2…N); weight 1/√place. */
export const INVASION_RANDOM_PRIZE_MAX_PLACE = 200;
/** Diamonds into «Алмазні нагороди»: 2 per attack up to the daily norm (doubled by «Шукачі скарбів»). */
export const INVASION_DIAMONDS_PER_ATTACK = 2;
export const INVASION_DAILY_DIAMONDS = 8;
/** Random 1–5 diamonds above the norm; the manual gives no chance, ours is an assumption. */
export const INVASION_BONUS_DIAMOND_CHANCE = 0.1;
export const INVASION_BONUS_DIAMONDS: readonly [number, number] = Object.freeze([1, 5] as const);
/** «Улюбленець фортуни»: 100 super strikes; a super-strike prize then gives three cards. */
export const INVASION_FORTUNE_TITLE_SUPER_STRIKES = 100;
export const INVASION_FORTUNE_SUPER_STRIKE_CARDS = 3;
/** «Дозвіл на полювання»: −50% on every attack and autobattle against one boss while it lives. */
export const INVASION_HUNTING_PERMIT_DISCOUNT_PCT = 50;

const HOUR_MS = 3_600_000;

/** Bosses after which the next one appears only after a 15-minute pause. */
export function getInvasionPauseAfterBoss(bossNumber: number) {
  return bossNumber === 4 || bossNumber === 12 || (bossNumber >= 16 && bossNumber <= 23) ? INVASION_BOSS_PAUSE_MS : 0;
}

/** A new invasion starts on the next even hour (UTC) after the previous one ended. */
export function getNextInvasionStart(afterMs: number) {
  const twoHours = 2 * HOUR_MS;
  return Math.floor(afterMs / twoHours) * twoHours + twoHours;
}

export interface InvasionAttackTier {
  breakHours: number;
  gold: number;
  autoGold: number;
}

/** Break before attack N on one boss and its full prices. */
export function getInvasionAttackTier(attackNumber: number): InvasionAttackTier {
  if (!Number.isSafeInteger(attackNumber) || attackNumber < 1) throw new RangeError("Attack number must be a positive integer");
  if (attackNumber === 1) return { breakHours: 0, gold: 0, autoGold: 10 };
  if (attackNumber <= 3) return { breakHours: 1, gold: 5, autoGold: 10 };
  if (attackNumber <= 6) return { breakHours: 2, gold: 10, autoGold: 20 };
  if (attackNumber <= 10) return { breakHours: 4, gold: 20, autoGold: 40 };
  if (attackNumber <= 15) return { breakHours: 4, gold: 50, autoGold: 100 };
  if (attackNumber <= 25) return { breakHours: 4, gold: 100, autoGold: 150 };
  if (attackNumber <= 45) return { breakHours: 4, gold: 100, autoGold: 300 };
  return { breakHours: 4, gold: 100, autoGold: 500 };
}

export interface InvasionAttackQuote {
  /** Attack number this quote is for (attacks already made + 1). */
  attackNumber: number;
  /** When a free manual attack becomes available (ms), or null when it already is. */
  readyAt: number | null;
  /** Gold for a manual attack now (0 when free). */
  gold: number;
  /** Gold for an autobattle now. */
  autoGold: number;
}

/**
 * The break counts from the moment of the previous attack. Paying during the break costs the
 * full price times the remaining share of the break. Autobattle outside a break costs its full price.
 */
export function quoteInvasionAttack(input: { attacksMade: number; lastAttackAt: number | null; now: number; huntingPermit?: boolean }): InvasionAttackQuote {
  const quote = quoteInvasionAttackFull(input);
  if (!input.huntingPermit) return quote;
  const discount = (price: number) => price === 0 ? 0 : Math.max(1, Math.ceil(price * (100 - INVASION_HUNTING_PERMIT_DISCOUNT_PCT) / 100));
  return { ...quote, gold: discount(quote.gold), autoGold: discount(quote.autoGold) };
}

function quoteInvasionAttackFull(input: { attacksMade: number; lastAttackAt: number | null; now: number }): InvasionAttackQuote {
  const attackNumber = input.attacksMade + 1;
  const tier = getInvasionAttackTier(attackNumber);
  const breakMs = tier.breakHours * HOUR_MS;
  const readyAtMs = input.lastAttackAt === null ? input.now : input.lastAttackAt + breakMs;
  const remaining = Math.max(0, readyAtMs - input.now);
  if (remaining === 0 || breakMs === 0) {
    return { attackNumber, readyAt: null, gold: 0, autoGold: tier.autoGold };
  }
  const share = remaining / breakMs;
  return {
    attackNumber,
    readyAt: readyAtMs,
    gold: Math.max(1, Math.ceil(tier.gold * share)),
    autoGold: Math.max(1, Math.ceil(tier.autoGold * share)),
  };
}

export function getInvasionCycleIndex(startedAt: number, now: number) {
  return Math.max(0, Math.floor((now - startedAt) / INVASION_CYCLE_MS));
}

export interface InvasionPlayerSlot {
  card: DuelCardSnapshot;
  /** The slot can strike once the battle reaches this cycle. */
  readyCycle: number;
}

export interface InvasionBattleState {
  startedAt: number;
  playerHp: number;
  playerMaxHp: number;
  playerSlots: InvasionPlayerSlot[];
  playerQueue: DuelCardSnapshot[];
  bossSlots: DuelCardSnapshot[];
  bossQueue: DuelCardSnapshot[];
  damageDealt: number;
  superStrikes: number;
  turnNumber: number;
}

export interface InvasionModifiers {
  /** Added to every outgoing hit, % (collections, titles). */
  battleDamagePct: number;
  elementDamagePct: Readonly<Partial<Record<CardElement, number>>>;
  strikeMultiplierBonus?: DuelBattleModifiers["strikeMultiplierBonus"];
}

export interface InvasionStrike {
  slotIndex: 0 | 1 | 2;
  turnNumber: number;
  playerCard: DuelCardSnapshot;
  bossCard: DuelCardSnapshot;
  playerDamage: number;
  playerMultiplier: number;
  bossDamage: number;
  bossMultiplier: number;
  superStrike: boolean;
}

export function createInvasionBattle(input: {
  startedAt: number;
  playerHp: number;
  playerCards: readonly DuelCardSnapshot[];
  bossCards: readonly DuelCardSnapshot[];
}): InvasionBattleState {
  if (input.playerCards.length < INVASION_SLOT_COUNT) throw new RangeError("Invasion needs at least 3 player cards");
  if (input.bossCards.length < INVASION_SLOT_COUNT) throw new RangeError("Invasion needs at least 3 boss cards");
  return {
    startedAt: input.startedAt,
    playerHp: input.playerHp,
    playerMaxHp: input.playerHp,
    playerSlots: input.playerCards.slice(0, INVASION_SLOT_COUNT).map((card) => ({ card, readyCycle: 0 })),
    playerQueue: input.playerCards.slice(INVASION_SLOT_COUNT),
    bossSlots: input.bossCards.slice(0, INVASION_SLOT_COUNT),
    bossQueue: input.bossCards.slice(INVASION_SLOT_COUNT),
    damageDealt: 0,
    superStrikes: 0,
    turnNumber: 0,
  };
}

export function canInvasionSlotStrike(state: InvasionBattleState, slotIndex: number, now: number) {
  const slot = state.playerSlots[slotIndex];
  return Boolean(slot) && state.playerHp > 0 && getInvasionCycleIndex(state.startedAt, now) >= slot!.readyCycle;
}

/**
 * One strike: the player card hits the boss card in the same slot, which hits back.
 * A super strike deals ×10 regardless of elements and the counter is halved.
 * `bossHealthLeft` caps the counted damage at the boss's remaining health.
 * The used card goes to the end of the queue and its slot refills on the next cycle.
 */
export function resolveInvasionStrike(input: {
  state: InvasionBattleState;
  slotIndex: 0 | 1 | 2;
  now: number;
  modifiers: InvasionModifiers;
  bossHealthLeft: number;
  random: RandomSource;
}): { state: InvasionBattleState; strike: InvasionStrike; countedDamage: number } {
  const { state, slotIndex } = input;
  if (!canInvasionSlotStrike(state, slotIndex, input.now)) throw new RangeError("This slot is not ready");
  const slot = state.playerSlots[slotIndex]!;
  const bossCard = state.bossSlots[slotIndex]!;
  const superStrike = input.random() < INVASION_SUPER_STRIKE_CHANCE;
  const elementPct = input.modifiers.elementDamagePct[slot.card.element] ?? 0;
  const normal = calculateDuelDamage({
    attackerElement: slot.card.element,
    attackerElementDamagePct: elementPct,
    attackerFinalPower: slot.card.finalPower,
    battleDamagePct: input.modifiers.battleDamagePct,
    defenderElement: bossCard.element,
  });
  const playerDamage = superStrike
    ? Math.round(slot.card.finalPower * (1 + (input.modifiers.battleDamagePct + elementPct) / 100) * INVASION_SUPER_STRIKE_MULTIPLIER)
    : normal.damage;
  const bossMultiplier = getElementMultiplier(bossCard.element, slot.card.element);
  const bossDamage = Math.round(bossCard.finalPower * bossMultiplier * (superStrike ? INVASION_SUPER_STRIKE_COUNTER_MULTIPLIER : 1));
  const countedDamage = Math.min(playerDamage, Math.max(0, input.bossHealthLeft));
  const cycle = getInvasionCycleIndex(state.startedAt, input.now);

  const playerQueue = [...state.playerQueue];
  const nextPlayerCard = playerQueue.shift();
  const playerSlots = state.playerSlots.map((current, index) => index !== slotIndex ? current : {
    card: nextPlayerCard ?? current.card,
    readyCycle: cycle + 1,
  });
  if (nextPlayerCard) playerQueue.push(slot.card);
  const bossQueue = [...state.bossQueue];
  const nextBossCard = bossQueue.shift();
  const bossSlots = state.bossSlots.map((card, index) => index === slotIndex && nextBossCard ? nextBossCard : card);
  if (nextBossCard) bossQueue.push(bossCard);

  const turnNumber = state.turnNumber + 1;
  return {
    countedDamage,
    state: {
      ...state,
      playerHp: Math.max(0, state.playerHp - bossDamage),
      playerSlots,
      playerQueue,
      bossSlots,
      bossQueue,
      damageDealt: state.damageDealt + countedDamage,
      superStrikes: state.superStrikes + (superStrike ? 1 : 0),
      turnNumber,
    },
    strike: {
      slotIndex,
      turnNumber,
      playerCard: slot.card,
      bossCard,
      playerDamage: countedDamage,
      playerMultiplier: superStrike ? INVASION_SUPER_STRIKE_MULTIPLIER : normal.multiplier,
      bossDamage,
      bossMultiplier: bossMultiplier * (superStrike ? INVASION_SUPER_STRIKE_COUNTER_MULTIPLIER : 1),
      superStrike,
    },
  };
}

/**
 * "Змінити карти": the three slot cards go to the end of the queue and the next three come in.
 * Each slot keeps its readiness, so a swap never grants an extra strike within the same cycle.
 */
export function swapInvasionCards(state: InvasionBattleState, _now?: number): InvasionBattleState {
  if (state.playerQueue.length === 0) return state;
  const pool = [...state.playerQueue, ...state.playerSlots.map((slot) => slot.card)];
  const incoming = pool.splice(0, INVASION_SLOT_COUNT);
  return {
    ...state,
    playerSlots: incoming.map((card, index) => ({ card, readyCycle: state.playerSlots[index]!.readyCycle })),
    playerQueue: pool,
  };
}

/**
 * Autobattle: the whole fight resolves at once, each cycle striking with every slot,
 * strongest expected hit first, until the player falls or the boss dies.
 */
export function runInvasionAutobattle(input: {
  state: InvasionBattleState;
  modifiers: InvasionModifiers;
  bossHealthLeft: number;
  random: RandomSource;
  maxStrikes?: number;
}) {
  let state = input.state;
  let bossHealthLeft = input.bossHealthLeft;
  const strikes: InvasionStrike[] = [];
  const limit = input.maxStrikes ?? 5_000;
  let virtualNow = state.startedAt;
  while (state.playerHp > 0 && bossHealthLeft > 0 && strikes.length < limit) {
    const ready = state.playerSlots
      .map((slot, index) => ({ index: index as 0 | 1 | 2, slot }))
      .filter(({ index }) => canInvasionSlotStrike(state, index, virtualNow))
      .sort((a, b) => expectedDamage(b.slot.card, state.bossSlots[b.index]!) - expectedDamage(a.slot.card, state.bossSlots[a.index]!));
    if (ready.length === 0) {
      virtualNow += INVASION_CYCLE_MS;
      continue;
    }
    const result = resolveInvasionStrike({
      state, slotIndex: ready[0]!.index, now: virtualNow, modifiers: input.modifiers, bossHealthLeft, random: input.random,
    });
    state = result.state;
    bossHealthLeft -= result.countedDamage;
    strikes.push(result.strike);
  }
  return { state, strikes, bossHealthLeft };
}

function expectedDamage(card: DuelCardSnapshot, bossCard: DuelCardSnapshot) {
  return card.finalPower * getElementMultiplier(card.element, bossCard.element);
}

/** Experience for an attack: half the damage, before experience bonuses. */
export function getInvasionAttackXp(damage: number) {
  return Math.floor(Math.max(0, damage) / 2);
}

/** Base silver for an attack: damage / deck power × K, before silver bonuses. */
export function getInvasionAttackSilver(damage: number, deckPower: number, bossNumber: number) {
  if (deckPower <= 0 || damage <= 0) return 0;
  return Math.floor((damage / deckPower) * getInvasionBoss(bossNumber).silverK);
}

/** Collection and title bonus applied to card power and HP. */
export function getInvasionPowerPct(input: { hasMechanists: boolean; firstPlaces: number }) {
  return (input.hasMechanists ? INVASION_MECHANISTS_PCT : 0)
    + (input.firstPlaces >= INVASION_CHAMPION_FIRST_PLACES ? INVASION_CHAMPION_PCT : 0);
}

export interface InvasionBossDeckCardSeed {
  cardId: string;
  collection: InvasionCollectionCode;
  element: CardElement;
  finalPower: number;
}

/** Nine random cards from the boss's collections, power within the collection range, random elements. */
export function rollInvasionBossDeck(
  boss: InvasionBossDefinition,
  cardsByCollection: Readonly<Record<InvasionCollectionCode, readonly string[]>>,
  elements: readonly CardElement[],
  random: RandomSource,
): InvasionBossDeckCardSeed[] {
  const pick = <T,>(items: readonly T[]) => items[Math.min(items.length - 1, Math.floor(random() * items.length))]!;
  return Array.from({ length: INVASION_BOSS_DECK_SIZE }, () => {
    const collection = pick(boss.collections);
    const [min, max] = INVASION_COLLECTION_POWER[collection];
    return {
      cardId: pick(cardsByCollection[collection]),
      collection,
      element: pick(elements),
      finalPower: min + Math.floor(random() * (max - min + 1)),
    };
  });
}

export interface InvasionDamageRow {
  playerId: string;
  damage: number;
  superStrikes: number;
}

export type InvasionPrizeKind = "first_place" | "damage" | "super_strike";

export interface InvasionPrize {
  playerId: string;
  kind: InvasionPrizeKind;
  /** Fixed level for first place and damage prizes; random 54–74 for super strikes. */
  level: number;
  /** Fixed bonus for first place and damage; null means the standard random bonus. */
  bonusPower: number | null;
}

/**
 * Prizes when a boss dies: first place by damage; `bossNumber` random players from places 2–200
 * (weight 1/√place, level of a random boss 1…current); one card to everyone who landed a super strike.
 */
export function resolveInvasionPrizes(
  bossNumber: number,
  rows: readonly InvasionDamageRow[],
  random: RandomSource,
  /** Players with «Улюбленець фортуни» get three super-strike cards instead of one. */
  fortunePlayerIds: ReadonlySet<string> = new Set(),
): InvasionPrize[] {
  const ranked = [...rows].filter((row) => row.damage > 0).sort((a, b) => b.damage - a.damage);
  const prizes: InvasionPrize[] = [];
  const boss = getInvasionBoss(bossNumber);
  if (ranked[0]) prizes.push({ playerId: ranked[0].playerId, kind: "first_place", level: boss.prizeLevel, bonusPower: INVASION_PRIZE_BONUS_POWER });
  const pool = ranked.slice(1, INVASION_RANDOM_PRIZE_MAX_PLACE).map((row, index) => ({ row, weight: 1 / Math.sqrt(index + 2) }));
  for (let picked = 0; picked < bossNumber && pool.length > 0; picked += 1) {
    const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = random() * total;
    let chosen = pool.length - 1;
    for (let index = 0; index < pool.length; index += 1) {
      roll -= pool[index]!.weight;
      if (roll < 0) { chosen = index; break; }
    }
    const [entry] = pool.splice(chosen, 1);
    const prizeBoss = getInvasionBoss(1 + Math.floor(random() * bossNumber));
    prizes.push({ playerId: entry!.row.playerId, kind: "damage", level: prizeBoss.prizeLevel, bonusPower: INVASION_PRIZE_BONUS_POWER });
  }
  const [minLevel, maxLevel] = INVASION_SUPER_STRIKE_CARD_LEVEL;
  for (const row of ranked) {
    if (row.superStrikes <= 0) continue;
    const cards = fortunePlayerIds.has(row.playerId) ? INVASION_FORTUNE_SUPER_STRIKE_CARDS : 1;
    for (let index = 0; index < cards; index += 1) {
      prizes.push({ playerId: row.playerId, kind: "super_strike", level: minLevel + Math.floor(random() * (maxLevel - minLevel + 1)), bonusPower: null });
    }
  }
  return prizes;
}

export interface InvasionStanding {
  place: number;
  damage: number;
  ahead: { place: number; gap: number } | null;
  behind: { place: number; gap: number } | null;
}

/**
 * The player's place on this boss, the gap to the nearest player ahead who is at least
 * `stepDamage` (≈ one strike of the strongest card in hand) away, and the gap to the next player behind.
 */
export function getInvasionStanding(damages: readonly number[], playerDamage: number, stepDamage: number): InvasionStanding | null {
  if (playerDamage <= 0) return null;
  const sorted = [...damages].sort((a, b) => b - a);
  const place = sorted.filter((damage) => damage > playerDamage).length + 1;
  const step = Math.max(1, stepDamage);
  let ahead: InvasionStanding["ahead"] = null;
  for (let index = place - 2; index >= 0; index -= 1) {
    if (sorted[index]! - playerDamage >= step) { ahead = { place: index + 1, gap: sorted[index]! - playerDamage }; break; }
  }
  let behind: InvasionStanding["behind"] = null;
  // The reference shows the very next player behind ("Від 367: 170" for place 366).
  const nextIndex = sorted.findIndex((damage) => damage < playerDamage);
  if (nextIndex >= 0) behind = { place: nextIndex + 1, gap: playerDamage - sorted[nextIndex]! };
  return { place, damage: playerDamage, ahead, behind };
}

/**
 * Diamonds for one attack: 2 while the player is under the daily norm (8, or 16 with «Шукачі скарбів»),
 * plus a random 1–5 bonus above the norm. Only the norm part counts toward the daily limit.
 */
export function getInvasionAttackDiamonds(input: { normDiamondsToday: number; hasTreasureHunters: boolean; random: RandomSource }) {
  const dailyNorm = INVASION_DAILY_DIAMONDS * (input.hasTreasureHunters ? 2 : 1);
  const norm = Math.max(0, Math.min(INVASION_DIAMONDS_PER_ATTACK, dailyNorm - Math.max(0, input.normDiamondsToday)));
  const [minBonus, maxBonus] = INVASION_BONUS_DIAMONDS;
  const bonus = input.random() < INVASION_BONUS_DIAMOND_CHANCE ? minBonus + Math.floor(input.random() * (maxBonus - minBonus + 1)) : 0;
  return { norm, bonus, total: norm + bonus };
}

export function hasInvasionFortuneTitle(totalSuperStrikes: number) {
  return totalSuperStrikes >= INVASION_FORTUNE_TITLE_SUPER_STRIKES;
}
