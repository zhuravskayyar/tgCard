import { getBasePowerForLevel } from "./cardProgression.js";

/**
 * Guardian dragon from the reference manual (`docs/reference-elem-guardian-dragon.md`).
 * Numbers marked "reference" are copied 1:1; the ones marked "unverified" are not in the manual.
 */

/** Reference: a dragon never grows past 17 600 health. */
export const GUARDIAN_DRAGON_MAX_HEALTH = 17_600;
/** Reference: a reborn dragon outside the monthly top 100 starts with 45 mastery. */
export const GUARDIAN_DRAGON_START_MASTERY = 45;
/** Reference: the top 100 of the monthly dragon rating keep their mastery. */
export const GUARDIAN_DRAGON_KEEP_MASTERY_TOP = 100;

/** Reference: hike length → health gain. */
export const GUARDIAN_DRAGON_HIKES = Object.freeze([
  Object.freeze({ hours: 2, health: 80 }),
  Object.freeze({ hours: 4, health: 160 }),
  Object.freeze({ hours: 8, health: 320 }),
] as const);
export type GuardianDragonHikeHours = (typeof GUARDIAN_DRAGON_HIKES)[number]["hours"];

/** Reference: the progress scale ends at the longest hike, 8 hours. */
export const GUARDIAN_DRAGON_PROGRESS_MAX_MINUTES = 8 * 60;

/**
 * Unverified: the reference shows "< 1 h" for cards up to 1444 power and no formula.
 * One minute of progress per 100 power (at least one minute per card) until a feed is measured.
 */
export const GUARDIAN_DRAGON_FEED_POWER_PER_MINUTE = 100;

/** Reference: gold bought for the daily task counts as an instant hike. */
export const GUARDIAN_DRAGON_GOLD_TASK_REWARDS = Object.freeze([
  Object.freeze({ gold: 200, health: 80 }),
  Object.freeze({ gold: 1000, health: 320 }),
] as const);

/** Reference: free dragon fights reopen every 10 hours. */
export const GUARDIAN_DRAGON_FREE_FIGHTS_COOLDOWN_HOURS = 10;
/** Reference: 10 free fights at 0 health, 220 at 17 600. */
export const GUARDIAN_DRAGON_FREE_FIGHTS_MIN = 10;
export const GUARDIAN_DRAGON_FREE_FIGHTS_MAX = 220;
/** Reference: every paid send is 100 fights. */
export const GUARDIAN_DRAGON_PAID_FIGHTS_PER_SEND = 100;
/** Reference: price of the 1st…30th paid send within one 10-hour cooldown. */
export const GUARDIAN_DRAGON_PAID_SEND_PRICES = Object.freeze([
  10, 10, 10, 20, 20, 20, 40, 40, 40, 40,
  100, 100, 100, 100, 100,
  300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300,
] as const);

/** Reference: game images `pet_dragon_1…5` — an egg and four grown looks. */
export const GUARDIAN_DRAGON_STAGE_COUNT = 5;
/** Unverified: stage health floors. The egg is a dragon without health; the rest split the cap in quarters. */
export const GUARDIAN_DRAGON_STAGE_MIN_HEALTH = Object.freeze([0, 1, 4_400, 8_800, 13_200] as const);

