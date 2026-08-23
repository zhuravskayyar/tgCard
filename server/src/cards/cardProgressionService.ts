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
  getPlayerCollectionModifiers,
} from "@cardastika/game-core";
import type {
  AbsorptionCandidatesResponse,
  AbsorptionPreviewResponse,
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

const PAGE_SIZE = 9 as const;
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
  player_card_instances.stored_elements,
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
  | "maximum_level";

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

function toProgressionView(card: PlayerCardInstance, availableGold: number): CardProgressionView {
  const progress = getUpgradeProgress(card.levelProgressElements);
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

  const fodder = fodderInstanceIds.map((id) => {
    const row = byId.get(id);
    if (!row) throw new CardProgressionDomainError("fodder_not_found", "A fodder card no longer exists");
    if (row.player_id !== playerId) {
      throw new CardProgressionDomainError("fodder_not_owned", "A fodder card belongs to another player");
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
    levelProgressElements: toNonNegativeInteger(row.level_progress_elements, "fodder progress"),
    storedElements: toNonNegativeInteger(row.stored_elements, "fodder stored elements"),
  }));
  if (transferableValues.some((value) => value === null)) {
    throw new CardProgressionDomainError(
      "unsupported_level_data",
      "The canonical elemental value for a selected card level is unknown",
    );
  }
  const baseElements = transferableValues.reduce<number>((total, value) => total + (value ?? 0), 0);
  const modifiers = getPlayerCollectionModifiers(
    await getCompletedCollectionModifiers(database, playerId),
  );
  return {
    target,
    fodder,
    addedElements: applyAbsorptionEfficiency(baseElements, modifiers),
  };
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
      const before = getUpgradeProgress(targetCard.levelProgressElements);
      const afterState = applyElementalPotential({
        level: targetCard.level,
        levelProgressElements: targetCard.levelProgressElements,
        storedElements: targetCard.storedElements,
      }, validated.addedElements);
      return {
        addedElements: validated.addedElements,
        afterPercent: getUpgradeProgress(afterState.levelProgressElements).percent,
        beforePercent: before.percent,
        resultingStoredElements: afterState.storedElements,
        selectedCards: validated.fodder.length,
      };
    } catch (error) {
      if (error instanceof CardProgressionDomainError) throw error;
      throw new CardProgressionPersistenceError({ cause: error });
    }
  }

  async absorb(
    playerId: string,
    targetInstanceId: string,
    fodderInstanceIds: readonly string[],
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
      await client.query(
        "DELETE FROM player_card_instances WHERE id = ANY($1::uuid[])",
        [fodderInstanceIds],
      );
      await recalculateAutomaticDeck(client, playerId);
      await this.campaign?.recordEvent(client, playerId, "CARD_ABSORBED", {
        absorbedCards: fodderInstanceIds.length,
      });
      const gold = toNonNegativeInteger(player.gold, "player gold");
      const detail = await loadDetail(client, playerId, targetInstanceId, gold);
      await client.query("COMMIT");
      return { ...detail, consumedInstanceIds: [...fodderInstanceIds], playerGold: gold };
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
      await recalculateAutomaticDeck(client, playerId);
      await this.campaign?.recordEvent(client, playerId, "CARD_LEVEL_UP");
      const detail = await loadDetail(client, playerId, targetInstanceId, nextGold);
      await client.query("COMMIT");
      return { ...detail, consumedInstanceIds: [], playerGold: nextGold };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof CardProgressionDomainError) throw error;
      throw new CardProgressionPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }
}
