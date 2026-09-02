import { CryptoCardRandomSource, createStandardCardInstance } from "../cards/cardInstanceCreator.js";
import { recordCardDiscovery } from "../collections/discoveryService.js";
import type { CardWorkshopCard, CardWorkshopCraftResponse, CardWorkshopResponse, CardRarity } from "@cardastika/shared";
import type { Pool, PoolClient } from "pg";
import { getRarityLevelRange, selectGeneratedLevelForRarity } from "@cardastika/game-core";
import {
  CARD_CRAFT_COSTS,
  getWorkshopRotation,
  selectWorkshopCardIds,
} from "./cardWorkshopConfig.js";

interface WorkshopCardRow {
  art_key: string | null;
  code: string;
  description: string;
  display_name: string | null;
  element: CardWorkshopCard["element"];
  id: string;
  min_rarity: CardRarity;
}

interface WorkshopPlayerRow {
  card_shards: string | number;
  id: string;
}

export class WorkshopPlayerMissingError extends Error {
  constructor() {
    super("Player does not exist");
    this.name = "WorkshopPlayerMissingError";
  }
}

export class WorkshopCardMissingError extends Error {
  constructor() {
    super("Card is not in the current workshop rotation");
    this.name = "WorkshopCardMissingError";
  }
}

export class InsufficientCardShardsError extends Error {
  constructor() {
    super("Insufficient card shards");
    this.name = "InsufficientCardShardsError";
  }
}

export class WorkshopCatalogUnavailableError extends Error {
  constructor() {
    super("Card workshop catalog is unavailable");
    this.name = "WorkshopCatalogUnavailableError";
  }
}

export class CardWorkshopPersistenceError extends Error {
  constructor(options?: ErrorOptions) {
    super("Card workshop persistence is unavailable");
    if (options?.cause) this.cause = options.cause;
    this.name = "CardWorkshopPersistenceError";
  }
}

