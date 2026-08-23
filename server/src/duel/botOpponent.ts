import { randomUUID } from "node:crypto";
import type { RandomSource } from "@cardastika/game-core";
import type { DuelSideSnapshot } from "@cardastika/shared";

const FIRST_NAMES = [
  "Alex", "Andrii", "Artem", "Danylo", "Den", "Ihor", "Kate", "Lena",
  "Maks", "Marta", "Mila", "Nazar", "Nika", "Oleh", "Roman", "Sasha",
  "Sofi", "Taras", "Vika", "Yana",
] as const;

const HANDLE_WORDS = [
  "ace", "blaze", "comet", "drift", "ember", "flux", "fox", "ghost",
  "lucky", "nova", "pixel", "raven", "rush", "spark", "storm", "wolf",
] as const;

function randomIndex(length: number, random: RandomSource): number {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error("Bot opponent RNG must return a value from 0 inclusive to 1 exclusive");
  }
  return Math.floor(value * length);
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

export function createBotOpponentSnapshot(
  challenger: DuelSideSnapshot,
  random: RandomSource,
  botId: string = randomUUID(),
): DuelSideSnapshot {
  const levelOffset = randomIndex(3, random) - 1;
  return {
    name: generateBotNickname(random),
    photoUrl: null,
    level: Math.max(1, challenger.level + levelOffset),
    cards: challenger.cards.map((card, index) => ({
      ...card,
      instanceId: `bot:${botId}:${index + 1}`,
    })),
    modifiers: {
      ...challenger.modifiers,
      elementDamagePct: { ...challenger.modifiers.elementDamagePct },
    },
    effectiveDeckPower: challenger.effectiveDeckPower,
    startingHp: challenger.startingHp,
  };
}
