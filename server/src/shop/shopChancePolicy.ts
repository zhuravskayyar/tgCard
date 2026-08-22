import type { CardRarity } from "@cardastika/shared";
import type { ShopOfferDefinition } from "./shopCatalog.js";

export const BASIS_POINTS_PER_PERCENT = 100;
export const MAX_CHANCE_BASIS_POINTS = 100 * BASIS_POINTS_PER_PERCENT;

const RARITY_RANK: Record<CardRarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
  mythic: 5,
};

// Isolated policy choice: a higher-rarity hit does not reset lower meters;
// lower targets are treated as misses and continue accumulating progress.
export const LOWER_PITY_ON_HIGHER_SUCCESS_POLICY = "increment_as_miss" as const;

export interface ShopRandomSource {
  nextInt(maxExclusive: number): number;
}

export interface StoredShopChance {
  chanceBasisPoints: number;
  rarity: CardRarity;
}

export interface ResolvedShopChance extends StoredShopChance {
  incrementBasisPoints: number;
}

export interface ShopRarityResolution {
  rarity: CardRarity;
  updatedChances: ResolvedShopChance[];
}

export function basisPointsToPercent(chanceBasisPoints: number) {
  return chanceBasisPoints / BASIS_POINTS_PER_PERCENT;
}

export function halveChanceAfterSuccess(chanceBasisPoints: number) {
  if (!Number.isSafeInteger(chanceBasisPoints) || chanceBasisPoints < 0) {
    throw new Error("Shop chance must be a non-negative fixed-point integer");
  }
  return Math.ceil(chanceBasisPoints / (2 * BASIS_POINTS_PER_PERCENT)) * BASIS_POINTS_PER_PERCENT;
}

export function increaseChanceAfterMiss(chanceBasisPoints: number, incrementBasisPoints: number) {
  if (
    !Number.isSafeInteger(chanceBasisPoints) ||
    chanceBasisPoints < 0 ||
    !Number.isSafeInteger(incrementBasisPoints) ||
    incrementBasisPoints <= 0
  ) {
    throw new Error("Shop chance increment requires fixed-point integers");
  }
  return Math.min(MAX_CHANCE_BASIS_POINTS, chanceBasisPoints + incrementBasisPoints);
}

export function resolveShopRarity(
  offer: ShopOfferDefinition,
  playerChances: readonly StoredShopChance[],
  rng: ShopRandomSource,
): ShopRarityResolution {
  const chanceByRarity = new Map(playerChances.map((state) => [state.rarity, state.chanceBasisPoints]));
  const upgrades = [...offer.upgrades].sort(
    (left, right) => RARITY_RANK[right.rarity] - RARITY_RANK[left.rarity],
  );

  let successfulRarity: CardRarity | null = null;
  for (const upgrade of upgrades) {
    const currentChance = chanceByRarity.get(upgrade.rarity);
    if (currentChance === undefined) {
      throw new Error(`Missing shop chance state for ${offer.id}/${upgrade.rarity}`);
    }
    const roll = rng.nextInt(MAX_CHANCE_BASIS_POINTS);
    if (!Number.isSafeInteger(roll) || roll < 0 || roll >= MAX_CHANCE_BASIS_POINTS) {
      throw new Error("Shop RNG returned an invalid fixed-point roll");
    }
    if (roll < currentChance) {
      successfulRarity = upgrade.rarity;
      break;
    }
  }

  return {
    rarity: successfulRarity ?? offer.guaranteedRarity,
    updatedChances: offer.upgrades.map((upgrade) => {
      const currentChance = chanceByRarity.get(upgrade.rarity);
      if (currentChance === undefined) {
        throw new Error(`Missing shop chance state for ${offer.id}/${upgrade.rarity}`);
      }
      return {
        rarity: upgrade.rarity,
        incrementBasisPoints: upgrade.incrementBasisPoints,
        chanceBasisPoints: upgrade.rarity === successfulRarity
          ? halveChanceAfterSuccess(currentChance)
          : increaseChanceAfterMiss(currentChance, upgrade.incrementBasisPoints),
      };
    }),
  };
}
