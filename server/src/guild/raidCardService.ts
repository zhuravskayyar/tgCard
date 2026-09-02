import type {
  CardElement,
  CardRarity,
  CollectionCompletionNotice,
  PlayerCardInstance,
} from "@cardastika/shared";
import type { Pool, PoolClient } from "pg";
import { createStandardCardInstance, CryptoCardRandomSource } from "../cards/cardInstanceCreator.js";
import { recordCardDiscovery } from "../collections/discoveryService.js";

interface RaidCardRow {
  art_key: string | null;
  code: string;
  collection_id: string | null;
  description: string;
  display_name: string | null;
  element: CardElement;
  id: string;
  limited: boolean;
  min_rarity: CardRarity;
  source: "raid";
}

export class RaidCardUnavailableError extends Error {
  constructor(cardId: string) {
    super(`Raid card ${cardId} is unavailable`);
    this.name = "RaidCardUnavailableError";
  }
}

export class RaidCardPersistenceError extends Error {
  constructor(options?: ErrorOptions) {
    super("Raid card persistence is unavailable", options);
    this.name = "RaidCardPersistenceError";
  }
}

export interface RaidCardDropResult {
  collectionCompleted?: CollectionCompletionNotice;
  newDiscovery: boolean;
  reward: PlayerCardInstance;
}

/**
 * Resolves a card already selected by a raid reward table.
 * Chance calculation intentionally stays in the future raid resolver.
 */
export class RaidCardService {
  constructor(private readonly pool: Pick<Pool, "connect" | "query">) {}

  async grantCard(playerId: string, cardId: string, level: number): Promise<RaidCardDropResult> {
    if (!Number.isSafeInteger(level) || level < 1 || level > 180) {
      throw new RangeError("Raid card level must be an integer from 1 to 180");
    }

    let client: PoolClient;
    try {
      client = await this.pool.connect();
    } catch (error) {
      throw new RaidCardPersistenceError({ cause: error });
    }

    try {
      await client.query("BEGIN");
      const result = await client.query<RaidCardRow>(
        `
          SELECT id, code, display_name, art_key, element, collection_id,
            description, limited, min_rarity, source
          FROM cards
          WHERE id = $1 AND source = 'raid'
          FOR SHARE
        `,
        [cardId],
      );
      const row = result.rows[0];
      if (!row) throw new RaidCardUnavailableError(cardId);

      const reward = await createStandardCardInstance(client, playerId, {
        artKey: row.art_key,
        code: row.code,
        collectionId: row.collection_id,
        description: row.description,
        displayName: row.display_name,
        element: row.element,
        id: row.id,
        limited: row.limited,
        minRarity: row.min_rarity,
        shopEligible: false,
        source: row.source,
      }, level, new CryptoCardRandomSource());
      const discovery = await recordCardDiscovery(client, playerId, row.id);
      await client.query("COMMIT");
      return {
        collectionCompleted: discovery.collectionCompleted,
        newDiscovery: discovery.newDiscovery,
        reward,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof RaidCardUnavailableError || error instanceof RangeError) throw error;
      if (error instanceof RaidCardPersistenceError) throw error;
      throw new RaidCardPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }
}
