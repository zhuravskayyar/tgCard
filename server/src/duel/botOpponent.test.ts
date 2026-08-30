import assert from "node:assert/strict";
import test from "node:test";
import {
  getBasePowerForLevel,
  getDeckPower,
  getMatchmakingRange,
  getRarityForLevel,
  validateDeckElementBalance,
} from "@cardastika/game-core";
import type { CardElement, DuelSideSnapshot } from "@cardastika/shared";
import {
  createBotOpponentSnapshot,
  generateBotNickname,
  selectBotEffectiveDeckPower,
  type BotCardTemplate,
} from "./botOpponent.js";

function sequenceRandom(values: number[]) {
  let index = 0;
  return () => values[index++ % values.length]!;
}

const elements: readonly CardElement[] = ["fire", "water", "earth", "air"];
const challenger: DuelSideSnapshot = {
  name: "Real player",
  photoUrl: "https://example.test/player.jpg",
  level: 8,
  cards: Array.from({ length: 9 }, (_, index) => ({
    instanceId: `real-instance-${index + 1}`,
    cardId: `real-card-${index + 1}`,
    code: `real_card_${index + 1}`,
    displayName: `Real Card ${index + 1}`,
    artKey: `real-card-${index + 1}`,
    element: elements[index % elements.length]!,
    level: 1,
    basePower: 100,
    bonusPower: 0,
    finalPower: 100,
    rarity: "common" as const,
  })),
  modifiers: {
    battleDamagePct: 7,
    battleHpPct: 10,
    deckPowerPct: 5,
    elementDamagePct: { fire: 5, water: 0, earth: 0, air: 0 },
    experienceRewardPct: 3,
    silverRewardPct: 4,
  },
  effectiveDeckPower: 900,
  startingHp: 990,
};

const templates: BotCardTemplate[] = elements.flatMap((element) => (
  Array.from({ length: 6 }, (_, index) => ({
    cardId: `bot-card-${element}-${index + 1}`,
    code: `bot_card_${element}_${index + 1}`,
    displayName: `Bot Card ${element} ${index + 1}`,
    artKey: `bot-card-${element}-${index + 1}`,
    element,
  }))
));

test("bot nickname generator creates varied human-like handles without a bot label", () => {
  assert.equal(generateBotNickname(sequenceRandom([0, 0, 0, 0])), "AlexAce7");
  assert.equal(generateBotNickname(sequenceRandom([0.5, 0.5, 0.5, 0.5])), "Mila_lucky503");
  assert.equal(generateBotNickname(sequenceRandom([0.99, 0.99, 0.99, 0.99])), "wolfYana990");
});

test("bot power varies by at least three percent inside normal and streak ranges", () => {
  const normalRange = getMatchmakingRange(900, 0);
  const streakRange = getMatchmakingRange(900, 5);

  assert.equal(selectBotEffectiveDeckPower(900, normalRange, () => 0), 810);
  assert.equal(selectBotEffectiveDeckPower(900, normalRange, () => 0.999999), 990);
  assert.equal(selectBotEffectiveDeckPower(900, streakRange, () => 0), 765);
  assert.equal(selectBotEffectiveDeckPower(900, streakRange, () => 0.999999), 1_035);
});

test("bot snapshot builds a distinct canonical 3/2/2/2 deck at the selected total power", () => {
  const original = structuredClone(challenger);
  const range = getMatchmakingRange(challenger.effectiveDeckPower, 0);
  const bot = createBotOpponentSnapshot(challenger, range, templates, () => 0, "test-opponent");

  assert.equal(bot.name, "AlexAce7");
  assert.equal(bot.level, 7);
  assert.equal(bot.photoUrl, "/card-art/bot-card-fire-1.webp");
  assert.equal(bot.effectiveDeckPower, range.minimum);
  assert.equal(bot.startingHp, bot.effectiveDeckPower);
  assert.equal(getDeckPower(bot.cards), bot.effectiveDeckPower);
  assert.equal(validateDeckElementBalance(bot.cards).valid, true);
  assert.equal(new Set(bot.cards.map(({ cardId }) => cardId)).size, 9);
  assert.equal(new Set(bot.cards.map(({ instanceId }) => instanceId)).size, 9);
  assert.ok(bot.cards.every(({ cardId }) => !challenger.cards.some((card) => card.cardId === cardId)));
  assert.ok(bot.cards.every(({ instanceId }) => instanceId.startsWith("bot:test-opponent:")));
  assert.ok(bot.cards.every((card) => (
    card.basePower === getBasePowerForLevel(card.level)
    && card.finalPower === card.basePower + card.bonusPower
    && card.rarity === getRarityForLevel(card.level)
  )));
  assert.deepEqual(bot.modifiers, {
    battleDamagePct: 0,
    battleHpPct: 0,
    deckPowerPct: 0,
    elementDamagePct: { fire: 0, water: 0, air: 0, earth: 0 },
    experienceRewardPct: 0,
    silverRewardPct: 0,
  });
  assert.deepEqual(challenger, original);
});

test("bot snapshot never selects limited card templates", () => {
  const limitedTemplate: BotCardTemplate = {
    cardId: "limited-bot-card",
    code: "limited_bot_card",
    displayName: "Limited Bot Card",
    artKey: null,
    element: "fire",
    limited: true,
  };
  const range = getMatchmakingRange(challenger.effectiveDeckPower, 0);
  const bot = createBotOpponentSnapshot(challenger, range, [limitedTemplate, ...templates], () => 0, "limited-test");

  assert.ok(bot.cards.every(({ cardId, limited }) => cardId !== limitedTemplate.cardId && limited === false));
});

test("different server RNG produces different bot identities, cards, and total strength", () => {
  const range = getMatchmakingRange(challenger.effectiveDeckPower, 0);
  const weaker = createBotOpponentSnapshot(challenger, range, templates, () => 0, "weaker");
  const stronger = createBotOpponentSnapshot(challenger, range, templates, () => 0.999999, "stronger");

  assert.equal(weaker.effectiveDeckPower, range.minimum);
  assert.equal(stronger.effectiveDeckPower, range.maximum);
  assert.notEqual(weaker.name, stronger.name);
  assert.notDeepEqual(
    weaker.cards.map(({ cardId }) => cardId),
    stronger.cards.map(({ cardId }) => cardId),
  );
  assert.notDeepEqual(
    weaker.cards.map(({ finalPower }) => finalPower),
    stronger.cards.map(({ finalPower }) => finalPower),
  );
});

test("bot deck generator rejects an incomplete canonical element catalog", () => {
  const incomplete = templates.filter(({ element }) => element !== "fire").concat(
    templates.filter(({ element }) => element === "fire").slice(0, 2),
  );
  assert.throws(
    () => createBotOpponentSnapshot(
      challenger,
      getMatchmakingRange(challenger.effectiveDeckPower, 0),
      incomplete,
      () => 0,
    ),
    /at least 3 alternative fire templates/,
  );
});

test("bot generators reject invalid random sources", () => {
  assert.throws(() => generateBotNickname(() => 1), /RNG/);
  assert.throws(
    () => selectBotEffectiveDeckPower(900, getMatchmakingRange(900, 0), () => -0.1),
    /RNG/,
  );
});
