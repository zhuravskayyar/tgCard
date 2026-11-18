import {
  CARD_ELEMENTS,
  type CardElement,
  type CollectionBonusScope,
  type CollectionModifier,
  type CollectionModifierType,
} from "@cardastika/shared";

export interface PlayerCollectionModifiers {
  altarGoldLevels: number;
  absorptionEfficiencyPct: number;
  battleDamagePct: number;
  battleHpPct: number;
  deckPowerPct: number;
  duelCooldownMinutes: number;
  duelGoldLimitBonus: number;
  duelGoldSharePct: number;
  elementDamagePct: Readonly<Record<CardElement, number>>;
  experienceRewardPct: number;
  silverRewardPct: number;
}

export function getPlayerCollectionModifiers(
  completedCollections: readonly CollectionModifier[],
  scope?: CollectionBonusScope,
): PlayerCollectionModifiers {
  const result = {
    altarGoldLevels: 0,
    absorptionEfficiencyPct: 0,
    battleDamagePct: 0,
    battleHpPct: 0,
    deckPowerPct: 0,
    duelCooldownMinutes: 0,
    duelGoldLimitBonus: 0,
    duelGoldSharePct: 0,
    elementDamagePct: { fire: 0, water: 0, air: 0, earth: 0 },
    experienceRewardPct: 0,
    silverRewardPct: 0,
  };
  const fields: Partial<Record<CollectionModifierType, keyof Omit<PlayerCollectionModifiers, "elementDamagePct">>> = {
    absorption_efficiency_pct: "absorptionEfficiencyPct",
    battle_damage_pct: "battleDamagePct",
    battle_hp_pct: "battleHpPct",
    deck_power_pct: "deckPowerPct",
    duel_cooldown_minutes: "duelCooldownMinutes",
    duel_gold_limit: "duelGoldLimitBonus",
    duel_gold_share_pct: "duelGoldSharePct",
    experience_reward_pct: "experienceRewardPct",
    silver_reward_pct: "silverRewardPct",
    altar_gold_levels: "altarGoldLevels",
  };

  for (const modifier of completedCollections) {
    if (scope && modifier.scope && modifier.scope !== "all_battles" && modifier.scope !== scope) continue;
    if (scope && modifier.scope === "all_battles" && !["duel", "arena", "campaign", "guild_raid"].includes(scope)) continue;
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
  const rounded = Math.round(baseElements * 100);
  if (
    !Number.isFinite(baseElements)
    || baseElements < 0
    || !Number.isSafeInteger(rounded)
    || Math.abs(baseElements - rounded / 100) > 1e-9
  ) {
    throw new RangeError("Base absorption elements must be a non-negative number with at most two decimal places");
  }
  return Math.round((baseElements * (100 + modifiers.absorptionEfficiencyPct) / 100 + Number.EPSILON) * 100) / 100;
}

/** Collections that add guild experience (catalog code → percent); kept by code like the tournament effects. */
export const GUILD_XP_COLLECTION_BONUS_PCT: Readonly<Record<string, number>> = Object.freeze({
  spring_bloom: 10,
  old_soldiers: 10,
});

/** The guild XP a single activity grants after collection bonuses; accepts codes or `collection_<code>` ids. */
export function applyGuildXpCollectionBonus(baseXp: number, completedCollections: readonly string[]) {
  let pct = 0;
  for (const code of new Set(completedCollections.map((entry) => entry.replace(/^collection_/, "")))) {
    pct += GUILD_XP_COLLECTION_BONUS_PCT[code] ?? 0;
  }
  return Math.round(baseXp * (100 + pct) / 100);
}

export function getZodiacCollectionElementPct(completedCodes: readonly string[]): Record<CardElement, number> {
  const completed = new Set(completedCodes);
  const elements = CARD_ELEMENTS.filter(element => completed.has(`zodiac_${element}`));
  const pct = [0, 5, 7.5, 10, 10][elements.length]!;
  const bonuses = { fire: 0, water: 0, air: 0, earth: 0 };
  for (const element of elements) bonuses[element] = pct;
  return bonuses;
}

/** Collection completion currently represents the first and only supported collection level. */
export function getCollectionStrikeMultiplierBonus(completedCodes: readonly string[]) {
  const completed = new Set(completedCodes);
  return {
    weak: completed.has("breath_of_storm") ? 0.1 : 0,
    critical: completed.has("legion_of_flame") ? 0.1 : 0,
    attackNormal: completed.has("deep_engines") ? 0.1 : 0,
    counterNormal: completed.has("titans_of_forge") ? 0.1 : 0,
  };
}
