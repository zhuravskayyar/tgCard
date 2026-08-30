import {
  CARD_ELEMENTS,
  CARD_RARITIES,
  EQUIPMENT_SLOTS,
  type CardElement,
  type CardRarity,
  type EquipmentBonusType,
  type EquipmentDefinition,
  type EquipmentSlot,
  type PlayerEquipment,
  type PlayerEquipmentInventory,
} from "@cardastika/shared";

export const EQUIPMENT_THING_SLOTS = ["head", "cloak", "gloves", "boots"] as const;
export type EquipmentThingSlot = (typeof EQUIPMENT_THING_SLOTS)[number];

export const EQUIPMENT_ARTIFACT_SLOTS = ["weapon", "shield", "relic", "amulet", "voodoo"] as const;
export type EquipmentArtifactSlot = (typeof EQUIPMENT_ARTIFACT_SLOTS)[number];

/** Source manual: bonus of a thing by rarity. */
export const EQUIPMENT_BONUS_BY_RARITY: Readonly<Record<CardRarity, number>> = {
  common: 25,
  uncommon: 50,
  rare: 100,
  epic: 200,
  legendary: 400,
  mythic: 1_000,
};

export const EQUIPMENT_RARITY_CONFIG: Readonly<Record<CardRarity, {
  color: string;
  label: string;
}>> = {
  common: { color: "#a7a39b", label: "Звичайна" },
  uncommon: { color: "#78ad86", label: "Незвичайна" },
  rare: { color: "#72a9d4", label: "Рідкісна" },
  epic: { color: "#ad8bd0", label: "Епічна" },
  legendary: { color: "#d4a65e", label: "Легендарна" },
  mythic: { color: "#e48172", label: "Міфічна" },
};

export const EQUIPMENT_SLOT_LABELS: Readonly<Record<EquipmentSlot, string>> = {
  head: "Головний убір",
  cloak: "Плащ",
  gloves: "Одяг",
  boots: "Взуття",
  weapon: "Коп'є мага",
  shield: "Щит мага",
  amulet: "Амулет життя",
  relic: "Дзеркало магії",
  voodoo: "Кукла Вуду",
};

export const EQUIPMENT_ELEMENT_LABELS: Readonly<Record<CardElement, string>> = {
  fire: "Вогонь",
  water: "Вода",
  earth: "Земля",
  air: "Повітря",
};

export const EQUIPMENT_ELEMENT_SYMBOLS: Readonly<Record<CardElement, string>> = {
  fire: "🔥",
  water: "💧",
  earth: "🌿",
  air: "⚡",
};

export type EquipmentSetId = "single_rarity" | "elemental_harmony";

export interface EquipmentSetBonus {
  description: string;
  id: EquipmentSetId;
  label: string;
  multiplier: number | null;
}

export interface EquipmentArtifactBonus {
  description: string;
  itemId: string;
  label: string;
  secondaryLabel?: string;
  secondaryType?: EquipmentBonusType;
  secondaryValue?: number;
  type: EquipmentBonusType;
  value: number;
}

export interface EquipmentSummary {
  activeSets: EquipmentSetBonus[];
  allDecksReceiveElementBonuses: boolean;
  artifactBonuses: EquipmentArtifactBonus[];
  adjustedItemBonusTotal: number;
  elementBonuses: Record<CardElement, number>;
  equipmentRating: number;
  itemBonusTotal: number;
}

export interface EquipmentBattleModifiers {
  damageReflectionPct: number;
  incomingDamageReductionPct: number;
  outgoingDamagePct: number;
  reviveHpPct: number;
  voodooHpReductionPct: number;
}

export interface EquipmentForgeRecipe {
  goldCost: number;
  inputCount: number;
  inputRarity: CardRarity;
  outputRarity: CardRarity;
}

export const EQUIPMENT_FORGE_RECIPES: readonly EquipmentForgeRecipe[] = [
  { inputRarity: "common", inputCount: 4, goldCost: 5, outputRarity: "uncommon" },
  { inputRarity: "uncommon", inputCount: 5, goldCost: 50, outputRarity: "rare" },
  { inputRarity: "rare", inputCount: 6, goldCost: 500, outputRarity: "epic" },
  { inputRarity: "epic", inputCount: 7, goldCost: 5_000, outputRarity: "legendary" },
  { inputRarity: "legendary", inputCount: 8, goldCost: 50_000, outputRarity: "mythic" },
];

type ElementalEquipmentDefinition = EquipmentDefinition & {
  category: "things";
  element: CardElement;
};

function emptyElementBonuses(): Record<CardElement, number> {
  return { fire: 0, water: 0, air: 0, earth: 0 };
}

function isThing(definition: EquipmentDefinition | undefined): definition is ElementalEquipmentDefinition {
  return Boolean(definition && definition.category === "things" && definition.element);
}

