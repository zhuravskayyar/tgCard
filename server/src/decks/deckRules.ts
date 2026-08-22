import {
  DECK_SIZE,
  type DeckSlotInput,
  type PlayerCard,
  type PlayerDeckCard,
  type UpdatePlayerDeckRequest,
} from "@cardastika/shared";

export type DeckValidationErrorCode =
  | "invalid_deck"
  | "invalid_slot"
  | "duplicate_slot"
  | "invalid_card_id"
  | "unowned_card"
  | "card_quantity_exceeded";

export class DeckValidationError extends Error {
  constructor(public readonly code: DeckValidationErrorCode) {
    super(code);
    this.name = "DeckValidationError";
  }
}

export function parseDeckUpdateRequest(value: unknown): DeckSlotInput[] {
  if (!value || typeof value !== "object") {
    throw new DeckValidationError("invalid_deck");
  }

  const slots = (value as Partial<UpdatePlayerDeckRequest>).slots;
  if (!Array.isArray(slots) || slots.length !== DECK_SIZE) {
    throw new DeckValidationError("invalid_deck");
  }

  const parsed = slots.map((entry): DeckSlotInput => {
    if (!entry || typeof entry !== "object") {
      throw new DeckValidationError("invalid_deck");
    }

    const { cardId, slot } = entry as Partial<DeckSlotInput>;
    if (!Number.isSafeInteger(slot) || Number(slot) < 1 || Number(slot) > DECK_SIZE) {
      throw new DeckValidationError("invalid_slot");
    }
    if (typeof cardId !== "string" || !cardId.trim()) {
      throw new DeckValidationError("invalid_card_id");
    }

    return { cardId: cardId.trim(), slot: Number(slot) };
  });

  if (new Set(parsed.map(({ slot }) => slot)).size !== DECK_SIZE) {
    throw new DeckValidationError("duplicate_slot");
  }

  return parsed.sort((left, right) => left.slot - right.slot);
}

export function validateDeckOwnership(
  slots: readonly DeckSlotInput[],
  inventory: readonly Pick<PlayerCard, "cardId" | "quantity">[],
) {
  const ownedQuantities = new Map(inventory.map((card) => [card.cardId, card.quantity]));
  const selectedQuantities = new Map<string, number>();

  for (const { cardId } of slots) {
    const owned = ownedQuantities.get(cardId);
    if (!owned) {
      throw new DeckValidationError("unowned_card");
    }

    const selected = (selectedQuantities.get(cardId) ?? 0) + 1;
    if (selected > owned) {
      throw new DeckValidationError("card_quantity_exceeded");
    }
    selectedQuantities.set(cardId, selected);
  }
}

export function calculateDeckTotalPower(cards: readonly Pick<PlayerDeckCard, "power">[]) {
  return cards.reduce((total, card) => total + card.power, 0);
}
