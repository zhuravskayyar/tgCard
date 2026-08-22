import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient } from "pg";
import { recalculateAutomaticDeck } from "./automaticDeckService.js";

const elements = ["fire", "fire", "fire", "water", "water", "air", "air", "earth", "earth"] as const;

test("an unchanged best deck performs no persistence queries", async () => {
  const inventoryRows = elements.map((element, index) => {
    const sequence = String(index + 1).padStart(2, "0");
    return {
      card_id: `starter_${sequence}`,
      code: `starter_${sequence}`,
      element,
      power: 12,
      quantity: 1,
    };
  });
  const slotRows = inventoryRows.map((card, index) => ({
    card_id: card.card_id,
    element: card.element,
    slot: index + 1,
  }));
  const persistenceQueries: string[] = [];
  const client = {
    async query(queryText: string) {
      const normalized = queryText.replace(/\s+/g, " ").trim();
      if (normalized.startsWith("SELECT id FROM players")) return { rows: [{ id: "player-1" }] };
      if (normalized.includes("FROM player_cards")) return { rows: inventoryRows };
      if (normalized.startsWith("SELECT id FROM player_decks")) return { rows: [{ id: "deck-1" }] };
      if (normalized.includes("FROM deck_slots")) return { rows: slotRows };
      if (/^(INSERT|UPDATE|DELETE) /.test(normalized)) persistenceQueries.push(normalized);
      return { rows: [] };
    },
  } as unknown as PoolClient;

  const result = await recalculateAutomaticDeck(client, "player-1");

  assert.deepEqual(result, {
    status: "unchanged",
    cardIds: inventoryRows.map(({ card_id: cardId }) => cardId),
    totalPower: 108,
  });
  assert.deepEqual(persistenceQueries, []);
});
