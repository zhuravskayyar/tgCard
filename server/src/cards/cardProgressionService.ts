import {
  MAX_CARD_LEVEL,
  advanceCardLevel,
  applyAbsorptionEfficiency,
  applyElementalPotential,
  canLevelUp,
  getCardLevelTableEntry,
  getCardPower,
  getTransferableElementValue,
  getUpgradeProgress,
  isGoldLevel,
  isMagicSourceCode,
  getPlayerCollectionModifiers,
  selectBulkAbsorption,
} from "@cardastika/game-core";
import type {
  AbsorptionCandidatesResponse,
  AbsorptionPreviewResponse,
  BulkAbsorptionPreviewResponse,
  CardProgressionActionResponse,
  CardProgressionView,
  PlayerCardDetailResponse,
  PlayerCardInstance,
} from "@cardastika/shared";
import type { Pool, PoolClient } from "pg";
import type { CampaignService } from "../campaign/campaignService.js";
import { mapCardInstanceRow, type CardInstanceProjectionRow } from "./cardInstanceMapper.js";
import { recalculateAutomaticDeck } from "../decks/automaticDeckService.js";
import type { InventoryRepository } from "../inventory/inventoryRepository.js";
import { getCompletedCollectionModifiers } from "../collections/discoveryService.js";

const PAGE_SIZE = 5 as const;
const MAX_FODDER_CARDS = 100;

interface ProgressionCardRow extends CardInstanceProjectionRow {
  in_active_deck?: boolean;
  player_id: string;
}

interface PlayerGoldRow {
  gold: string | number;
  id: string;
}

type Queryable = Pick<PoolClient, "query">;

const CARD_PROJECTION = `
  player_card_instances.id AS instance_id,
  player_card_instances.player_id,
  cards.id AS card_id,
  cards.code,
  cards.display_name,
  cards.art_key,
  cards.element,
  player_card_instances.level,
  player_card_instances.bonus_power,
  player_card_instances.level_progress_elements,
  player_card_instances.protected_from_absorption,
  player_card_instances.stored_elements,
  cards.limited,
  cards.collection_id
`;

export type CardProgressionErrorCode =
  | "target_not_found"
  | "fodder_not_found"
  | "fodder_not_owned"
  | "fodder_in_deck"
  | "target_is_fodder"
  | "different_element"
  | "unsupported_level_data"
  | "insufficient_gold"
  | "insufficient_elements"
  | "maximum_level"
  | "protected_card"
  | "nothing_to_absorb"
  | "magic_source";

function assertNotMagicSource(code: string) {
  if (isMagicSourceCode(code)) {
    throw new CardProgressionDomainError("magic_source", "A magic source cannot level up or absorb cards");
  }
}

export class CardProgressionDomainError extends Error {
  constructor(public readonly code: CardProgressionErrorCode, message: string) {
    super(message);
    this.name = "CardProgressionDomainError";
  }
}

export class CardProgressionPersistenceError extends Error {
  constructor(options?: ErrorOptions) {
    super("Card progression persistence is unavailable", options);
    this.name = "CardProgressionPersistenceError";
  }
}

