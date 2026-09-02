import type {
  GuildAltarCurrency,
  GuildAltarUpgradeResponse,
  GuildAltarUpgradeView,
  GuildAltarView,
} from "@cardastika/shared";
import type { Pool, PoolClient } from "pg";
import { hasCompletedCollection } from "../collections/discoveryService.js";

export const WITCHES_COLLECTION_ID = "collection_witches";

const ALTAR_UPGRADE_DEFINITIONS: Readonly<Record<GuildAltarCurrency, {
  baseIncrease: 1;
  name: string;
  priceMultiplier: number;
}>> = Object.freeze({
  gold: Object.freeze({ baseIncrease: 1, name: "Міцний настій", priceMultiplier: 2 }),
  silver: Object.freeze({ baseIncrease: 1, name: "Сильний настій", priceMultiplier: 1_000 }),
});

interface AltarPlayerRow {
  altar_level: string | number;
  gold: string | number;
  silver: string | number;
}

function toNonNegativeInteger(value: string | number, field: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${field}`);
  return parsed;
}

function altarPrice(level: number, currency: GuildAltarCurrency) {
  return Math.max(1, level) * ALTAR_UPGRADE_DEFINITIONS[currency].priceMultiplier;
}

function createUpgradeView(
  currentLevel: number,
  balance: number,
  currency: GuildAltarCurrency,
  collectionComplete: boolean,
): GuildAltarUpgradeView {
  const definition = ALTAR_UPGRADE_DEFINITIONS[currency];
  const collectionBonus = currency === "gold" && collectionComplete ? 2 : 0;
  return {
    canAfford: balance >= altarPrice(currentLevel, currency),
    collectionBonus,
    currency,
    name: definition.name,
    price: altarPrice(currentLevel, currency),
    totalIncrease: definition.baseIncrease + collectionBonus,
  };
}

export function buildGuildAltarView(
  currentLevel: number,
  gold: number,
  silver: number,
  collectionComplete: boolean,
): GuildAltarView {
  return {
    currentLevel,
    upgrades: [
      createUpgradeView(currentLevel, gold, "gold", collectionComplete),
      createUpgradeView(currentLevel, silver, "silver", collectionComplete),
    ],
  };
}

export class GuildAltarPersistenceError extends Error {
  constructor(options?: ErrorOptions) {
    super("Guild altar persistence is unavailable", options);
    this.name = "GuildAltarPersistenceError";
  }
}

export class GuildAltarDomainError extends Error {
  constructor(
    public readonly code: "not_guild_member" | "insufficient_gold" | "insufficient_silver",
    message: string,
    public readonly status = code === "not_guild_member" ? 403 : 409,
  ) {
    super(message);
    this.name = "GuildAltarDomainError";
  }
}

export class GuildAltarService {
  constructor(private readonly pool: Pick<Pool, "connect" | "query">) {}

  async getView(database: Pick<PoolClient, "query">, playerId: string): Promise<GuildAltarView> {
    const playerResult = await database.query<AltarPlayerRow>(
      "SELECT altar_level, gold, silver FROM players WHERE id = $1",
      [playerId],
    );
    const player = playerResult.rows[0];
    if (!player) throw new Error("Altar player is missing");
    const currentLevel = toNonNegativeInteger(player.altar_level, "altar level");
    const gold = toNonNegativeInteger(player.gold, "gold");
    const silver = toNonNegativeInteger(player.silver, "silver");
    const collectionComplete = await hasCompletedCollection(database, playerId, WITCHES_COLLECTION_ID);
    return buildGuildAltarView(currentLevel, gold, silver, collectionComplete);
  }

  async purchase(
    playerId: string,
    guildId: string,
    currency: GuildAltarCurrency,
  ): Promise<GuildAltarUpgradeResponse> {
    let client: PoolClient;
    try {
      client = await this.pool.connect();
    } catch (error) {
      throw new GuildAltarPersistenceError({ cause: error });
    }

    try {
      await client.query("BEGIN");
      const playerResult = await client.query<AltarPlayerRow>(
        `
          SELECT players.altar_level, players.gold, players.silver
          FROM players
          INNER JOIN guild_members ON guild_members.player_id = players.id
          WHERE players.id = $1 AND guild_members.guild_id = $2
          FOR UPDATE OF players
        `,
        [playerId, guildId],
      );
      const player = playerResult.rows[0];
      if (!player) throw new GuildAltarDomainError("not_guild_member", "Player is not a member of this guild", 403);
      const previousLevel = toNonNegativeInteger(player.altar_level, "altar level");
      const balance = toNonNegativeInteger(player[currency], currency);
      const price = altarPrice(previousLevel, currency);
      if (balance < price) throw new GuildAltarDomainError(
        currency === "gold" ? "insufficient_gold" : "insufficient_silver",
        `Insufficient ${currency} for altar upgrade`,
      );
      const baseIncrease = ALTAR_UPGRADE_DEFINITIONS[currency].baseIncrease;
      const collectionComplete = await hasCompletedCollection(client, playerId, WITCHES_COLLECTION_ID);
      const collectionBonus = currency === "gold" && collectionComplete ? 2 : 0;
      const totalIncrease = baseIncrease + collectionBonus;
      const nextLevel = previousLevel + totalIncrease;
      const updated = await client.query<AltarPlayerRow>(
        `
          UPDATE players
          SET altar_level = $2,
              ${currency} = ${currency} - $3,
              updated_at = NOW()
          WHERE id = $1 AND ${currency} >= $3
          RETURNING altar_level, gold, silver
        `,
        [playerId, nextLevel, price],
      );
      const updatedPlayer = updated.rows[0];
      if (!updatedPlayer) throw new GuildAltarDomainError(
        currency === "gold" ? "insufficient_gold" : "insufficient_silver",
        `Insufficient ${currency} for altar upgrade`,
      );
      const updatedGold = toNonNegativeInteger(updatedPlayer.gold, "gold");
      const updatedSilver = toNonNegativeInteger(updatedPlayer.silver, "silver");
      const altar = buildGuildAltarView(
        nextLevel,
        updatedGold,
        updatedSilver,
        collectionComplete,
      );
      await client.query("COMMIT");
      return {
        altar,
        baseIncrease,
        collectionBonus,
        currency,
        newLevel: nextLevel,
        previousLevel,
        totalIncrease,
        updatedBalance: { gold: updatedGold, silver: updatedSilver },
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof GuildAltarPersistenceError) throw error;
      if (error instanceof GuildAltarDomainError) throw error;
      throw new GuildAltarPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }
}
