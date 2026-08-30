import type { CardRarity } from "@cardastika/shared";

export const MIN_CARD_LEVEL = 1;
export const MAX_CARD_LEVEL = 180;
export const MINIMUM_TRANSFERABLE_ELEMENT_VALUE = 1;

export interface CardLevelTableEntry {
  basePower: number;
  elementValue: number | null;
  goldUpgradeCost: number | null;
  level: number;
  minimumGoldCost: number | null;
  powerIncrease: number | null;
}

export interface CardProgressionState {
  level: number;
  levelProgressElements: number;
  storedElements: number;
}

export type UpgradeAvailability =
  | "ready"
  | "insufficient_elements"
  | "insufficient_gold"
  | "maximum_level"
  | "unsupported_level_data";

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

// Source-table values are kept in their native units, including hundredths for
// the first levels. The database stores the same two-decimal precision.
const ELEMENT_VALUE_BY_LEVEL: readonly (number | null)[] = Object.freeze([
  0.02, 0.04, 0.08, 0.14, 0.2, 0.32, 0.44, 0.56, 0.68, 0.8,
  1.04, 1.28, 1.52, 1.76, 2, 2.4, 2.8, 3.2, 3.6, 4,
  4.8, 5.6, 6.4, 7.2, 8, 9.6, 11.2, 12.8, 14.4, 16,
  20, 24, 28, 32, 36, 44, 52, 60, 68, 75,
  90, 105, 120, 135, 150, 180, 210, 240, 270, 300,
  360, 420, 480, 540, 600, 760, 920, 1080, 1240, 1400,
  2000, 2600, 3200, 3800, 4400, 5800, 7200, 8600, 10000, 12000,
  15000, 18000, 21000, 24000, 27000, 34000, 41000, 48000, 55000, 62000,
  80000, 98000, 116000, 134000, 150000, 194000, 238000, 282000, 326000, 331000,
  337000, 344000, 352000, 361000, 370000, 380000, 400000, 440000, 490000, 550000,
  610000, 670000, 730000, 850000, 1000000, 1100000, 1200000, 1300000, 1400000, 1530000,
  1660000, 1800000, 1930000, 2060000, 2200000, 2330000, 2460000, 2600000, 2780000, 3000000,
  3200000, 3500000, 3900000, 4400000, 5100000, 5400000, 5820000, 6360000, 7020000, 7920000,
  8340000, 8900000, 9600000, 10440000, 11560000, 12120000, 12840000, 13720000, 14760000, 16120000,
  16920000, 17920000, 19120000, 20520000, 22320000, 24320000, 26720000, 29520000, 32720000, 36720000,
  null, 110160000, 220320000, 440640000, 881280000, 1762560000, 3525120000, 7050240000, 14100480000, 28200960000,
  56401920000, 112803840000, 225607680000, 451215360000, 902430720000, 1804861440000, 3609722880000, 7219445760000, null, null,
  null, null, null, null, null, null, null, null, null, null,
]);

const GOLD_UPGRADE_COST_BY_LEVEL: readonly (number | null)[] = Object.freeze([
  null, 1, 1, 1, 2, 1, 1, 1, 1, 2,
  1, 1, 1, 1, 4, 2, 2, 2, 2, 10,
  5, 5, 5, 5, 16, 8, 8, 8, 8, 20,
  10, 10, 10, 10, 30, 15, 15, 15, 15, 40,
  20, 20, 20, 20, 60, 30, 30, 30, 30, 100,
  50, 50, 50, 50, 200, 100, 100, 100, 100, 400,
  400, 400, 400, 400, 800, 800, 800, 800, 800, 1600,
  1600, 1600, 1600, 1600, 3200, 3200, 3200, 3200, 3200, 6400,
  6400, 6400, 6400, 6400, 12500, 12500, 12500, 12500, 12500, 3000,
  3400, 3800, 4200, 4800, 5800, 2500, 3000, 3500, 4000, 4500,
  5000, 5500, 6000, 7000, 9000, 3000, 3000, 4000, 4000, 4800,
  4800, 5600, 5600, 6000, 7000, 8000, 8400, 10000, 10800, 15000,
  4000, 6000, 8000, 10000, 14000, 6000, 8400, 10800, 13200, 18000,
  8400, 11200, 14000, 16800, 22400, 11200, 14400, 17600, 20800, 27200,
  14400, 18000, 21600, 25200, 32400, 20000, 24000, 28000, 32000, 36000,
  14400, 18000, 21600, 25200, 32400, 20000, 24000, 28000, 32000, 36000,
  14400, 18000, 21600, 25200, 32400, 20000, 24000, 28000, 32000, 36000,
  14400, 18000, 21600, 25200, 32400, 20000, 24000, 28000, 32000, 40000,
]);

