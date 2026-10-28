import assert from "node:assert/strict";
import test from "node:test";
import { getRarityForLevel } from "@cardastika/game-core";
import { CARD_ELEMENTS } from "@cardastika/shared";
import {
  STARTER_CARDS,
  STARTER_CARD_COUNT,
  STARTER_CARD_SEED_CONFIG,
  STARTER_INSTANCE_DEFAULTS,
} from "./starterCards.js";

test("starter definitions are canonical and unique", () => {
  assert.deepEqual(
    STARTER_CARDS.map(({ code, displayName, element }) => ({ code, displayName, element })),
    [
      { code: "starter_v5_01", displayName: "Борсук", element: "earth" },
      { code: "starter_v5_02", displayName: "Рогач", element: "earth" },
      { code: "starter_v5_03", displayName: "Корона коренів", element: "earth" },
      { code: "starter_v5_04", displayName: "Вогняний кабан", element: "fire" },
      { code: "starter_v5_05", displayName: "Вугільна ропуха", element: "fire" },
      { code: "starter_v5_06", displayName: "Морський коник", element: "water" },
      { code: "starter_v5_07", displayName: "Чаша хвиль", element: "water" },
      { code: "starter_v5_08", displayName: "Ластівка", element: "air" },
      { code: "starter_v5_09", displayName: "Вихор", element: "air" },
    ],
  );
  assert.equal(STARTER_CARDS.length, STARTER_CARD_COUNT);
  assert.equal(STARTER_CARD_COUNT, 9);
  assert.equal(new Set(STARTER_CARDS.map(({ id }) => id)).size, STARTER_CARD_COUNT);
  assert.equal(new Set(STARTER_CARDS.map(({ code }) => code)).size, STARTER_CARD_COUNT);

  for (const [index, card] of STARTER_CARDS.entries()) {
    assert.equal(card.collectionId, null);
    assert.ok(card.displayName);
    assert.equal(card.artKey, `new-cards/starter_v2_${String(index + 1).padStart(2, "0")}`);
    assert.ok(CARD_ELEMENTS.includes(card.element));
  }
  assert.deepEqual(STARTER_INSTANCE_DEFAULTS, { level: 1, bonusPower: 2, finalPower: 12 });
  assert.equal(getRarityForLevel(STARTER_INSTANCE_DEFAULTS.level), "common");
  assert.deepEqual(
    STARTER_CARD_SEED_CONFIG.cards.map(({ type }) => type),
    ["creature", "creature", "artifact", "creature", "creature", "creature", "artifact", "creature", "phenomenon"],
  );
});
