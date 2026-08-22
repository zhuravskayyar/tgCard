import assert from "node:assert/strict";
import test from "node:test";
import type { PlayerCard, PlayerDeckCard } from "@cardastika/shared";
import {
  calculateDeckTotalPower,
  DeckValidationError,
  parseDeckUpdateRequest,
  validateDeckOwnership,
} from "./deckRules.js";

const validSlots = Array.from({ length: 9 }, (_, index) => ({
  slot: index + 1,
  cardId: `starter_${String(index + 1).padStart(2, "0")}`,
}));

function expectCode(action: () => unknown, code: DeckValidationError["code"]) {
  assert.throws(action, (error) => error instanceof DeckValidationError && error.code === code);
}

test("deck request requires exactly nine unique ordered slots", () => {
  assert.deepEqual(parseDeckUpdateRequest({ slots: [...validSlots].reverse() }), validSlots);
  expectCode(() => parseDeckUpdateRequest({ slots: validSlots.slice(0, 8) }), "invalid_deck");
  expectCode(
    () => parseDeckUpdateRequest({ slots: validSlots.map((entry, index) => index === 8 ? { ...entry, slot: 10 } : entry) }),
    "invalid_slot",
  );
  expectCode(
    () => parseDeckUpdateRequest({ slots: validSlots.map((entry, index) => index === 8 ? { ...entry, slot: 1 } : entry) }),
    "duplicate_slot",
  );
  expectCode(
    () => parseDeckUpdateRequest({ slots: validSlots.map((entry, index) => index === 8 ? { ...entry, cardId: "" } : entry) }),
    "invalid_card_id",
  );
});

test("deck ownership rejects unowned cards and quantity overuse", () => {
  const inventory: Pick<PlayerCard, "cardId" | "quantity">[] = validSlots.map(({ cardId }) => ({
    cardId,
    quantity: 1,
  }));

  expectCode(
    () => validateDeckOwnership(validSlots.map((entry, index) => index === 8 ? { ...entry, cardId: "unknown" } : entry), inventory),
    "unowned_card",
  );
  expectCode(
    () => validateDeckOwnership(validSlots.map((entry, index) => index === 8 ? { ...entry, cardId: validSlots[0]!.cardId } : entry), inventory),
    "card_quantity_exceeded",
  );
});

test("deck total power is calculated from canonical card power", () => {
  const cards = Array.from({ length: 9 }, () => ({ power: 12 })) as Pick<PlayerDeckCard, "power">[];
  assert.equal(calculateDeckTotalPower(cards), 108);
});
