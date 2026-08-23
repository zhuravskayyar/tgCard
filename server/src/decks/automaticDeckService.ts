import { randomUUID } from "node:crypto";
import {
  buildBestValidDeck,
  getCardPower,
  validateDeckElementBalance,
  type OwnedDeckCard,
} from "@cardastika/game-core";
import type { PlayerCardInstance } from "@cardastika/shared";
import type { Pool, PoolClient } from "pg";

interface DeckIdRow { id: string }
interface PlayerIdRow { id: string }

interface CurrentDeckSlotRow {
  card_instance_id: string;
  element: PlayerCardInstance["element"];
  slot: number;
}

interface InventoryDeckCardRow {
  bonus_power: string | number;
  card_id: string;
  code: string;
  element: PlayerCardInstance["element"];
  instance_id: string;
  level: string | number;
}

export type AutomaticDeckRecalculationResult =
  | {
      instanceIds: string[];
      status: "unchanged" | "updated";
      totalPower: number;
    }
  | {
      preservedCurrentDeck: boolean;
      status: "insufficient_valid_cards";
    };

function toInteger(value: string | number, field: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`Invalid ${field} while recalculating deck`);
  return parsed;
}

function currentDeckIsValid(
  slots: readonly CurrentDeckSlotRow[],
  inventory: readonly OwnedDeckCard[],
) {
  if (!validateDeckElementBalance(slots).valid) return false;
  if (slots.some(({ slot }, index) => slot !== index + 1)) return false;
  const ownedInstanceIds = new Set(inventory.map(({ instanceId }) => instanceId));
  return slots.every(({ card_instance_id: instanceId }) => ownedInstanceIds.has(instanceId));
}

export async function recalculateAutomaticDeck(
  client: PoolClient,
  playerId: string,
): Promise<AutomaticDeckRecalculationResult> {
  const playerLock = await client.query<PlayerIdRow>(
    "SELECT id FROM players WHERE id = $1 FOR UPDATE",
    [playerId],
  );
  if (!playerLock.rows[0]) throw new Error("Cannot recalculate deck for a missing player");

  const inventoryResult = await client.query<InventoryDeckCardRow>(
    `
      SELECT
        player_card_instances.id AS instance_id,
        player_card_instances.card_id,
        cards.code,
        cards.element,
        player_card_instances.level,
        player_card_instances.bonus_power
      FROM player_card_instances
      INNER JOIN cards ON cards.id = player_card_instances.card_id
      WHERE player_card_instances.player_id = $1
      ORDER BY cards.code, cards.id, player_card_instances.id
      FOR SHARE OF player_card_instances
    `,
    [playerId],
  );
  const inventory: OwnedDeckCard[] = inventoryResult.rows.map((row) => {
    const level = toInteger(row.level, "level");
    const bonusPower = toInteger(row.bonus_power, "bonus power");
    return {
      instanceId: row.instance_id,
      cardId: row.card_id,
      code: row.code,
      element: row.element,
      finalPower: getCardPower({ level, bonusPower }),
    };
  });

  const deckResult = await client.query<DeckIdRow>(
    "SELECT id FROM player_decks WHERE player_id = $1 FOR UPDATE",
    [playerId],
  );
  const currentDeck = deckResult.rows[0] ?? null;
  const currentSlots = currentDeck
    ? (await client.query<CurrentDeckSlotRow>(
        `
          SELECT deck_slots.slot, deck_slots.card_instance_id, cards.element
          FROM deck_slots
          INNER JOIN player_card_instances
            ON player_card_instances.id = deck_slots.card_instance_id
          INNER JOIN cards ON cards.id = player_card_instances.card_id
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

  const desiredInstanceIds = bestDeck.cards.map(({ instanceId }) => instanceId);
  const isUnchanged = currentSlots.length === desiredInstanceIds.length && currentSlots.every(
    ({ card_instance_id: instanceId, slot }, index) => (
      slot === index + 1 && instanceId === desiredInstanceIds[index]
    ),
  );
  if (isUnchanged) {
    return { status: "unchanged", instanceIds: desiredInstanceIds, totalPower: bestDeck.totalPower };
  }

  const deckId = currentDeck?.id ?? randomUUID();
  if (!currentDeck) {
    await client.query("INSERT INTO player_decks (id, player_id) VALUES ($1, $2)", [deckId, playerId]);
  }

  await client.query("DELETE FROM deck_slots WHERE deck_id = $1", [deckId]);
  await client.query(
    `
      INSERT INTO deck_slots (deck_id, slot, card_instance_id)
      SELECT $1, input.slot, input.card_instance_id
      FROM unnest($2::smallint[], $3::uuid[]) AS input(slot, card_instance_id)
    `,
    [deckId, desiredInstanceIds.map((_, index) => index + 1), desiredInstanceIds],
  );
  await client.query("UPDATE player_decks SET updated_at = NOW() WHERE id = $1", [deckId]);
  return { status: "updated", instanceIds: desiredInstanceIds, totalPower: bestDeck.totalPower };
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