function isCompleteThingSet(
  definitionsBySlot: Readonly<Partial<Record<EquipmentSlot, EquipmentDefinition>>>,
): definitionsBySlot is Readonly<Record<EquipmentThingSlot, ElementalEquipmentDefinition>> {
  return EQUIPMENT_THING_SLOTS.every((slot) => isThing(definitionsBySlot[slot]));
}

function getArtifactBonusLabel(type: EquipmentBonusType) {
  switch (type) {
    case "outgoing_damage": return "Вихідний урон";
    case "incoming_damage_reduction": return "Зменшення вхідного урону";
    case "damage_reflection": return "Відбиття урону";
    case "health_reduction": return "Прокляття Вуду";
    case "save_once": return "Відродження один раз за бій";
    case "passive": return "Пасивний ефект";
    case "element_power": return "Сила стихії";
  }
}

export function getEquipmentRarityBonus(rarity: CardRarity) {
  return EQUIPMENT_BONUS_BY_RARITY[rarity];
}

export function calculateEquipmentSummary(
  equippedDefinitions: readonly EquipmentDefinition[],
): EquipmentSummary {
  const definitionsBySlot: Partial<Record<EquipmentSlot, EquipmentDefinition>> = {};
  const elementBonuses = emptyElementBonuses();
  const artifactBonuses: EquipmentArtifactBonus[] = [];
  let itemBonusTotal = 0;

  for (const definition of equippedDefinitions) {
    definitionsBySlot[definition.slot] = definition;

    if (isThing(definition)) {
      const bonus = getEquipmentRarityBonus(definition.rarity);
      elementBonuses[definition.element] += bonus;
      itemBonusTotal += bonus;
      continue;
    }

    if (definition.category === "artifacts") {
      artifactBonuses.push({
        description: definition.description,
        itemId: definition.id,
        label: getArtifactBonusLabel(definition.bonusType),
        ...(definition.secondaryBonusType ? { secondaryLabel: getArtifactBonusLabel(definition.secondaryBonusType), secondaryType: definition.secondaryBonusType } : {}),
        ...(definition.secondaryBonusValue === undefined ? {} : { secondaryValue: definition.secondaryBonusValue }),
        type: definition.bonusType,
        value: definition.bonusValue,
      });
    }
  }

  const activeSets: EquipmentSetBonus[] = [];
  let adjustedItemBonusTotal = itemBonusTotal;
  let allDecksReceiveElementBonuses = false;
  let sameRaritySet = false;
  let elementalHarmonySet = false;

  if (isCompleteThingSet(definitionsBySlot)) {
    const things = EQUIPMENT_THING_SLOTS.map((slot) => definitionsBySlot[slot]);
    sameRaritySet = new Set(things.map(({ rarity }) => rarity)).size === 1;
    elementalHarmonySet = new Set(things.map(({ element }) => element)).size === CARD_ELEMENTS.length;

    if (sameRaritySet) {
      adjustedItemBonusTotal = Math.round(itemBonusTotal * 1.25);
      activeSets.push({
        description: "+25% до бонусу кожної речі однакової рідкості",
        id: "single_rarity",
        label: "Єдина рідкість",
        multiplier: 1.25,
      });
    }

    if (elementalHarmonySet) {
      allDecksReceiveElementBonuses = true;
      activeSets.push({
        description: "Кожна річ підсилює карти всіх чотирьох стихій",
        id: "elemental_harmony",
        label: "Школа всіх стихій",
        multiplier: null,
      });
    }
  }

  const itemBonusMultiplier = itemBonusTotal === 0 ? 1 : adjustedItemBonusTotal / itemBonusTotal;
  if (elementalHarmonySet) {
    for (const element of CARD_ELEMENTS) elementBonuses[element] = adjustedItemBonusTotal;
  } else if (sameRaritySet) {
    for (const element of CARD_ELEMENTS) elementBonuses[element] = Math.round(elementBonuses[element] * itemBonusMultiplier);
  }

  const equipmentRating = adjustedItemBonusTotal + artifactBonuses.reduce(
    (total, bonus) => total + bonus.value + (bonus.secondaryValue ?? 0),
    0,
  );

  return {
    activeSets,
    allDecksReceiveElementBonuses,
    artifactBonuses,
    adjustedItemBonusTotal,
    elementBonuses,
    equipmentRating,
    itemBonusTotal,
  };
}

