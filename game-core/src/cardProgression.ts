import type { CardRarity } from "@cardastika/shared";

export const MIN_CARD_LEVEL = 1;
export const MAX_CARD_LEVEL = 180;

export interface CardPowerInput {
  bonusPower: number;
  level: number;
}

export interface IntegerRandomSource {
  nextInt(maxExclusive: number): number;
}

export interface CardRarityLevelRange {
  maximumLevel: number;
  minimumLevel: number;
  rarity: CardRarity;
}

export const CARD_RARITY_LEVEL_RANGES: readonly Readonly<CardRarityLevelRange>[] = Object.freeze([
  Object.freeze({ rarity: "common", minimumLevel: 1, maximumLevel: 4 }),
  Object.freeze({ rarity: "uncommon", minimumLevel: 5, maximumLevel: 9 }),
  Object.freeze({ rarity: "rare", minimumLevel: 10, maximumLevel: 19 }),
  Object.freeze({ rarity: "epic", minimumLevel: 20, maximumLevel: 34 }),
  Object.freeze({ rarity: "legendary", minimumLevel: 35, maximumLevel: 59 }),
  Object.freeze({ rarity: "mythic", minimumLevel: 60, maximumLevel: 180 }),
]);

// Index zero intentionally corresponds to level 1. This is canonical game data,
// not a curve: every entry must remain explicit and regression-tested.
export const BASE_POWER_BY_LEVEL: readonly number[] = Object.freeze([
  10, 20, 30, 40,
  70, 80, 90, 100, 110,
  170, 190, 210, 230, 250, 310, 330, 350, 370, 390,
  500, 530, 560, 590, 620, 730, 760, 790, 820, 850, 960, 990, 1020, 1050, 1080,
  1240, 1280, 1320, 1360, 1400, 1560, 1600, 1640, 1680, 1720,
  1880, 1920, 1960, 2000, 2040, 2200, 2240, 2280, 2320, 2360,
  2520, 2560, 2600, 2640, 2680,
  2930, 2980, 3030, 3080, 3130, 3430, 3480, 3530, 3580, 3630,
  3980, 4030, 4080, 4130, 4180, 4580, 4630, 4680, 4730, 4780,
  5230, 5280, 5330, 5380, 5430, 5980, 6030, 6080, 6130, 6180,
  6260, 6350, 6450, 6560, 6680, 6830, 6880, 6940, 7010, 7090,
  7180, 7280, 7390, 7510, 7660, 7860, 7910, 7960, 8020, 8080,
  8150, 8220, 8300, 8380, 8470, 8570, 8680, 8800, 8940, 9100, 9320,
  9360, 9420, 9500, 9600, 9740, 9790, 9860, 9950, 10060, 10210,
  10270, 10350, 10450, 10570, 10730, 10800, 10890, 11000, 11130, 11300,
  11380, 11480, 11600, 11740, 11920, 12020, 12140, 12280, 12440, 12640,
  12720, 12820, 12940, 13080, 13260, 13360, 13480, 13620, 13780, 13980,
  14060, 14160, 14280, 14420, 14600, 14700, 14820, 14960, 15120, 15320,
  15400, 15500, 15620, 15760, 15940, 16040, 16160, 16300, 16460, 16660,
]);

function assertCardLevel(level: number) {
  if (!Number.isSafeInteger(level) || level < MIN_CARD_LEVEL || level > MAX_CARD_LEVEL) {
    throw new RangeError(`Card level must be an integer from ${MIN_CARD_LEVEL} to ${MAX_CARD_LEVEL}`);
  }
}

function assertBonusPower(bonusPower: number) {
  if (!Number.isSafeInteger(bonusPower) || bonusPower < 0) {
    throw new RangeError("Card bonus power must be a non-negative integer");
  }
}

export function getRarityLevelRange(rarity: CardRarity) {
  const range = CARD_RARITY_LEVEL_RANGES.find((candidate) => candidate.rarity === rarity);
  if (!range) throw new RangeError(`Unknown card rarity: ${rarity}`);
  return range;
}

export function getRarityForLevel(level: number): CardRarity {
  assertCardLevel(level);
  const range = CARD_RARITY_LEVEL_RANGES.find((candidate) => level <= candidate.maximumLevel);
  if (!range) throw new RangeError(`No rarity configured for card level ${level}`);
  return range.rarity;
}

export function getBasePowerForLevel(level: number) {
  assertCardLevel(level);
  const power = BASE_POWER_BY_LEVEL[level - 1];
  if (power === undefined) throw new RangeError(`No base power configured for card level ${level}`);
  return power;
}

export function getCardPower(instance: CardPowerInput) {
  assertBonusPower(instance.bonusPower);
  const finalPower = getBasePowerForLevel(instance.level) + instance.bonusPower;
  if (!Number.isSafeInteger(finalPower)) throw new RangeError("Final card power is not a safe integer");
  return finalPower;
}

export function generateStandardBonusPower(basePower: number, rng: IntegerRandomSource) {
  if (!Number.isSafeInteger(basePower) || basePower <= 0) {
    throw new RangeError("Base power must be a positive integer");
  }
  const maximumBonus = Math.floor(basePower / 5);
  const bonusPower = rng.nextInt(maximumBonus + 1);
  if (!Number.isSafeInteger(bonusPower) || bonusPower < 0 || bonusPower > maximumBonus) {
    throw new RangeError("Random source returned an invalid standard card bonus");
  }
  return bonusPower;
}

export type GeneratedLevelPolicy = (
  rarity: CardRarity,
  rng: IntegerRandomSource,
) => number;

export function selectGeneratedLevelForRarity(
  rarity: CardRarity,
  rng: IntegerRandomSource,
  policy: GeneratedLevelPolicy,
) {
  const level = policy(rarity, rng);
  assertCardLevel(level);
  if (getRarityForLevel(level) !== rarity) {
    throw new RangeError(`Generated level ${level} does not belong to ${rarity}`);
  }
  return level;
}
