import { CARD_RARITIES, type CardRarity } from "@cardastika/shared";

export const EQUIPMENT_MANUAL_SOURCE_URL = "https://elem.mobi/forum/3/294767/#23854893";

const RARITY_ALIASES: Readonly<Record<CardRarity, readonly string[]>> = {
  common: ["обычная", "обычное", "обычный", "обычные", "обычных"],
  uncommon: ["необычная", "необычное", "необычный", "необычные", "необычных"],
  rare: ["редкая", "редкое", "редкий", "редкие", "редких"],
  epic: ["эпическая", "эпическое", "эпический", "эпические", "эпических"],
  legendary: ["легендарная", "легендарное", "легендарный", "легендарные", "легендарных"],
  mythic: ["мифическая", "мифическое", "мифический", "мифические", "мифических"],
};

const RARITY_FROM_WORD: Readonly<Record<string, CardRarity>> = Object.fromEntries(
  CARD_RARITIES.flatMap((rarity) => RARITY_ALIASES[rarity].map((alias) => [alias, rarity])),
) as Record<string, CardRarity>;

const ARTIFACT_RULES = [
  { id: "mage_spear", name: "Копье мага", aliases: ["Копье мага", "Копьё мага"], valueColumns: 1 },
  { id: "mage_shield", name: "Щит мага", aliases: ["Щит мага"], valueColumns: 1 },
  { id: "magic_mirror", name: "Зеркало магии", aliases: ["Зеркало магии"], valueColumns: 2 },
  { id: "life_amulet", name: "Амулет жизни", aliases: ["Амулет жизни"], valueColumns: 1 },
  { id: "voodoo_doll", name: "Кукла Вуду", aliases: ["Кукла Вуду"], valueColumns: 1 },
] as const;

export type EquipmentManualArtifactId = (typeof ARTIFACT_RULES)[number]["id"];

export interface EquipmentManualArtifactRule {
  id: EquipmentManualArtifactId;
  name: string;
  description: string;
  valueColumns: readonly string[];
  valuesByRarity: Readonly<Record<CardRarity, readonly number[]>>;
}

export interface EquipmentManualSetRule {
  id: "single_rarity" | "all_elements";
  name: string;
  description: string;
  multiplier: number | null;
}

export interface EquipmentManualForgeRecipe {
  inputCount: number;
  inputRarity: CardRarity;
  gold: number;
  outputCount: number;
  outputRarity: CardRarity;
}

export interface EquipmentManualLink {
  label: string;
  url: string;
}

export interface EquipmentManual {
  sourceUrl: string;
  title: string;
  equipmentTypeCount: number;
  thingTypeCount: number;
  artifactTypeCount: number;
  storageLimit: {
    things: number;
    artifacts: number;
  };
  rarityPowerBonus: Readonly<Record<CardRarity, number>>;
  setRules: readonly EquipmentManualSetRule[];
  artifactRules: readonly EquipmentManualArtifactRule[];
  forgeRecipes: readonly EquipmentManualForgeRecipe[];
  acquisitionSources: readonly EquipmentManualLink[];
  artifactBattleModes: readonly EquipmentManualLink[];
  notes: readonly string[];
}

export class EquipmentManualParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EquipmentManualParseError";
  }
}

function decodeHtmlEntities(value: string) {
  const namedEntities: Readonly<Record<string, string>> = {
    amp: "&",
    apos: "'",
    gt: ">",
    nbsp: " ",
    quot: '"',
    lt: "<",
  };

  return value
    .replace(/&#(x[\da-f]+|\d+);/giu, (_, code: string) => {
      const radix = code.toLowerCase().startsWith("x") ? 16 : 10;
      const numericCode = Number.parseInt(code.replace(/^x/i, ""), radix);
      return Number.isFinite(numericCode) ? String.fromCodePoint(numericCode) : _;
    })
    .replace(/&([a-z]+);/gi, (entity, name: string) => namedEntities[name.toLowerCase()] ?? entity);
}

