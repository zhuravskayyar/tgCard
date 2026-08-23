import type {
  CardElement,
  CollectionModifier,
  CollectionModifierType,
} from "@cardastika/shared";

export interface PlayerCollectionModifiers {
  absorptionEfficiencyPct: number;
  battleDamagePct: number;
  battleHpPct: number;
  deckPowerPct: number;
  elementDamagePct: Readonly<Record<CardElement, number>>;
  experienceRewardPct: number;
  silverRewardPct: number;
}

export function getPlayerCollectionModifiers(
  completedCollections: readonly CollectionModifier[],
): PlayerCollectionModifiers {
  const result = {
    absorptionEfficiencyPct: 0,
    battleDamagePct: 0,
    battleHpPct: 0,
    deckPowerPct: 0,
    elementDamagePct: { fire: 0, water: 0, air: 0, earth: 0 },
    experienceRewardPct: 0,
    silverRewardPct: 0,
  };
  const fields: Partial<Record<CollectionModifierType, keyof Omit<PlayerCollectionModifiers, "elementDamagePct">>> = {
    absorption_efficiency_pct: "absorptionEfficiencyPct",
    battle_damage_pct: "battleDamagePct",
    battle_hp_pct: "battleHpPct",
    deck_power_pct: "deckPowerPct",
    experience_reward_pct: "experienceRewardPct",
    silver_reward_pct: "silverRewardPct",
  };

  for (const modifier of completedCollections) {
    if (!Number.isFinite(modifier.value) || modifier.value < 0) {
      throw new RangeError("Collection modifier value must be non-negative");
    }
    if (modifier.type === "element_damage_pct") {
      if (!modifier.element) throw new RangeError("Element damage modifier requires an element");
      result.elementDamagePct[modifier.element] += modifier.value;
      continue;
    }
    const field = fields[modifier.type];
    if (field) result[field] += modifier.value;
  }
  return result;
}

export function applyAbsorptionEfficiency(
  baseElements: number,
  modifiers: PlayerCollectionModifiers,
) {
  if (!Number.isSafeInteger(baseElements) || baseElements < 0) {
    throw new RangeError("Base absorption elements must be a non-negative integer");
  }
  return Math.floor(baseElements * (100 + modifiers.absorptionEfficiencyPct) / 100);
}