function toNonNegativeInteger(value: string | number, field: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${field}`);
  return parsed;
}

function toWorkshopCard(row: WorkshopCardRow, ownedQuantity: number): CardWorkshopCard {
  return {
    cardId: row.id,
    displayName: row.display_name,
    artKey: row.art_key,
    element: row.element,
    rarity: row.min_rarity,
    cost: CARD_CRAFT_COSTS[row.min_rarity],
    ownedQuantity,
  };
}

async function loadWorkshopCards(client: Pick<PoolClient, "query">, now = new Date()) {
  const result = await client.query<WorkshopCardRow>(
    `
      SELECT id, code, display_name, art_key, element, min_rarity, description
      FROM cards
      WHERE shop_eligible = TRUE AND limited = FALSE AND source = 'standard'
      ORDER BY id
    `,
  );
  const rotation = getWorkshopRotation(now);
  const selectedIds = selectWorkshopCardIds(
    result.rows.map((row) => ({ id: row.id, rarity: row.min_rarity })),
    rotation.dateKey,
  );
  if (selectedIds.length !== 6) throw new WorkshopCatalogUnavailableError();
  const selected = new Map(result.rows.map((row) => [row.id, row]));
  const cards = selectedIds.map((id) => selected.get(id)).filter((card): card is WorkshopCardRow => Boolean(card));
  if (cards.length !== 6) throw new WorkshopCatalogUnavailableError();
  return { cards, rotation };
}

export class CardWorkshopService {
  constructor(
    private readonly pool: Pick<Pool, "connect" | "query">,
    private readonly now = () => new Date(),
  ) {}

  async getCatalog(playerId: string): Promise<CardWorkshopResponse> {
    try {
      const playerResult = await this.pool.query<WorkshopPlayerRow>(
        "SELECT id, card_shards FROM players WHERE id = $1",
        [playerId],
      );
      const player = playerResult.rows[0];
      if (!player) throw new WorkshopPlayerMissingError();
      const rotation = getWorkshopRotation(this.now());
      const result = await this.pool.query<WorkshopCardRow>(
        `
          SELECT id, code, display_name, art_key, element, min_rarity, description
          FROM cards
          WHERE shop_eligible = TRUE AND limited = FALSE AND source = 'standard'
          ORDER BY id
        `,
      );
      const selectedIds = selectWorkshopCardIds(
        result.rows.map((row) => ({ id: row.id, rarity: row.min_rarity })),
        rotation.dateKey,
      );
      if (selectedIds.length !== 6) throw new WorkshopCatalogUnavailableError();
      const selectedRows = selectedIds.map((id) => result.rows.find((row) => row.id === id));
      if (selectedRows.some((row) => !row)) throw new WorkshopCatalogUnavailableError();
      const ownedResult = await this.pool.query<{ card_id: string; quantity: string | number }>(
        `
          SELECT card_id, COUNT(*) AS quantity
          FROM player_card_instances
          WHERE player_id = $1 AND card_id = ANY($2::text[])
          GROUP BY card_id
        `,
        [playerId, selectedIds],
      );
      const owned = new Map(ownedResult.rows.map((row) => [row.card_id, toNonNegativeInteger(row.quantity, "owned quantity")]));
      return {
        cardShards: toNonNegativeInteger(player.card_shards, "card shards"),
        rotationEndsAt: rotation.endsAt.toISOString(),
        cards: selectedRows.map((row) => toWorkshopCard(row!, owned.get(row!.id) ?? 0)),
      };
    } catch (error) {
      if (error instanceof WorkshopPlayerMissingError || error instanceof WorkshopCatalogUnavailableError) throw error;
      throw new CardWorkshopPersistenceError({ cause: error });
    }
  }

  async craft(playerId: string, cardId: string): Promise<CardWorkshopCraftResponse> {
    let client: PoolClient;
    try {
      client = await this.pool.connect();
    } catch (error) {
      throw new CardWorkshopPersistenceError({ cause: error });
    }

    try {
      await client.query("BEGIN");
      const playerResult = await client.query<WorkshopPlayerRow>(
        "SELECT id, card_shards FROM players WHERE id = $1 FOR UPDATE",
        [playerId],
      );
      const player = playerResult.rows[0];
      if (!player) throw new WorkshopPlayerMissingError();
      const { cards } = await loadWorkshopCards(client, this.now());
      const definition = cards.find((card) => card.id === cardId);
      if (!definition) throw new WorkshopCardMissingError();
      const cost = CARD_CRAFT_COSTS[definition.min_rarity];
      const currentShards = toNonNegativeInteger(player.card_shards, "card shards");
      if (currentShards < cost) throw new InsufficientCardShardsError();

      const updated = await client.query<{ card_shards: string | number }>(
        `
          UPDATE players
          SET card_shards = card_shards - $2, updated_at = NOW()
          WHERE id = $1 AND card_shards >= $2
          RETURNING card_shards
        `,
        [playerId, cost],
      );
      const updatedPlayer = updated.rows[0];
      if (!updatedPlayer) throw new InsufficientCardShardsError();

      const rng = new CryptoCardRandomSource();
      const level = selectGeneratedLevelForRarity(definition.min_rarity, rng, (rarity, random) => {
        const range = getRarityLevelRange(rarity);
        return range.minimumLevel + random.nextInt(range.maximumLevel - range.minimumLevel + 1);
      });
      await createStandardCardInstance(client, playerId, {
        id: definition.id,
        code: definition.code,
        displayName: definition.display_name,
        description: definition.description,
        artKey: definition.art_key,
        element: definition.element,
        collectionId: null,
        minRarity: definition.min_rarity,
        shopEligible: true,
      }, level, rng);
      await recordCardDiscovery(client, playerId, definition.id);
      const quantityResult = await client.query<{ quantity: string | number }>(
        "SELECT COUNT(*) AS quantity FROM player_card_instances WHERE player_id = $1 AND card_id = $2",
        [playerId, cardId],
      );
      const quantity = toNonNegativeInteger(quantityResult.rows[0]?.quantity ?? 0, "card quantity");
      const response: CardWorkshopCraftResponse = {
        success: true,
        cardId,
        quantity,
        shardsSpent: cost,
        cardShards: toNonNegativeInteger(updatedPlayer.card_shards, "card shards"),
      };
      await client.query("COMMIT");
      return response;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (
        error instanceof WorkshopPlayerMissingError ||
        error instanceof WorkshopCardMissingError ||
        error instanceof InsufficientCardShardsError ||
        error instanceof WorkshopCatalogUnavailableError
      ) throw error;
      throw new CardWorkshopPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }
}