export function getEquipmentBattleModifiers(summary: EquipmentSummary): EquipmentBattleModifiers {
  const modifiers: EquipmentBattleModifiers = {
    damageReflectionPct: 0,
    incomingDamageReductionPct: 0,
    outgoingDamagePct: 0,
    reviveHpPct: 0,
    voodooHpReductionPct: 0,
  };

  for (const bonus of summary.artifactBonuses) {
    if (bonus.type === "outgoing_damage") modifiers.outgoingDamagePct += bonus.value;
    if (bonus.type === "incoming_damage_reduction") modifiers.incomingDamageReductionPct += bonus.value;
    if (bonus.type === "save_once") modifiers.reviveHpPct += bonus.value;
    if (bonus.type === "health_reduction") modifiers.voodooHpReductionPct += bonus.value;
    if (bonus.secondaryType === "damage_reflection") modifiers.damageReflectionPct += bonus.secondaryValue ?? 0;
    if (bonus.type === "damage_reflection") modifiers.damageReflectionPct += bonus.value;
  }

  return modifiers;
}

export function getEquipmentForgeRecipe(inputRarity: CardRarity) {
  return EQUIPMENT_FORGE_RECIPES.find((recipe) => recipe.inputRarity === inputRarity) ?? null;
}

function pickWeighted<T>(values: readonly { value: T; weight: number }[], random: () => number): T {
  if (values.length === 0) throw new RangeError("Forge selection cannot be empty");
  const roll = random();
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new RangeError("Forge random source must return a value in [0, 1)");
  const totalWeight = values.reduce((total, entry) => total + entry.weight, 0);
  let cursor = roll * totalWeight;
  for (const entry of values) {
    cursor -= entry.weight;
    if (cursor < 0) return entry.value;
  }
  return values[values.length - 1]!.value;
}

/** Resolves the source rule: mixed inputs select the exact item family by input quantity. */
export function resolveEquipmentForgeResult(
  inputDefinitions: readonly EquipmentDefinition[],
  random: () => number = Math.random,
): EquipmentDefinition {
  const first = inputDefinitions[0];
  if (!first) throw new RangeError("Forge selection cannot be empty");
  const recipe = getEquipmentForgeRecipe(first.rarity);
  if (!recipe) throw new RangeError("Mythic equipment cannot be forged further");
  if (inputDefinitions.length !== recipe.inputCount) throw new RangeError(`Forge requires ${recipe.inputCount} items`);
  if (inputDefinitions.some((definition) => definition.rarity !== first.rarity || definition.category !== first.category || !definition.isEnabled)) {
    throw new RangeError("Forge inputs must have the same rarity and category");
  }

  const families = new Map<string, { definition: EquipmentDefinition; weight: number }>();
  for (const definition of inputDefinitions) {
    const family = `${definition.slot}:${definition.element ?? "none"}`;
    const existing = families.get(family);
    if (existing) existing.weight += 1;
    else families.set(family, { definition, weight: 1 });
  }
  const family = pickWeighted([...families.values()].map(({ definition, weight }) => ({ value: definition, weight })), random);
  const result = STARTER_EQUIPMENT_DEFINITIONS.find((definition) => (
    definition.category === first.category
    && definition.slot === family.slot
    && definition.element === family.element
    && definition.rarity === recipe.outputRarity
  ));
  if (!result) throw new Error("Forge result is not present in the equipment catalog");
  return result;
}

function item(
  id: string,
  code: string,
  name: string,
  slot: EquipmentSlot,
  category: EquipmentDefinition["category"],
  rarity: CardRarity,
  bonusType: EquipmentBonusType,
  bonusValue: number,
  description: string,
  flavorText: string,
  element: EquipmentDefinition["element"] = null,
  secondaryBonusType?: EquipmentBonusType,
  secondaryBonusValue?: number,
): EquipmentDefinition {
  const assetKey = category === "things" ? `${slot}-${element}` : slot;
  return {
    assetKey,
    bonusType,
    bonusValue,
    category,
    code,
    description,
    element,
    flavorText,
    frameKey: `rarity-${rarity}`,
    iconKey: slot,
    id,
    isEnabled: true,
    name,
    rarity,
    slot,
    ...(secondaryBonusType ? { secondaryBonusType } : {}),
    ...(secondaryBonusValue === undefined ? {} : { secondaryBonusValue }),
  };
}

const THING_NAMES: Readonly<Record<EquipmentThingSlot, string>> = {
  head: "Головний убір",
  cloak: "Плащ",
  gloves: "Одяг",
  boots: "Взуття",
};

