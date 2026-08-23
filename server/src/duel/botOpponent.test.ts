import assert from "node:assert/strict";
import test from "node:test";
import type { DuelSideSnapshot } from "@cardastika/shared";
import { createBotOpponentSnapshot, generateBotNickname } from "./botOpponent.js";

function sequenceRandom(values: number[]) {
  let index = 0;
  return () => values[index++ % values.length]!;
}

const challenger: DuelSideSnapshot = {
  name: "Real player",
  photoUrl: "https://example.test/player.jpg",
  level: 8,
  cards: Array.from({ length: 9 }, (_, index) => ({
    instanceId: `real-${index + 1}`,
    cardId: `card-${index + 1}`,
    code: `card_${index + 1}`,
    displayName: `Card ${index + 1}`,
    artKey: `card-${index + 1}`,
    element: (["fire", "water", "earth", "air"] as const)[index % 4]!,
    level: 1,
    basePower: 100,
    bonusPower: 0,
    finalPower: 100,
    rarity: "common" as const,
  })),
  modifiers: {
    battleDamagePct: 0,
    battleHpPct: 10,
    deckPowerPct: 0,
    elementDamagePct: { fire: 5, water: 0, earth: 0, air: 0 },
    experienceRewardPct: 0,
    silverRewardPct: 0,
  },
  effectiveDeckPower: 900,
  startingHp: 990,
};

test("bot nickname generator creates varied human-like handles without a bot label", () => {
  assert.equal(generateBotNickname(sequenceRandom([0, 0, 0, 0])), "AlexAce7");
  assert.equal(generateBotNickname(sequenceRandom([0.5, 0.5, 0.5, 0.5])), "Mila_lucky503");
  assert.equal(generateBotNickname(sequenceRandom([0.99, 0.99, 0.99, 0.99])), "wolfYana990");
});

test("bot snapshot keeps battle balance, clones nested data, and uses unique synthetic card ids", () => {
  const bot = createBotOpponentSnapshot(
    challenger,
    sequenceRandom([0.5, 0, 0, 0, 0]),
    "test-opponent",
  );

  assert.equal(bot.name, "AlexAce7");
  assert.equal(bot.level, 8);
  assert.equal(bot.photoUrl, null);
  assert.equal(bot.effectiveDeckPower, challenger.effectiveDeckPower);
  assert.equal(bot.startingHp, challenger.startingHp);
  assert.equal(bot.cards.length, 9);
  assert.equal(new Set(bot.cards.map(({ instanceId }) => instanceId)).size, 9);
  assert.equal(bot.cards[0]?.instanceId, "bot:test-opponent:1");
  assert.notEqual(bot.cards, challenger.cards);
  assert.notEqual(bot.modifiers, challenger.modifiers);
  assert.notEqual(bot.modifiers.elementDamagePct, challenger.modifiers.elementDamagePct);
  assert.equal(challenger.cards[0]?.instanceId, "real-1");
});

test("bot nickname generator rejects invalid random sources", () => {
  assert.throws(() => generateBotNickname(() => 1), /RNG/);
});
