import { randomUUID } from "node:crypto";
import {
  buildBestValidDeck,
  validateDeckElementBalance,
  type OwnedDeckCard,
} from "@cardastika/game-core";
import type { PlayerCard } from "@cardastika/shared";
import type { Pool, PoolClient } from "pg";

interface DeckIdRow {
  id: string;
}

interface CurrentDeckSlotRow {
  card_id: string;
  element: PlayerCard["element"];
  slot: number;
}

interface InventoryDeckCardRow {
  card_id: string;
  code: string;
  element: PlayerCard["element"];
  power: string | number;
  quantity: string | number;
}

interface PlayerIdRow {
  id: string;
}

export type AutomaticDeckRecalculationResult =
  | {
      cardIds: string[];
      status: "unchanged" | "updated";
      totalPower: number;
    }
  | {
      preservedCurrentDeck: boolean;
      status: "insufficient_valid_cards";
    };

function toPositiveInteger(value: string | number, field: "power" | "quantity") {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${field} returned while recalculating deck`);
  }
  return parsed;
}

function currentDeckIsValid(
  slots: readonly CurrentDeckSlotRow[],
  inventory: readonly OwnedDeckCard[],
) {
  if (!validateDeckElementBalance(slots).valid) return false;
  if (slots.some(({ slot }, index) => slot !== index + 1)) return false;

  const ownedQuantities = new Map(inventory.map(({ cardId, quantity }) => [cardId, quantity]));
  const selectedQuantities = new Map<string, number>();
  for (const { card_id: cardId } of slots) {
    const selected = (selectedQuantities.get(cardId) ?? 0) + 1;
    if (selected > (ownedQuantities.get(cardId) ?? 0)) return false;
    selectedQuantities.set(cardId, selected);
  }
  return true;
}

export async function recalculateAutomaticDeck(
  client: PoolClient,
  playerId: string,
): Promise<AutomaticDeckRecalculationResult> {
  // Inventory mutations call this before committing so inventory and deck stay atomic.
  const playerLock = await client.query<PlayerIdRow>(
    "SELECT id FROM players WHERE id = $1 FOR UPDATE",
    [playerId],
  );
  if (!playerLock.rows[0]) {
    throw new Error("Cannot recalculate deck for a missing player");
  }

  const inventoryResult = await client.query<InventoryDeckCardRow>(
    `
      SELECT
        player_cards.card_id,
        cards.code,
        cards.element,
        cards.power,
        player_cards.quantity
      FROM player_cards
      INNER JOIN cards ON cards.id = player_cards.card_id
      WHERE player_cards.player_id = $1
      ORDER BY cards.code, cards.id
      FOR SHARE OF player_cards
    `,
    [playerId],
  );
  const inventory: OwnedDeckCard[] = inventoryResult.rows.map((row) => ({
    cardId: row.card_id,
    code: row.code,
    element: row.element,
    power: toPositiveInteger(row.power, "power"),
    quantity: toPositiveInteger(row.quantity, "quantity"),
  }));

  const deckResult = await client.query<DeckIdRow>(
    "SELECT id FROM player_decks WHERE player_id = $1 FOR UPDATE",
    [playerId],
  );
  const currentDeck = deckResult.rows[0] ?? null;
  const currentSlots = currentDeck
    ? (await client.query<CurrentDeckSlotRow>(
        `
          SELECT deck_slots.slot, deck_slots.card_id, cards.element
          FROM deck_slots
          INNER JOIN cards ON cards.id = deck_slots.card_id
          WHERE deck_slots.deck_id = $1
          ORDER BY deck_slots.slot
        `,
        [currentDeck.id],
      )).rows
    : [];
  const bestDeck = buildBestValidDeck(inventory);

  if (bestDeck.status === "insufficient_valid_cards") {
    return {
      status: "insufficient_valid_cards",
      preservedCurrentDeck: currentDeckIsValid(currentSlots, inventory),
    };
  }

  const desiredCardIds = bestDeck.cards.map(({ cardId }) => cardId);
  const isUnchanged = currentSlots.length === desiredCardIds.length && currentSlots.every(
    ({ card_id: cardId, slot }, index) => slot === index + 1 && cardId === desiredCardIds[index],
  );
  if (isUnchanged) {
    return {
      status: "unchanged",
      cardIds: desiredCardIds,
      totalPower: bestDeck.totalPower,
    };
  }

  const deckId = currentDeck?.id ?? randomUUID();
  if (!currentDeck) {
    await client.query(
      "INSERT INTO player_decks (id, player_id) VALUES ($1, $2)",
      [deckId, playerId],
    );
  }

  await client.query("DELETE FROM deck_slots WHERE deck_id = $1", [deckId]);
  await client.query(
    `
      INSERT INTO deck_slots (deck_id, slot, card_id)
      SELECT $1, input.slot, input.card_id
      FROM unnest($2::smallint[], $3::text[]) AS input(slot, card_id)
    `,
    [deckId, desiredCardIds.map((_, index) => index + 1), desiredCardIds],
  );
  await client.query("UPDATE player_decks SET updated_at = NOW() WHERE id = $1", [deckId]);

  return {
    status: "updated",
    cardIds: desiredCardIds,
    totalPower: bestDeck.totalPower,
  };
}

export async function recalculateAutomaticDeckForPlayer(pool: Pool, playerId: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await recalculateAutomaticDeck(client, playerId);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function recalculateAllAutomaticDecks(pool: Pool) {
  const client = await pool.connect();
  const summary = { updated: 0, unchanged: 0, insufficientValidCards: 0 };

  try {
    await client.query("BEGIN");
    const players = await client.query<PlayerIdRow>("SELECT id FROM players ORDER BY id");
    for (const player of players.rows) {
      const result = await recalculateAutomaticDeck(client, player.id);
      if (result.status === "updated") summary.updated += 1;
      else if (result.status === "unchanged") summary.unchanged += 1;
      else summary.insufficientValidCards += 1;
    }
    await client.query("COMMIT");
    return summary;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
