import { randomUUID } from "node:crypto";
import {
  BASE_POWER_BY_LEVEL,
  distributeDeckPowerByProfile,
  getRarityForLevel,
  getStartingHp,
  type MatchmakingRange,
  type RandomSource,
} from "@cardastika/game-core";
import type {
  CardElement,
  DuelBattleModifiers,
  DuelCardSnapshot,
  DuelSideSnapshot,
} from "@cardastika/shared";

const FIRST_NAMES = [
  "Alex", "Andrii", "Artem", "Danylo", "Den", "Ihor", "Kate", "Lena",
  "Maks", "Marta", "Mila", "Nazar", "Nika", "Oleh", "Roman", "Sasha",
  "Sofi", "Taras", "Vika", "Yana",
] as const;

const HANDLE_WORDS = [
  "ace", "blaze", "comet", "drift", "ember", "flux", "fox", "ghost",
  "lucky", "nova", "pixel", "raven", "rush", "spark", "storm", "wolf",
] as const;

const CARD_ELEMENTS: readonly CardElement[] = ["fire", "water", "air", "earth"];
const BOT_DECK_SIZE = 9;
const BOT_AVATAR_COUNT = 20;
const MIN_CARD_POWER = BASE_POWER_BY_LEVEL[0]!;
const MIN_BOT_POWER_DIFFERENCE_PCT = 3;

const BOT_MODIFIERS: Readonly<DuelBattleModifiers> = Object.freeze({
  battleDamagePct: 0,
  battleHpPct: 0,
  deckPowerPct: 0,
  elementDamagePct: Object.freeze({ fire: 0, water: 0, air: 0, earth: 0 }),
  experienceRewardPct: 0,
  silverRewardPct: 0,
});

export interface BotCardTemplate {
  artKey: string | null;
  cardId: string;
  code: string;
  displayName: string | null;
  element: CardElement;
  limited?: boolean;
}

function randomIndex(length: number, random: RandomSource): number {
  if (!Number.isSafeInteger(length) || length <= 0) {
    throw new RangeError("Bot opponent random selection requires a non-empty pool");
  }
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error("Bot opponent RNG must return a value from 0 inclusive to 1 exclusive");
  }
  return Math.floor(value * length);
}

export function getBotAvatarToken(random: RandomSource): string {
  const index = randomIndex(BOT_AVATAR_COUNT, random) + 1;
  return `avatar:${String(index).padStart(2, "0")}`;
}