/** Converts the forum's legacy markup into the same line-oriented text a user sees. */
export function equipmentManualHtmlToText(html: string) {
  return decodeHtmlEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
      .replace(/<style\b[\s\S]*?<\/style\s*>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:div|p|li|tr|h[1-6]|center)\s*>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/\r/g, ""),
  )
    .split("\n")
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function normalizeSearchText(value: string) {
  return value.replace(/[ёЁ]/g, "е").replace(/\s+/g, " ").trim().toLocaleLowerCase("ru-RU");
}

function findTextIndex(text: string, needle: string, fromIndex = 0) {
  return normalizeSearchText(text).indexOf(normalizeSearchText(needle), fromIndex);
}

function requireMatch<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new EquipmentManualParseError(message);
  return value;
}

function parseInteger(value: string) {
  const parsed = Number.parseInt(value.replace(/\s/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parsePercent(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function rarityPattern(rarity: CardRarity) {
  return RARITY_ALIASES[rarity].map((alias) => alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
}

function parseRarityRows(section: string, valueColumns: number) {
  const rows = {} as Record<CardRarity, readonly number[]>;
  for (const rarity of CARD_RARITIES) {
    const rowPattern = new RegExp(
      `(?:${rarityPattern(rarity)})\\s+((?:[+-]?\\d+%?\\s+){${valueColumns - 1}}[+-]?\\d+%?)`,
      "iu",
    );
    const match = section.match(rowPattern);
    const capturedValues = match?.[1];
    if (!capturedValues) return undefined;
    const values = [...capturedValues.matchAll(/[+-]?\d+%?/g)].map(([value]) => parsePercent(value.replace("%", "")));
    if (values.length !== valueColumns || values.some((value) => value === undefined)) return undefined;
    rows[rarity] = values as number[];
  }
  return rows;
}

function extractArtifactSection(text: string, aliases: readonly string[], nextStart: number) {
  const start = aliases
    .map((alias) => findTextIndex(text, alias))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  if (start === undefined || start >= nextStart) return undefined;
  return { start, section: text.slice(start, nextStart) };
}

function parseArtifactDescription(section: string, artifactName: string, headerCandidates: readonly string[]) {
  const nameIndex = findTextIndex(section, artifactName);
  const withoutName = nameIndex >= 0 ? section.slice(nameIndex + artifactName.length) : section;
  const headerIndex = headerCandidates
    .map((candidate) => findTextIndex(withoutName, candidate))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  return (headerIndex === undefined ? withoutName : withoutName.slice(0, headerIndex))
    .replace(/\s+/g, " ")
    .trim();
}

function parseLinks(html: string, labels: readonly string[], sourceUrl: string) {
  const links: EquipmentManualLink[] = [];
  const linkPattern = /<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a\s*>/gi;
  for (const match of html.matchAll(linkPattern)) {
    const rawHref = match[2];
    const rawLabel = match[3];
    if (rawHref === undefined || rawLabel === undefined) continue;
    const label = equipmentManualHtmlToText(rawLabel).replace(/\s+/g, " ").trim();
    if (!labels.some((candidate) => normalizeSearchText(candidate) === normalizeSearchText(label))) continue;
    let url: URL;
    try {
      url = new URL(decodeHtmlEntities(rawHref), sourceUrl);
    } catch {
      continue;
    }
    if (!links.some((link) => link.label === label && link.url === url.href)) links.push({ label, url: url.href });
  }
  return links;
}

function parseRarity(value: string) {
  return RARITY_FROM_WORD[normalizeSearchText(value)];
}

function parseForgeRecipes(text: string) {
  const recipes: EquipmentManualForgeRecipe[] = [];
  const recipePattern = /(\d+)\s+([а-яё]+)\s+(?:вещ\p{L}+|артефакт\p{L}+)\s*\+\s*([\d ]+)\s*=\s*(\d+)\s+([а-яё]+)\s+(?:вещ\p{L}+|артефакт\p{L}+)/giu;
  for (const match of text.matchAll(recipePattern)) {
    const inputCountText = match[1];
    const inputRarityText = match[2];
    const goldText = match[3];
    const outputCountText = match[4];
    const outputRarityText = match[5];
    if (inputCountText === undefined || inputRarityText === undefined || goldText === undefined || outputCountText === undefined || outputRarityText === undefined) continue;
    const inputRarity = parseRarity(inputRarityText);
    const outputRarity = parseRarity(outputRarityText);
    const inputCount = parseInteger(inputCountText);
    const gold = parseInteger(goldText);
    const outputCount = parseInteger(outputCountText);
    if (!inputRarity || !outputRarity || inputCount === undefined || gold === undefined || outputCount === undefined) continue;
    recipes.push({ inputCount, inputRarity, gold, outputCount, outputRarity });
  }
  return recipes;
}

function parseRequiredNumber(text: string, pattern: RegExp, message: string) {
  const match = text.match(pattern);
  return requireMatch(match?.[1] ? parseInteger(match[1]) : undefined, message);
}

export function parseEquipmentManualText(text: string, sourceUrl = EQUIPMENT_MANUAL_SOURCE_URL): EquipmentManual {
  const normalizedText = text.replace(/\r/g, " ").replace(/[\n\t ]+/g, " ").trim();
  if (!normalizedText) throw new EquipmentManualParseError("Equipment manual is empty");

  const equipmentTypeCount = parseRequiredNumber(normalizedText, /Существует\s+(\d+)\s+типов\s+снаряжения/iu, "Equipment type count is missing");
  const thingTypeCount = parseRequiredNumber(normalizedText, /Существует\s+\d+\s+типов\s+снаряжения:\s*(\d+)\s+из\s+них\s*-\s*это\s+вещи/iu, "Equipment thing count is missing");
  const artifactTypeCount = parseRequiredNumber(normalizedText, /остальные\s+(\d+)\s*-\s*аксессуары/iu, "Equipment artifact count is missing");
  const storageLimitMatch = normalizedText.match(/не более\s+(\d+)\s+штук\s+вещей[^\d]+и\s+(\d+)\s+артефактов/iu);
  if (!storageLimitMatch?.[1] || !storageLimitMatch[2]) throw new EquipmentManualParseError("Equipment storage limit is missing");
  const storageThings = requireMatch(parseInteger(storageLimitMatch[1]), "Equipment things storage limit is invalid");
  const storageArtifacts = requireMatch(parseInteger(storageLimitMatch[2]), "Equipment artifacts storage limit is invalid");

  const raritySectionStart = findTextIndex(normalizedText, "Увеличение силы зависит от редкости вещи");
  const setSectionStart = findTextIndex(normalizedText, "Существует два типа комплектов вещей");
  const raritySection = normalizedText.slice(raritySectionStart, setSectionStart >= 0 ? setSectionStart : undefined);
  const rarityPowerRows = requireMatch(parseRarityRows(raritySection, 1), "Equipment rarity bonuses are missing");

  const sameRarityPercent = parseRequiredNumber(
    normalizedText,
    /Наденьте\s+4\s+вещи\s+одинаковой\s+редкости[^.]*?вырастет\s+на\s+(\d+)%/iu,
    "Single-rarity set bonus is missing",
  );
  const allElementsSetText = requireMatch(
    normalizedText.match(/Наденьте\s+4\s+вещи\s+4\s+разных\s+стихий[^.]*\./iu)?.[0],
    "All-elements set rule is missing",
  );
  const setRules: EquipmentManualSetRule[] = [
    {
      id: "single_rarity",
      name: "Единая редкость",
      description: `4 вещи одинаковой редкости увеличивают бонус каждой вещи на ${sameRarityPercent}%.`,
      multiplier: 1 + sameRarityPercent / 100,
    },
    {
      id: "all_elements",
      name: "Школа всех стихий",
      description: allElementsSetText,
      multiplier: null,
    },
  ];

  const artifactSectionStart = findTextIndex(normalizedText, "Виды артефактов");
  const artifactRules: EquipmentManualArtifactRule[] = [];
  for (let index = 0; index < ARTIFACT_RULES.length; index += 1) {
    const artifact = requireMatch(ARTIFACT_RULES[index], "Artifact rule definition is missing");
    const nextArtifact = ARTIFACT_RULES[index + 1];
    const nextStart = nextArtifact
      ? artifactSectionStart + findTextIndex(normalizedText.slice(artifactSectionStart), nextArtifact.name)
      : findTextIndex(normalizedText, "Если в бой взяты Амулет жизни", artifactSectionStart);
    const section = extractArtifactSection(normalizedText, artifact.aliases, nextStart >= artifactSectionStart ? nextStart : normalizedText.length);
    if (!section) throw new EquipmentManualParseError(`${artifact.name} section is missing`);
    const valuesByRarity = parseRarityRows(section.section, artifact.valueColumns);
    if (!valuesByRarity) throw new EquipmentManualParseError(`${artifact.name} rarity values are missing`);
    const valueColumns = artifact.valueColumns === 2
      ? ["уменьшение урона", "отражение урона"]
      : [artifact.id === "life_amulet" ? "восстановление ОЗ" : "эффект, %"];
    artifactRules.push({
      id: artifact.id,
      name: artifact.name,
      description: parseArtifactDescription(section.section, artifact.name, ["редкость", "Увеличение урона", "Уменьшение урона", "Уменьшение и отражение урона", "Восполняемые ОЗ", "Уменьшение ОЗ"]),
      valueColumns,
      valuesByRarity,
    });
  }

  const forgeStart = findTextIndex(normalizedText, "Правила создания вещей и артефактов");
  const forgeEnd = findTextIndex(normalizedText, "Если у Вас на складе достаточно", forgeStart);
  const forgeRecipes = parseForgeRecipes(normalizedText.slice(forgeStart, forgeEnd >= 0 ? forgeEnd : undefined));
  if (forgeRecipes.length !== 5) throw new EquipmentManualParseError("Expected five forge recipes");

  const rarityPowerBonus = Object.fromEntries(
    CARD_RARITIES.map((rarity) => [rarity, requireMatch(rarityPowerRows[rarity]?.[0], `${rarity} rarity bonus is invalid`)]),
  ) as Record<CardRarity, number>;

  return {
    sourceUrl,
    title: "Мануал: снаряжение",
    equipmentTypeCount,
    thingTypeCount,
    artifactTypeCount,
    storageLimit: { things: storageThings, artifacts: storageArtifacts },
    rarityPowerBonus,
    setRules,
    artifactRules,
    forgeRecipes,
    acquisitionSources: [],
    artifactBattleModes: [],
    notes: [
      "Надетая вещь усиливает карты своей стихии и здоровье игрока.",
      "Бонус вещей сначала добавляется к силе карты, затем применяются процентные бонусы мага.",
      "Артефакты работают на Арене, в Турнире и в Войне гильдий.",
    ],
  };
}

export function parseEquipmentManualHtml(html: string, sourceUrl = EQUIPMENT_MANUAL_SOURCE_URL) {
  if (!html.trim()) throw new EquipmentManualParseError("Equipment manual HTML is empty");
  const manual = parseEquipmentManualText(equipmentManualHtmlToText(html), sourceUrl);
  return {
    ...manual,
    acquisitionSources: parseLinks(html, ["Ежедневные задания", "Лавка сундуков", "Алмазные награды", "Новогодние сундуки"], sourceUrl),
    artifactBattleModes: parseLinks(html, ["Арена", "Турнир", "Война гильдий"], sourceUrl),
  };
}