const MINIMUM_GOLD_COST_BY_LEVEL: readonly (number | null)[] = Object.freeze([
  null, null, null, null, 1, null, null, null, null, 1,
  null, null, null, null, 2, null, null, null, null, 5,
  null, null, null, null, 8, null, null, null, null, 10,
  null, null, null, null, 15, null, null, null, null, 20,
  null, null, null, null, 30, null, null, null, null, 50,
  null, null, null, null, 100, null, null, null, null, 200,
  null, null, null, null, 400, null, null, null, null, 800,
  null, null, null, null, 1600, null, null, null, null, 3200,
  null, null, null, null, 6250, null, null, null, null, 1500,
  1700, 1900, 2100, 2400, 2900, 1250, 1500, 1750, 2000, 2250,
  2500, 2750, 3000, 3500, 4500, 1500, 1500, 2000, 2000, 2400,
  2400, 2800, 2800, 3000, 3500, 4000, 4200, 5000, 5400, 7500,
  2000, 3000, 4000, 5000, 7000, 3000, 4200, 5400, 6600, 9000,
  4200, 5600, 7000, 8400, 11200, 5600, 7200, 8800, 10400, 13600,
  7200, 9000, 10800, 12600, 16200, 10000, 12000, 14000, 16000, 18000,
  7200, 9000, 10800, 12600, 16200, 10000, 12000, 14000, 16000, 18000,
  7200, 9000, 10800, 12600, 16200, 10000, 12000, 14000, 16000, 18000,
  7200, 9000, 10800, 12600, 16200, 10000, 12000, 14000, 16000, 20000,
]);

export const CARD_LEVEL_TABLE: readonly Readonly<CardLevelTableEntry>[] = Object.freeze(
  BASE_POWER_BY_LEVEL.map((basePower, index) => {
    const level = index + 1;
    return Object.freeze({
      level,
      basePower,
      powerIncrease: index === 0 ? null : basePower - BASE_POWER_BY_LEVEL[index - 1]!,
      goldUpgradeCost: GOLD_UPGRADE_COST_BY_LEVEL[index] ?? null,
      minimumGoldCost: MINIMUM_GOLD_COST_BY_LEVEL[index] ?? null,
      elementValue: ELEMENT_VALUE_BY_LEVEL[index] ?? null,
    });
  }),
);

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

function assertProgressValue(value: number, field: string) {
  const rounded = Math.round(value * 100);
  if (
    !Number.isFinite(value)
    || value < 0
    || !Number.isSafeInteger(rounded)
    || Math.abs(value - rounded / 100) > 1e-9
  ) {
    throw new RangeError(`${field} must be a non-negative number with at most two decimal places`);
  }
}

function roundProgressValue(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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
  return getCardLevelTableEntry(level).basePower;
}

export function getCardLevelTableEntry(level: number) {
  assertCardLevel(level);
  const entry = CARD_LEVEL_TABLE[level - 1];
  if (!entry) throw new RangeError(`No canonical data configured for card level ${level}`);
  return entry;
}

export function isGoldLevel(targetLevel: number) {
  assertCardLevel(targetLevel);
  return targetLevel >= 90 || targetLevel % 5 === 0;
}

export function getElementValueForLevel(level: number) {
  return getCardLevelTableEntry(level).elementValue;
}

export function getRequiredProgressElements(level: number) {
  return getElementValueForLevel(level) ?? MINIMUM_TRANSFERABLE_ELEMENT_VALUE;
}

export function getTransferableElementValue(state: CardProgressionState) {
  assertProgressValue(state.levelProgressElements, "Level progress");
  assertProgressValue(state.storedElements, "Stored elements");
  const nativeValue = getElementValueForLevel(state.level) ?? MINIMUM_TRANSFERABLE_ELEMENT_VALUE;
  return roundProgressValue(nativeValue + state.levelProgressElements + state.storedElements);
}