function capitalize(value: string): string {
  return `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;
}

export function generateBotNickname(random: RandomSource): string {
  const firstName = FIRST_NAMES[randomIndex(FIRST_NAMES.length, random)]!;
  const handle = HANDLE_WORDS[randomIndex(HANDLE_WORDS.length, random)]!;
  const number = 7 + randomIndex(993, random);
  const pattern = randomIndex(3, random);

  if (pattern === 0) return `${firstName}${capitalize(handle)}${number}`;
  if (pattern === 1) return `${firstName}_${handle}${number}`;
  return `${handle}${firstName}${number}`;
}

function countInclusive(minimum: number, maximum: number): number {
  return maximum >= minimum ? maximum - minimum + 1 : 0;
}

export function selectBotEffectiveDeckPower(
  challengerPower: number,
  range: MatchmakingRange,
  random: RandomSource,
): number {
  const minimumDeckPower = BOT_DECK_SIZE * MIN_CARD_POWER;
  const minimumDifference = Math.max(
    1,
    Math.round(challengerPower * MIN_BOT_POWER_DIFFERENCE_PCT / 100),
  );
  const lowerMinimum = Math.max(range.minimum, minimumDeckPower);
  const lowerMaximum = Math.min(range.maximum, challengerPower - minimumDifference);
  const upperMinimum = Math.max(range.minimum, minimumDeckPower, challengerPower + minimumDifference);
  const upperMaximum = range.maximum;
  const lowerCount = countInclusive(lowerMinimum, lowerMaximum);
  const upperCount = countInclusive(upperMinimum, upperMaximum);
  const candidateCount = lowerCount + upperCount;

  if (candidateCount === 0) {
    throw new RangeError("Matchmaking range cannot contain a varied nine-card bot deck");
  }

  const selection = randomIndex(candidateCount, random);
  return selection < lowerCount
    ? lowerMinimum + selection
    : upperMinimum + selection - lowerCount;
}

function selectBotCardTemplates(
  challenger: DuelSideSnapshot,
  templates: readonly BotCardTemplate[],
  random: RandomSource,
): BotCardTemplate[] {
  const challengerCardIds = new Set(challenger.cards.map(({ cardId }) => cardId));
  const availableTemplates = CARD_ELEMENTS.map((element) => ({
    element,
    templates: templates.filter((template) => template.element === element && !template.limited),
  }));
  const threeCardOptions = availableTemplates.filter(({ templates: pool }) => pool.length >= 3);
  const threeCardElement = threeCardOptions.length
    ? threeCardOptions[randomIndex(threeCardOptions.length, random)]!.element
    : CARD_ELEMENTS[randomIndex(CARD_ELEMENTS.length, random)]!;
  const selected: BotCardTemplate[] = [];

  for (const element of CARD_ELEMENTS) {
    const required = element === threeCardElement ? 3 : 2;
    const allElementTemplates = availableTemplates.find((entry) => entry.element === element)!.templates;
    const distinctTemplates = allElementTemplates.filter((template) => !challengerCardIds.has(template.cardId));
    // Small catalogs may only contain the cards a new player already owns.
    // Allow shared card types; if the catalog itself is short, reuse a type
    // only after every available type has been used once.
    const pool = (distinctTemplates.length >= required ? distinctTemplates : allElementTemplates).slice();
    if (!pool.length) {
      throw new RangeError(`Bot card catalog needs at least one ${element} template`);
    }
    for (let count = 0; count < required; count += 1) {
      if (pool.length) {
        const index = randomIndex(pool.length, random);
        selected.push(pool.splice(index, 1)[0]!);
      } else {
        selected.push(allElementTemplates[randomIndex(allElementTemplates.length, random)]!);
      }
    }
  }

  return selected;
}

/** Bot slot powers follow the player deck shape; strong cards land on random slots. */
function distributeCardPowers(
  challenger: DuelSideSnapshot,
  totalPower: number,
  random: RandomSource,
): number[] {
  const profilePowers = distributeDeckPowerByProfile(
    challenger.cards.map(({ finalPower }) => finalPower),
    totalPower,
    { deckSize: BOT_DECK_SIZE, minCardPower: MIN_CARD_POWER },
    random,
  );
  const shuffled: number[] = [];
  while (profilePowers.length) {
    shuffled.push(profilePowers.splice(randomIndex(profilePowers.length, random), 1)[0]!);
  }
  return shuffled;
}

function progressionForPower(finalPower: number) {
  let levelIndex = BASE_POWER_BY_LEVEL.length - 1;
  while (levelIndex > 0 && BASE_POWER_BY_LEVEL[levelIndex]! > finalPower) {
    levelIndex -= 1;
  }
  const level = levelIndex + 1;
  const basePower = BASE_POWER_BY_LEVEL[levelIndex]!;
  return {
    level,
    basePower,
    bonusPower: finalPower - basePower,
    rarity: getRarityForLevel(level),
  };
}

export function createBotOpponentSnapshot(
  challenger: DuelSideSnapshot,
  range: MatchmakingRange,
  templates: readonly BotCardTemplate[],
  random: RandomSource,
  botId: string = randomUUID(),
): DuelSideSnapshot {
  const effectiveDeckPower = selectBotEffectiveDeckPower(
    challenger.effectiveDeckPower,
    range,
    random,
  );
  const selectedTemplates = selectBotCardTemplates(challenger, templates, random);
  const cardPowers = distributeCardPowers(challenger, effectiveDeckPower, random);
  const cards: DuelCardSnapshot[] = selectedTemplates.map((template, index) => ({
    ...template,
    ...progressionForPower(cardPowers[index]!),
    finalPower: cardPowers[index]!,
    instanceId: `bot:${botId}:${index + 1}`,
    limited: false,
  }));
  const levelOffset = randomIndex(3, random) - 1;
  const name = generateBotNickname(random);
  const photoUrl = getBotAvatarToken(random);

  return {
    name,
    photoUrl,
    level: Math.max(1, challenger.level + levelOffset),
    cards,
    modifiers: {
      ...BOT_MODIFIERS,
      elementDamagePct: { ...BOT_MODIFIERS.elementDamagePct },
    },
    effectiveDeckPower,
    startingHp: getStartingHp(effectiveDeckPower, BOT_MODIFIERS.battleHpPct),
  };
}