function toNonNegativeInteger(value: string | number, field: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${field} returned by database`);
  return parsed;
}

function toProgressNumber(value: string | number, field: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  const rounded = Math.round(parsed * 100);
  if (
    !Number.isFinite(parsed)
    || parsed < 0
    || !Number.isSafeInteger(rounded)
    || Math.abs(parsed - rounded / 100) > 1e-9
  ) {
    throw new Error(`Invalid ${field} returned by database`);
  }
  return parsed;
}

/** Level-up state of a card against the gold that pays for it (the player's, or the guild treasury's). */
export function toProgressionView(card: PlayerCardInstance, availableGold: number): CardProgressionView {
  const progress = getUpgradeProgress(card.levelProgressElements, card.level);
  if (card.level === MAX_CARD_LEVEL) {
    return {
      availability: "maximum_level",
      filledElements: progress.filledElements,
      isGoldLevel: false,
      minimumGoldCost: null,
      percent: progress.percent,
      powerAfterLevel: null,
      powerIncrease: null,
      requiredElements: progress.requiredElements,
      requiredGold: 0,
      storedOverflowElements: card.storedElements,
      targetLevel: null,
    };
  }

  const targetLevel = card.level + 1;
  const target = getCardLevelTableEntry(targetLevel);
  const availability = canLevelUp({
    level: card.level,
    levelProgressElements: card.levelProgressElements,
    storedElements: card.storedElements,
  }, availableGold);
  const powerAfterLevel = getCardPower({ level: targetLevel, bonusPower: card.bonusPower });
  return {
    availability: availability.availability,
    filledElements: progress.filledElements,
    isGoldLevel: isGoldLevel(targetLevel),
    minimumGoldCost: target.minimumGoldCost,
    percent: progress.percent,
    powerAfterLevel,
    powerIncrease: powerAfterLevel - card.finalPower,
    requiredElements: progress.requiredElements,
    requiredGold: availability.requiredGold,
    storedOverflowElements: card.storedElements,
    targetLevel,
  };
}

async function loadDetail(
  database: Queryable,
  playerId: string,
  instanceId: string,
  knownGold?: number,
): Promise<PlayerCardDetailResponse> {
  const result = await database.query<ProgressionCardRow>(
    `
      SELECT ${CARD_PROJECTION},
        EXISTS (
          SELECT 1
          FROM player_decks
          INNER JOIN deck_slots ON deck_slots.deck_id = player_decks.id
          WHERE player_decks.player_id = $1
            AND deck_slots.card_instance_id = player_card_instances.id
        ) AS in_active_deck
      FROM player_card_instances
      INNER JOIN cards ON cards.id = player_card_instances.card_id
      WHERE player_card_instances.player_id = $1
        AND player_card_instances.id = $2
    `,
    [playerId, instanceId],
  );
  const row = result.rows[0];
  if (!row) throw new CardProgressionDomainError("target_not_found", "Owned card instance was not found");
  const gold = knownGold ?? toNonNegativeInteger((await database.query<PlayerGoldRow>(
    "SELECT id, gold FROM players WHERE id = $1",
    [playerId],
  )).rows[0]?.gold ?? -1, "player gold");
  const card = mapCardInstanceRow(row);
  return {
    card,
    inActiveDeck: Boolean(row.in_active_deck),
    progression: toProgressionView(card, gold),
  };
}

function assertFodderIds(fodderInstanceIds: readonly string[]) {
  if (
    fodderInstanceIds.length < 1 ||
    fodderInstanceIds.length > MAX_FODDER_CARDS ||
    fodderInstanceIds.some((id) => !id) ||
    new Set(fodderInstanceIds).size !== fodderInstanceIds.length
  ) {
    throw new CardProgressionDomainError("fodder_not_found", "Fodder IDs must be unique owned card instances");
  }
}

async function loadValidatedAbsorption(
  database: Queryable,
  playerId: string,
  targetInstanceId: string,
  fodderInstanceIds: readonly string[],
  lock: boolean,
) {
  assertFodderIds(fodderInstanceIds);
  if (fodderInstanceIds.includes(targetInstanceId)) {
    throw new CardProgressionDomainError("target_is_fodder", "A card cannot absorb itself");
  }
  const requestedIds = [targetInstanceId, ...fodderInstanceIds].sort();
  const result = await database.query<ProgressionCardRow>(
    `
      SELECT ${CARD_PROJECTION}
      FROM player_card_instances
      INNER JOIN cards ON cards.id = player_card_instances.card_id
      WHERE player_card_instances.id = ANY($1::uuid[])
      ORDER BY player_card_instances.id
      ${lock ? "FOR UPDATE OF player_card_instances" : ""}
    `,
    [requestedIds],
  );
  const byId = new Map(result.rows.map((row) => [row.instance_id, row]));
  const target = byId.get(targetInstanceId);
  if (!target || target.player_id !== playerId) {
    throw new CardProgressionDomainError("target_not_found", "Owned target card was not found");
  }
  assertNotMagicSource(target.code);

  const fodder = fodderInstanceIds.map((id) => {
    const row = byId.get(id);
    if (!row) throw new CardProgressionDomainError("fodder_not_found", "A fodder card no longer exists");
    if (row.player_id !== playerId) {
      throw new CardProgressionDomainError("fodder_not_owned", "A fodder card belongs to another player");
    }
    if (row.protected_from_absorption) {
      throw new CardProgressionDomainError("protected_card", "A protected card cannot be absorbed");
    }
    if (row.element !== target.element) {
      throw new CardProgressionDomainError("different_element", "Only cards of the same element can be absorbed");
    }
    return row;
  });

  const activeResult = await database.query<{ card_instance_id: string }>(
    `
      SELECT deck_slots.card_instance_id
      FROM player_decks
      INNER JOIN deck_slots ON deck_slots.deck_id = player_decks.id
      WHERE player_decks.player_id = $1
        AND deck_slots.card_instance_id = ANY($2::uuid[])
    `,
    [playerId, fodderInstanceIds],
  );
  if (activeResult.rows.length > 0) {
    throw new CardProgressionDomainError("fodder_in_deck", "Active battle-deck cards cannot be consumed");
  }

  const transferableValues = fodder.map((row) => getTransferableElementValue({
    level: toNonNegativeInteger(row.level, "fodder level"),
    levelProgressElements: toProgressNumber(row.level_progress_elements, "fodder progress"),
    storedElements: toProgressNumber(row.stored_elements, "fodder stored elements"),
  }));
  const baseElements = transferableValues.reduce((total, value) => total + value, 0);
  const modifiers = getPlayerCollectionModifiers(
    await getCompletedCollectionModifiers(database, playerId),
    "absorption",
  );
  return {
    target,
    fodder,
    addedElements: applyAbsorptionEfficiency(baseElements, modifiers),
  };
}

/**
 * Picks the fodder for "Поглинути слабкі" from the player's current weak cards of the target's element
 * (outside the active deck, unprotected). With `lock` the rows stay locked for the absorbing transaction.
 */
async function selectBulkFodderIds(
  database: Queryable,
  playerId: string,
  target: ProgressionCardRow,
  lock: boolean,
) {
  assertNotMagicSource(target.code);
  const targetCard = mapCardInstanceRow(target);
  if (targetCard.level === MAX_CARD_LEVEL) return [];
  const progress = getUpgradeProgress(targetCard.levelProgressElements, targetCard.level);
  const remaining = progress.requiredElements - progress.filledElements - targetCard.storedElements;
  if (remaining <= 0) return [];
  const result = await database.query<ProgressionCardRow>(
    `
      SELECT ${CARD_PROJECTION}
      FROM player_card_instances
      INNER JOIN cards ON cards.id = player_card_instances.card_id
      WHERE player_card_instances.player_id = $1
        AND player_card_instances.id <> $2
        AND cards.element = $3
        AND player_card_instances.protected_from_absorption = FALSE
        AND NOT EXISTS (
          SELECT 1
          FROM player_decks
          INNER JOIN deck_slots ON deck_slots.deck_id = player_decks.id
          WHERE player_decks.player_id = $1
            AND deck_slots.card_instance_id = player_card_instances.id
        )
      ORDER BY player_card_instances.id
      ${lock ? "FOR UPDATE OF player_card_instances" : ""}
    `,
    [playerId, target.instance_id, target.element],
  );
  if (result.rows.length === 0) return [];
  const modifiers = getPlayerCollectionModifiers(
    await getCompletedCollectionModifiers(database, playerId),
    "absorption",
  );
  return selectBulkAbsorption(
    result.rows.map((row) => ({
      id: row.instance_id,
      transferableElements: getTransferableElementValue({
        level: toNonNegativeInteger(row.level, "fodder level"),
        levelProgressElements: toProgressNumber(row.level_progress_elements, "fodder progress"),
        storedElements: toProgressNumber(row.stored_elements, "fodder stored elements"),
      }),
    })),
    remaining,
    (base) => applyAbsorptionEfficiency(base, modifiers),
    MAX_FODDER_CARDS,
  );
}

async function loadOwnedTarget(database: Queryable, playerId: string, instanceId: string, lock: boolean) {
  const result = await database.query<ProgressionCardRow>(
    `SELECT ${CARD_PROJECTION}
     FROM player_card_instances
     INNER JOIN cards ON cards.id = player_card_instances.card_id
     WHERE player_card_instances.player_id = $1 AND player_card_instances.id = $2
     ${lock ? "FOR UPDATE OF player_card_instances" : ""}`,
    [playerId, instanceId],
  );
  const row = result.rows[0];
  if (!row) throw new CardProgressionDomainError("target_not_found", "Owned target card was not found");
  return row;
}

export class CardProgressionService {
  constructor(
    private readonly pool: Pool,
    private readonly inventory: Pick<InventoryRepository, "findWeakPageByPlayerId">,
    private readonly campaign?: Pick<CampaignService, "recordEvent">,
  ) {}

  async getDetail(playerId: string, instanceId: string) {
    try {
      return await loadDetail(this.pool, playerId, instanceId);
    } catch (error) {
      if (error instanceof CardProgressionDomainError) throw error;
      throw new CardProgressionPersistenceError({ cause: error });
    }
  }

  async toggleProtection(playerId: string, instanceId: string) {
    try {
      const playerResult = await this.pool.query<PlayerGoldRow>(
        "SELECT id, gold FROM players WHERE id = $1",
        [playerId],
      );
      const player = playerResult.rows[0];
      if (!player) throw new CardProgressionDomainError("target_not_found", "Owned target card was not found");
      const result = await this.pool.query<{ id: string; protected_from_absorption: boolean }>(
        `
          UPDATE player_card_instances
          SET protected_from_absorption = NOT protected_from_absorption
          WHERE player_id = $1 AND id = $2
          RETURNING id, protected_from_absorption
        `,
        [playerId, instanceId],
      );
      if (!result.rows[0]) throw new CardProgressionDomainError("target_not_found", "Owned target card was not found");
      const playerGold = toNonNegativeInteger(player.gold, "player gold");
      return {
        ...(await loadDetail(this.pool, playerId, instanceId, playerGold)),
        consumedInstanceIds: [],
        playerGold,
      };
    } catch (error) {
      if (error instanceof CardProgressionDomainError) throw error;
      throw new CardProgressionPersistenceError({ cause: error });
    }
  }

  async getAbsorptionCandidates(
    playerId: string,
    targetInstanceId: string,
    page: number,
  ): Promise<AbsorptionCandidatesResponse> {
    try {
      const targetResult = await this.pool.query<ProgressionCardRow>(
        `SELECT ${CARD_PROJECTION}
         FROM player_card_instances
         INNER JOIN cards ON cards.id = player_card_instances.card_id
         WHERE player_card_instances.player_id = $1 AND player_card_instances.id = $2`,
        [playerId, targetInstanceId],
      );
      const target = targetResult.rows[0];
      if (!target) throw new CardProgressionDomainError("target_not_found", "Owned target card was not found");
      if (isMagicSourceCode(target.code)) return { cards: [], page, pageSize: PAGE_SIZE, totalCards: 0, totalPages: 0 };
      const result = await this.inventory.findWeakPageByPlayerId(
        playerId,
        page,
        PAGE_SIZE,
        target.element,
        targetInstanceId,
      );
      return {
        cards: result.cards,
        page,
        pageSize: PAGE_SIZE,
        totalCards: result.totalCards,
        totalPages: Math.ceil(result.totalCards / PAGE_SIZE),
      };
    } catch (error) {
      if (error instanceof CardProgressionDomainError) throw error;
      throw new CardProgressionPersistenceError({ cause: error });
    }
  }

  /** Preview for "Поглинути слабкі": which cards the server would take and the resulting progress. */
  async previewBulkAbsorption(playerId: string, targetInstanceId: string): Promise<BulkAbsorptionPreviewResponse> {
    let fodderInstanceIds: string[];
    let target: ProgressionCardRow;
    try {
      target = await loadOwnedTarget(this.pool, playerId, targetInstanceId, false);
      fodderInstanceIds = await selectBulkFodderIds(this.pool, playerId, target, false);
    } catch (error) {
      if (error instanceof CardProgressionDomainError) throw error;
      throw new CardProgressionPersistenceError({ cause: error });
    }
    if (fodderInstanceIds.length > 0) {
      return { ...(await this.previewAbsorption(playerId, targetInstanceId, fodderInstanceIds)), fodderInstanceIds };
    }
    const card = mapCardInstanceRow(target);
    const progress = getUpgradeProgress(card.levelProgressElements, card.level);
    return {
      addedElements: 0,
      afterElements: progress.filledElements,
      afterPercent: progress.percent,
      beforeElements: progress.filledElements,
      beforePercent: progress.percent,
      fodderInstanceIds: [],
      requiredElements: progress.requiredElements,
      resultingStoredElements: card.storedElements,
      selectedCards: 0,
    };
  }

  async previewAbsorption(
    playerId: string,
    targetInstanceId: string,
    fodderInstanceIds: readonly string[],
  ): Promise<AbsorptionPreviewResponse> {
    try {
      const validated = await loadValidatedAbsorption(
        this.pool,
        playerId,
        targetInstanceId,
        fodderInstanceIds,
        false,
      );
      const targetCard = mapCardInstanceRow(validated.target);
      const before = getUpgradeProgress(targetCard.levelProgressElements, targetCard.level);
      const afterState = applyElementalPotential({
        level: targetCard.level,
        levelProgressElements: targetCard.levelProgressElements,
        storedElements: targetCard.storedElements,
      }, validated.addedElements);
      const after = getUpgradeProgress(afterState.levelProgressElements, targetCard.level);
      return {
        addedElements: validated.addedElements,
        afterPercent: after.percent,
        afterElements: after.filledElements,
        beforePercent: before.percent,
        beforeElements: before.filledElements,
        requiredElements: before.requiredElements,
        resultingStoredElements: afterState.storedElements,
        selectedCards: validated.fodder.length,
      };
    } catch (error) {
      if (error instanceof CardProgressionDomainError) throw error;
      throw new CardProgressionPersistenceError({ cause: error });
    }
  }

  /** "Поглинути слабкі": the server picks the fodder itself and absorbs it in one transaction. */
  async absorbWeak(playerId: string, targetInstanceId: string): Promise<CardProgressionActionResponse> {
    return this.absorb(playerId, targetInstanceId, null);
  }

  /** `requestedFodderIds === null` lets the server choose the fodder for the bulk action under the same locks. */
  async absorb(
    playerId: string,
    targetInstanceId: string,
    requestedFodderIds: readonly string[] | null,
  ): Promise<CardProgressionActionResponse> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const playerResult = await client.query<PlayerGoldRow>(
        "SELECT id, gold FROM players WHERE id = $1 FOR UPDATE",
        [playerId],
      );
      const player = playerResult.rows[0];
      if (!player) throw new Error("Progression player is missing");
      const fodderInstanceIds = requestedFodderIds
        ?? await selectBulkFodderIds(client, playerId, await loadOwnedTarget(client, playerId, targetInstanceId, true), true);
      if (fodderInstanceIds.length === 0) {
        throw new CardProgressionDomainError("nothing_to_absorb", "No weak cards fit into the current level");
      }
      const validated = await loadValidatedAbsorption(
        client,
        playerId,
        targetInstanceId,
        fodderInstanceIds,
        true,
      );
      const targetCard = mapCardInstanceRow(validated.target);
      const afterState = applyElementalPotential({
        level: targetCard.level,
        levelProgressElements: targetCard.levelProgressElements,
        storedElements: targetCard.storedElements,
      }, validated.addedElements);
      await client.query(
        `UPDATE player_card_instances
         SET level_progress_elements = $2, stored_elements = $3
         WHERE id = $1`,
        [targetInstanceId, afterState.levelProgressElements, afterState.storedElements],
      );
      const deleted = await client.query<{ id: string }>(
        "DELETE FROM player_card_instances WHERE id = ANY($1::uuid[]) RETURNING id",
        [fodderInstanceIds],
      );
      if (deleted.rowCount !== fodderInstanceIds.length) {
        throw new CardProgressionPersistenceError();
      }
      const deckResult = await recalculateAutomaticDeck(client, playerId);
      await this.campaign?.recordEvent(client, playerId, "CARD_ABSORBED", {
        absorbedCards: fodderInstanceIds.length,
      });
      const gold = toNonNegativeInteger(player.gold, "player gold");
      const detail = await loadDetail(client, playerId, targetInstanceId, gold);
      await client.query("COMMIT");
      return {
        ...detail,
        consumedInstanceIds: [...fodderInstanceIds],
        deckPower: deckResult.status === "insufficient_valid_cards" ? undefined : deckResult.totalPower,
        playerGold: gold,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof CardProgressionDomainError) throw error;
      throw new CardProgressionPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }

  async levelUp(playerId: string, targetInstanceId: string): Promise<CardProgressionActionResponse> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const playerResult = await client.query<PlayerGoldRow>(
        "SELECT id, gold FROM players WHERE id = $1 FOR UPDATE",
        [playerId],
      );
      const player = playerResult.rows[0];
      if (!player) throw new Error("Progression player is missing");
      const targetResult = await client.query<ProgressionCardRow>(
        `SELECT ${CARD_PROJECTION}
         FROM player_card_instances
         INNER JOIN cards ON cards.id = player_card_instances.card_id
         WHERE player_card_instances.player_id = $1 AND player_card_instances.id = $2
         FOR UPDATE OF player_card_instances`,
        [playerId, targetInstanceId],
      );
      const targetRow = targetResult.rows[0];
      if (!targetRow) throw new CardProgressionDomainError("target_not_found", "Owned target card was not found");
      assertNotMagicSource(targetRow.code);
      const target = mapCardInstanceRow(targetRow);
      const availableGold = toNonNegativeInteger(player.gold, "player gold");
      const levelAvailability = canLevelUp({
        level: target.level,
        levelProgressElements: target.levelProgressElements,
        storedElements: target.storedElements,
      }, availableGold);
      if (levelAvailability.availability === "maximum_level") {
        throw new CardProgressionDomainError("maximum_level", "Card is already at maximum level");
      }
      if (levelAvailability.availability === "unsupported_level_data" || levelAvailability.requiredGold === null) {
        throw new CardProgressionDomainError(
          "unsupported_level_data",
          "Canonical upgrade economy data is unknown for this target level",
        );
      }
      if (levelAvailability.availability === "insufficient_gold") {
        throw new CardProgressionDomainError("insufficient_gold", "Player does not have enough gold");
      }
      if (levelAvailability.availability === "insufficient_elements") {
        throw new CardProgressionDomainError("insufficient_elements", "Card does not have enough magic elements");
      }
      const next = advanceCardLevel({
        level: target.level,
        levelProgressElements: target.levelProgressElements,
        storedElements: target.storedElements,
      });
      const nextGold = availableGold - levelAvailability.requiredGold;
      await client.query("UPDATE players SET gold = $2, updated_at = NOW() WHERE id = $1", [playerId, nextGold]);
      await client.query(
        `UPDATE player_card_instances
         SET level = $2, level_progress_elements = $3, stored_elements = $4
         WHERE id = $1`,
        [targetInstanceId, next.level, next.levelProgressElements, next.storedElements],
      );
      const deckResult = await recalculateAutomaticDeck(client, playerId);
      await this.campaign?.recordEvent(client, playerId, "CARD_LEVEL_UP");
      const detail = await loadDetail(client, playerId, targetInstanceId, nextGold);
      await client.query("COMMIT");
      return {
        ...detail,
        consumedInstanceIds: [],
        deckPower: deckResult.status === "insufficient_valid_cards" ? undefined : deckResult.totalPower,
        playerGold: nextGold,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof CardProgressionDomainError) throw error;
      throw new CardProgressionPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }
}