const ARTIFACT_PROFILES: Readonly<Record<EquipmentArtifactSlot, {
  bonusType: EquipmentBonusType;
  description: (value: number, secondaryValue?: number) => string;
  flavorText: string;
  name: string;
  secondaryBonusType?: EquipmentBonusType;
  values: readonly number[];
  secondaryValues?: readonly number[];
}>> = {
  weapon: {
    bonusType: "outgoing_damage",
    description: (value) => `Збільшує вихідний урон на ${value}% від сили карти.`,
    flavorText: "Коп'є мага пробиває захист першою атакою.",
    name: "Коп'є мага",
    values: [2, 4, 8, 12, 20, 30],
  },
  shield: {
    bonusType: "incoming_damage_reduction",
    description: (value) => `Зменшує вхідний урон на ${value}% від сили карти ворога.`,
    flavorText: "Щит мага тримає удар, але не зупиняє контратаку.",
    name: "Щит мага",
    values: [2, 3, 7, 11, 18, 24],
  },
  relic: {
    bonusType: "incoming_damage_reduction",
    description: (value, secondaryValue) => `Зменшує урон на ${value}% і відбиває ${secondaryValue}% від сили карти ворога.`,
    flavorText: "Дзеркало повертає частину удару тому, хто його завдав.",
    name: "Дзеркало магії",
    secondaryBonusType: "damage_reflection",
    values: [1, 2, 4, 6, 9, 12],
    secondaryValues: [1, 2, 4, 6, 9, 12],
  },
  amulet: {
    bonusType: "save_once",
    description: (value) => `Після смерті відроджує з ${value}% максимального HP один раз за бій.`,
    flavorText: "Життя повертається до того, хто ще не завершив свій бій.",
    name: "Амулет життя",
    values: [2, 4, 8, 12, 20, 30],
  },
  voodoo: {
    bonusType: "health_reduction",
    description: (value) => `Після смерті зменшує поточне HP вбивці на ${value}% його максимального HP один раз за бій.`,
    flavorText: "Кукла Вуду залишає прокляття після останнього подиху.",
    name: "Кукла Вуду",
    values: [1, 2, 4, 6, 9, 12],
  },
};

function buildEquipmentCatalog(): readonly EquipmentDefinition[] {
  const definitions: EquipmentDefinition[] = [];
  for (const slot of EQUIPMENT_THING_SLOTS) {
    for (const element of CARD_ELEMENTS) {
      for (const rarity of CARD_RARITIES) {
        const rarityLabel = EQUIPMENT_RARITY_CONFIG[rarity].label;
        const bonus = getEquipmentRarityBonus(rarity);
        const code = `${slot}-${element}-${rarity}`;
        definitions.push(item(
          `equipment_${slot}_${element}_${rarity}`,
          code,
          `${rarityLabel} ${THING_NAMES[slot]} · ${EQUIPMENT_ELEMENT_LABELS[element]}`,
          slot,
          "things",
          rarity,
          "element_power",
          bonus,
          `${EQUIPMENT_ELEMENT_LABELS[element]}ні карти отримують +${bonus} сили.`,
          `Річ стихії ${EQUIPMENT_ELEMENT_LABELS[element].toLowerCase()} зберігає силу своєї рідкості.`,
          element,
        ));
      }
    }
  }

  for (const slot of EQUIPMENT_ARTIFACT_SLOTS) {
    const profile = ARTIFACT_PROFILES[slot];
    for (const [index, rarity] of CARD_RARITIES.entries()) {
      const value = profile.values[index]!;
      const secondaryValue = profile.secondaryValues?.[index];
      const code = `${slot}-${rarity}`;
      definitions.push(item(
        `equipment_${slot}_${rarity}`,
        code,
        `${profile.name} · ${EQUIPMENT_RARITY_CONFIG[rarity].label}`,
        slot,
        "artifacts",
        rarity,
        profile.bonusType,
        value,
        profile.description(value, secondaryValue),
        profile.flavorText,
        null,
        profile.secondaryBonusType,
        secondaryValue,
      ));
    }
  }
  return Object.freeze(definitions);
}

/** Complete source-compatible catalog: 96 things and 30 artifacts. */
export const STARTER_EQUIPMENT_DEFINITIONS: readonly EquipmentDefinition[] = buildEquipmentCatalog();

export const STARTER_PLAYER_EQUIPMENT: PlayerEquipment = {
  playerId: "local-player",
  equipped: {
    amulet: null,
    boots: null,
    cloak: null,
    gloves: null,
    head: null,
    relic: null,
    shield: null,
    weapon: null,
    voodoo: null,
  },
};

export const STARTER_PLAYER_EQUIPMENT_INVENTORY: readonly PlayerEquipmentInventory[] = [];

export function getEquippedDefinitions(
  playerEquipment: PlayerEquipment,
  definitions: readonly EquipmentDefinition[] = STARTER_EQUIPMENT_DEFINITIONS,
) {
  const definitionsById = new Map(definitions.map((definition) => [definition.id, definition]));
  return EQUIPMENT_SLOTS.flatMap((slot) => {
    const itemId = playerEquipment.equipped[slot];
    const definition = itemId ? definitionsById.get(itemId) : undefined;
    return definition ? [definition] : [];
  });
}
