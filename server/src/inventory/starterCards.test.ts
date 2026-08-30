import assert from "node:assert/strict";
import test from "node:test";
import { getRarityForLevel } from "@cardastika/game-core";
import { CARD_ELEMENTS } from "@cardastika/shared";
import {
  STARTER_CARDS,
  STARTER_CARD_COUNT,
  STARTER_INSTANCE_DEFAULTS,
} from "./starterCards.js";

test("starter definitions are canonical and unique", () => {
  assert.deepEqual(
    STARTER_CARDS.map(({ code, displayName, element }) => ({ code, displayName, element })),
    [
      { code: "starter_01", displayName: "Саламандра", element: "fire" },
      { code: "starter_02", displayName: "Лис", element: "fire" },
      { code: "starter_03", displayName: "Жук-бомбардир", element: "fire" },
      { code: "starter_04", displayName: "Вугор", element: "water" },
      { code: "starter_05", displayName: "Щука", element: "water" },
      { code: "starter_06", displayName: "Ворон", element: "air" },
      { code: "starter_07", displayName: "Сокіл", element: "air" },
      { code: "starter_08", displayName: "Кріт", element: "earth" },
      { code: "starter_09", displayName: "Вепр", element: "earth" },
    ],
  );
  assert.equal(STARTER_CARDS.length, STARTER_CARD_COUNT);
  assert.equal(STARTER_CARD_COUNT, 9);
  assert.equal(new Set(STARTER_CARDS.map(({ id }) => id)).size, STARTER_CARD_COUNT);
  assert.equal(new Set(STARTER_CARDS.map(({ code }) => code)).size, STARTER_CARD_COUNT);

  for (const card of STARTER_CARDS) {
    assert.equal(card.collectionId, null);
    assert.ok(card.displayName);
    assert.equal(card.artKey, null);
    assert.ok(CARD_ELEMENTS.includes(card.element));
  }
  assert.deepEqual(STARTER_INSTANCE_DEFAULTS, { level: 1, bonusPower: 2, finalPower: 12 });
  assert.equal(getRarityForLevel(STARTER_INSTANCE_DEFAULTS.level), "common");
});