function assertWhole(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${field} must be a non-negative whole number`);
}

export function isGuardianDragonHikeHours(value: unknown): value is GuardianDragonHikeHours {
  return GUARDIAN_DRAGON_HIKES.some((hike) => hike.hours === value);
}

export function getGuardianDragonHike(hours: GuardianDragonHikeHours) {
  const hike = GUARDIAN_DRAGON_HIKES.find((entry) => entry.hours === hours);
  if (!hike) throw new RangeError("Unknown hike length");
  return { hours: hike.hours, health: hike.health, minutes: hike.hours * 60 };
}

/** Health after a gain, never past the cap. */
export function addGuardianDragonHealth(health: number, gain: number) {
  assertWhole(health, "Dragon health");
  assertWhole(gain, "Health gain");
  return Math.min(GUARDIAN_DRAGON_MAX_HEALTH, health + gain);
}

/** Minutes of progress one fed card gives. */
export function getGuardianDragonFeedMinutes(cardPower: number) {
  assertWhole(cardPower, "Card power");
  return Math.max(1, Math.floor(cardPower / GUARDIAN_DRAGON_FEED_POWER_PER_MINUTE));
}

/**
 * Picks cards to feed in the given order until the progress scale is full.
 * A card that would overflow the scale is still eaten when the scale has room: the rest is lost.
 */
export function selectGuardianDragonFeed<T extends { power: number }>(progressMinutes: number, cards: readonly T[]) {
  assertWhole(progressMinutes, "Progress");
  const chosen: T[] = [];
  let progress = Math.min(progressMinutes, GUARDIAN_DRAGON_PROGRESS_MAX_MINUTES);
  for (const card of cards) {
    if (progress >= GUARDIAN_DRAGON_PROGRESS_MAX_MINUTES) break;
    chosen.push(card);
    progress = Math.min(GUARDIAN_DRAGON_PROGRESS_MAX_MINUTES, progress + getGuardianDragonFeedMinutes(card.power));
  }
  return { cards: chosen, progressMinutes: progress };
}

/** Reference: no hike while another runs; the chosen hike needs that much progress. */
export function canStartGuardianDragonHike(progressMinutes: number, hours: GuardianDragonHikeHours, hikeRunning: boolean) {
  return !hikeRunning && progressMinutes >= getGuardianDragonHike(hours).minutes;
}

/**
 * Free fights for the dragon's health: 10 at 0 and 220 at 17 600 (manual). The reference page shows
 * 10 at 320 health, so the count grows in steps; we use ten steps of +21 per 1 760 health.
 */
export function getGuardianDragonFreeFights(health: number) {
  assertWhole(health, "Dragon health");
  const capped = Math.min(health, GUARDIAN_DRAGON_MAX_HEALTH);
  const steps = Math.floor(capped / (GUARDIAN_DRAGON_MAX_HEALTH / 10));
  return GUARDIAN_DRAGON_FREE_FIGHTS_MIN + steps * (GUARDIAN_DRAGON_FREE_FIGHTS_MAX - GUARDIAN_DRAGON_FREE_FIGHTS_MIN) / 10;
}

/** Free fights reopen once the 10-hour cooldown is over; until then sends cost gold. */
export function isGuardianDragonFreeSendReady(cooldownUntil: Date | null, now: Date) {
  return !cooldownUntil || cooldownUntil.getTime() <= now.getTime();
}

/**
 * Unverified fight numbers, calibrated on one reference sample (10 fights: mastery 45 → 50, rating 0 → 54).
 * Mastery is kept in tenths so half a point per fight is exact.
 */
export const GUARDIAN_DRAGON_MASTERY_TENTHS_PER_FIGHT = 5;
export const GUARDIAN_DRAGON_RATING_PER_WIN = 11;
/** Opponents are dragons of similar mastery: ±15 %. */
export const GUARDIAN_DRAGON_OPPONENT_SPREAD = 0.15;

/**
 * Plays `fights` dragon fights. "The higher the mastery, the more often it wins" (reference):
 * the chance is mastery / (mastery + opponent), and every fight adds mastery.
 */
export function resolveGuardianDragonFights(fights: number, masteryTenths: number, random: () => number = Math.random) {
  assertWhole(fights, "Fights");
  assertWhole(masteryTenths, "Mastery");
  let tenths = masteryTenths;
  let wins = 0;
  for (let index = 0; index < fights; index += 1) {
    const mastery = tenths / 10;
    const opponent = mastery * (1 - GUARDIAN_DRAGON_OPPONENT_SPREAD + random() * 2 * GUARDIAN_DRAGON_OPPONENT_SPREAD);
    if (random() < mastery / (mastery + opponent)) wins += 1;
    tenths += GUARDIAN_DRAGON_MASTERY_TENTHS_PER_FIGHT;
  }
  return { fights, wins, masteryTenths: tenths, ratingGain: wins * GUARDIAN_DRAGON_RATING_PER_WIN };
}

/** Price of the next paid send; the 30th price holds for every later send. */
export function getGuardianDragonPaidSendPrice(sendsThisCooldown: number) {
  assertWhole(sendsThisCooldown, "Paid sends");
  const prices = GUARDIAN_DRAGON_PAID_SEND_PRICES;
  return prices[Math.min(sendsThisCooldown, prices.length - 1)]!;
}

/**
 * «Dragon flame»: card base power × mastery / 100. «Dragon fans» add 10 mastery first, then
 * «Dragon whisperers» double the damage (manual example). The manual names the 9th deck card, but the
 * live game shows the flame as its own card: level 90, 3130 at mastery 50 = base power of level 90 × 50 / 100.
 */
export function getGuardianDragonFlameDamage(cardBasePower: number, mastery: number, collections: { dragonFans?: boolean; dragonWhisperers?: boolean } = {}) {
  const ninthCardPower = cardBasePower;
  assertWhole(ninthCardPower, "Card power");
  assertWhole(mastery, "Mastery");
  const effectiveMastery = mastery + (collections.dragonFans ? 10 : 0);
  const damage = Math.floor(ninthCardPower * effectiveMastery / 100);
  return collections.dragonWhisperers ? damage * 2 : damage;
}

/** Observed on the reference flame card; where the level comes from is not documented. */
export const GUARDIAN_DRAGON_FLAME_START_LEVEL = 90;

/** The flame card's power at its level: the base power of an ordinary card of that level × mastery / 100. */
export function getGuardianDragonFlamePower(level: number, mastery: number, collections: { dragonFans?: boolean; dragonWhisperers?: boolean } = {}) {
  return getGuardianDragonFlameDamage(getBasePowerForLevel(level), mastery, collections);
}

/** Index 0…4 of the dragon's look. */
export function getGuardianDragonStage(health: number) {
  assertWhole(health, "Dragon health");
  let stage = 0;
  GUARDIAN_DRAGON_STAGE_MIN_HEALTH.forEach((floor, index) => { if (health >= floor) stage = index; });
  return stage;
}

/** The month a dragon belongs to, as `YYYY-MM` in UTC. */
export function getGuardianDragonMonthKey(now: Date) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Reference: rebirth keeps mastery only for the top 100 of the last month's rating. */
export function getGuardianDragonRebirthMastery(mastery: number, ratingPlace: number | null) {
  assertWhole(mastery, "Mastery");
  return ratingPlace !== null && ratingPlace >= 1 && ratingPlace <= GUARDIAN_DRAGON_KEEP_MASTERY_TOP
    ? mastery
    : GUARDIAN_DRAGON_START_MASTERY;
}
