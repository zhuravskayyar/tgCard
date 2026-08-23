import assert from "node:assert/strict";
import test from "node:test";
import { validateDeckElementBalance } from "@cardastika/game-core";
import { COLLECTION_CARDS } from "../collections/collectionCatalog.js";
import {
  CAMPAIGN_BOSS_CARD_CONFIG,
  CAMPAIGN_QUESTS_PER_STAGE,
  CAMPAIGN_STAGE_COUNT,
  CAMPAIGN_STAGES,
  MANTICORE_CARD_CODE,
} from "./campaignConfig.js";

test("Campaign 1 has exactly six stages, six quests per stage, and 36 unique quests", () => {
  assert.equal(CAMPAIGN_STAGES.length, CAMPAIGN_STAGE_COUNT);
  assert.ok(CAMPAIGN_STAGES.every(({ quests }) => quests.length === CAMPAIGN_QUESTS_PER_STAGE));
  const quests = CAMPAIGN_STAGES.flatMap(({ quests }) => quests);
  assert.equal(quests.length, 36);
  assert.equal(new Set(quests.map(({ id }) => id)).size, 36);
  assert.ok(quests.every(({ reward }) => reward.xp >= 0 && reward.silver >= 0));
});

test("Campaign boss config references nine existing collection cards in a 3/2/2/2 mix", () => {
  const byCode = new Map(COLLECTION_CARDS.map((card) => [card.code, card]));
  const cards = CAMPAIGN_BOSS_CARD_CONFIG.map(({ code }) => {
    const card = byCode.get(code);
    assert.ok(card, `Missing canonical boss card ${code}`);
    return card;
  });
  assert.equal(cards.length, 9);
  assert.equal(new Set(cards.map(({ code }) => code)).size, 9);
  assert.equal(validateDeckElementBalance(cards).valid, true);
  assert.equal(byCode.get(MANTICORE_CARD_CODE)?.displayName, "Мантикора");
});