export function applyElementalPotential(
  state: CardProgressionState,
  addedElements: number,
): Pick<CardProgressionState, "levelProgressElements" | "storedElements"> {
  assertCardLevel(state.level);
  assertProgressValue(state.levelProgressElements, "Level progress");
  assertProgressValue(state.storedElements, "Stored elements");
  assertProgressValue(addedElements, "Added elements");

  if (state.level === MAX_CARD_LEVEL) {
    return {
      levelProgressElements: 0,
      storedElements: state.levelProgressElements + state.storedElements + addedElements,
    };
  }

  const total = roundProgressValue(state.levelProgressElements + state.storedElements + addedElements);
  const requiredElements = getRequiredProgressElements(state.level);
  return {
    levelProgressElements: Math.min(requiredElements, total),
    storedElements: roundProgressValue(Math.max(0, total - requiredElements)),
  };
}

export function getUpgradeProgress(levelProgressElements: number, level: number) {
  assertCardLevel(level);
  assertProgressValue(levelProgressElements, "Level progress");
  const requiredElements = getRequiredProgressElements(level);
  const filledElements = Math.min(levelProgressElements, requiredElements);
  return {
    filledElements,
    requiredElements,
    percent: roundProgressValue((filledElements * 100) / requiredElements),
  };
}

export function getUpgradeGoldPrice(targetLevel: number, levelProgressElements: number) {
  assertCardLevel(targetLevel);
  if (targetLevel === MIN_CARD_LEVEL) throw new RangeError("Target level must be above the minimum card level");
  const entry = getCardLevelTableEntry(targetLevel);
  const progress = getUpgradeProgress(levelProgressElements, targetLevel - 1);
  if (entry.goldUpgradeCost === null) return null;

  const minimum = isGoldLevel(targetLevel) ? entry.minimumGoldCost : 0;
  if (minimum === null) return null;
  const reducible = entry.goldUpgradeCost - minimum;
  if (reducible < 0) throw new RangeError(`Invalid canonical gold cost for level ${targetLevel}`);
  const unfilled = progress.requiredElements - progress.filledElements;
  return minimum + Math.ceil((reducible * unfilled) / progress.requiredElements);
}

export function canLevelUp(
  state: CardProgressionState,
  availableGold: number,
): { availability: UpgradeAvailability; requiredGold: number | null } {
  assertProgressValue(availableGold, "Available gold");
  if (state.level === MAX_CARD_LEVEL) {
    return { availability: "maximum_level", requiredGold: 0 };
  }
  const requiredGold = getUpgradeGoldPrice(state.level + 1, state.levelProgressElements);
  if (requiredGold === null) {
    return { availability: "unsupported_level_data", requiredGold: null };
  }
  // Gold is the alternative to filling the elemental progress. Absorption
  // only lowers the confirmed price; it must not be a prerequisite for the
  // upgrade itself.
  return {
    availability: availableGold >= requiredGold ? "ready" : "insufficient_gold",
    requiredGold,
  };
}

export function advanceCardLevel(state: CardProgressionState) {
  assertCardLevel(state.level);
  if (state.level === MAX_CARD_LEVEL) throw new RangeError("Card is already at maximum level");
  assertProgressValue(state.levelProgressElements, "Level progress");
  assertProgressValue(state.storedElements, "Stored elements");
  const level = state.level + 1;
  const currentLevelOverflow = Math.max(
    0,
    state.levelProgressElements - getRequiredProgressElements(state.level),
  );
  const transferableOverflow = roundProgressValue(currentLevelOverflow + state.storedElements);
  return { level, ...applyElementalPotential({ level, levelProgressElements: 0, storedElements: 0 }, transferableOverflow) };
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

export const SHOP_LEVEL_RANGES: Readonly<Partial<Record<CardRarity, Readonly<{
  maximumLevel: number;
  minimumLevel: number;
}>>>> = Object.freeze({
  uncommon: Object.freeze({ minimumLevel: 5, maximumLevel: 9 }),
  rare: Object.freeze({ minimumLevel: 10, maximumLevel: 19 }),
  epic: Object.freeze({ minimumLevel: 20, maximumLevel: 34 }),
  legendary: Object.freeze({ minimumLevel: 35, maximumLevel: 59 }),
  mythic: Object.freeze({ minimumLevel: 60, maximumLevel: 75 }),
});

export function selectShopLevelForRarity(rarity: CardRarity, rng: IntegerRandomSource) {
  const range = SHOP_LEVEL_RANGES[rarity];
  if (!range) throw new RangeError(`Rarity ${rarity} is not sold by the permanent Shop`);
  const size = range.maximumLevel - range.minimumLevel + 1;
  const offset = rng.nextInt(size);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= size) {
    throw new RangeError("Random source returned an invalid Shop level offset");
  }
  return range.minimumLevel + offset;
}

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
