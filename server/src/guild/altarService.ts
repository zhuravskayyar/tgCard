import { getAltarPotions, WITCH_RAID_MIN_GUILD_LEVEL } from "@cardastika/game-core";
import type {
  GuildAltarCurrency,
  GuildAltarUpgradeResponse,
  GuildAltarUpgradeView,
  GuildAltarView,
} from "@cardastika/shared";
import type { Pool, PoolClient } from "pg";
import { CATALOG_DATA } from "../collections/catalogData.generated.js";
import { hasCompletedCollection } from "../collections/discoveryService.js";

// The catalog collection whose bonus raises the gold altar potion («Чотири чаклунки»).
const altarCollection = CATALOG_DATA.collections.find(({ bonus }) => bonus.type === "altar_gold_levels");
if (!altarCollection) throw new Error("The catalog has no altar_gold_levels collection");
export const WITCHES_COLLECTION_ID = `collection_${altarCollection.code}`;

const POTION_NAMES: Readonly<Record<GuildAltarCurrency, string>> = Object.freeze({
  gold: "Міцний настій",
  silver: "Сильний настій",
});

type Database = Pick<PoolClient, "query">;

function toNonNegativeInteger(value: string | number, field: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${field}`);
  return parsed;
}

function endOfUtcDay(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59)).toISOString();
}

/**
 * Altar (reference): its level is the highest witch level the guild beat last week. Each day a
 * player may buy potions that add HP in mass war battles and tournaments until 23:59:59.
 */
export function buildGuildAltarView(
  lastWeekLevel: number,
  gold: number,
  silver: number,
  collectionComplete: boolean,
  guildLevel = WITCH_RAID_MIN_GUILD_LEVEL,
  bought: readonly { currency: GuildAltarCurrency; hpPct: number }[] = [],
): GuildAltarView {
  const potions = getAltarPotions(lastWeekLevel, collectionComplete);
  const unlocked = guildLevel >= WITCH_RAID_MIN_GUILD_LEVEL;
  const upgrade = (currency: GuildAltarCurrency): GuildAltarUpgradeView => {
    const potion = potions[currency];
    const balance = currency === "gold" ? gold : silver;
    return {
      canAfford: unlocked && potions.level > 0 && balance >= potion.price && !bought.some((entry) => entry.currency === currency),
      collectionBonus: currency === "gold" && collectionComplete && potions.level > 0 ? 2 : 0,
      currency,
      hpPct: potion.hpPct,
      name: POTION_NAMES[currency],
      price: potion.price,
      totalIncrease: potion.hpPct,
    };
  };
  const strongest = [...bought].sort((left, right) => right.hpPct - left.hpPct)[0];
  return {
    active: strongest ? { currency: strongest.currency, expiresAt: endOfUtcDay(), hpPct: bought.reduce((total, entry) => total + entry.hpPct, 0) } : null,
    currentLevel: potions.level,
    unlockLevel: WITCH_RAID_MIN_GUILD_LEVEL,
    unlocked,
    upgrades: [upgrade("gold"), upgrade("silver")],
  };
}

/** Highest witch level the guild beat in the previous raid week. */
export async function loadLastWeekWitchLevel(database: Database, guildId: string) {
  const result = await database.query<{ level: number | null }>(
    `SELECT MAX(results.raid_level) AS level
     FROM guild_witch_raid_results results
     INNER JOIN guild_witch_raids raids ON raids.id = results.raid_id
     WHERE raids.guild_id = $1 AND results.week_key = (date_trunc('week', CURRENT_DATE) - INTERVAL '7 days')::date`,
    [guildId],
  );
  return result.rows[0]?.level ?? 0;
}

/** HP percent from today's altar potions; tournaments add it to the player's HP. */
export async function loadActiveAltarHpPct(database: Database, playerId: string) {
  const result = await database.query<{ total: string | null }>(
    "SELECT SUM(hp_pct) AS total FROM player_altar_potions WHERE player_id = $1 AND potion_day = (NOW() AT TIME ZONE 'UTC')::date",
    [playerId],
  );
  return Number(result.rows[0]?.total ?? 0);
}

async function loadBought(database: Database, playerId: string) {
  const result = await database.query<{ currency: GuildAltarCurrency; hp_pct: string }>(
    "SELECT currency, hp_pct FROM player_altar_potions WHERE player_id = $1 AND potion_day = (NOW() AT TIME ZONE 'UTC')::date",
    [playerId],
  );
  return result.rows.map((row) => ({ currency: row.currency, hpPct: Number(row.hp_pct) }));
}

export class GuildAltarPersistenceError extends Error {
  constructor(options?: ErrorOptions) {
    super("Guild altar persistence is unavailable", options);
    this.name = "GuildAltarPersistenceError";
  }
}

export class GuildAltarDomainError extends Error {
  constructor(
    public readonly code: "not_guild_member" | "insufficient_gold" | "insufficient_silver" | "altar_locked" | "altar_empty" | "altar_already_bought",
    message: string,
    public readonly status = code === "not_guild_member" ? 403 : 409,
  ) {
    super(message);
    this.name = "GuildAltarDomainError";
  }
}

export class GuildAltarService {
  constructor(private readonly pool: Pick<Pool, "connect" | "query">) {}

  async getView(database: Database, playerId: string, guildId: string): Promise<GuildAltarView> {
    const player = (await database.query<{ gold: string; silver: string }>("SELECT gold, silver FROM players WHERE id = $1", [playerId])).rows[0];
    if (!player) throw new Error("Altar player is missing");
    const guild = (await database.query<{ level: number }>("SELECT level FROM guilds WHERE id = $1", [guildId])).rows[0];
    const collectionComplete = await hasCompletedCollection(database, playerId, WITCHES_COLLECTION_ID);
    return buildGuildAltarView(
      await loadLastWeekWitchLevel(database, guildId),
      toNonNegativeInteger(player.gold, "gold"),
      toNonNegativeInteger(player.silver, "silver"),
      collectionComplete,
      guild?.level ?? 1,
      await loadBought(database, playerId),
    );
  }

  async purchase(playerId: string, guildId: string, currency: GuildAltarCurrency): Promise<GuildAltarUpgradeResponse> {
    let client: PoolClient;
    try {
      client = await this.pool.connect();
    } catch (error) {
      throw new GuildAltarPersistenceError({ cause: error });
    }
    try {
      await client.query("BEGIN");
      const member = await client.query<{ level: number }>(
        `SELECT guilds.level FROM guild_members INNER JOIN guilds ON guilds.id = guild_members.guild_id
         WHERE guild_members.player_id = $1 AND guild_members.guild_id = $2`,
        [playerId, guildId],
      );
      const guildLevel = member.rows[0]?.level;
      if (guildLevel === undefined) throw new GuildAltarDomainError("not_guild_member", "Player is not a member of this guild", 403);
      if (guildLevel < WITCH_RAID_MIN_GUILD_LEVEL) throw new GuildAltarDomainError("altar_locked", `The altar opens at guild level ${WITCH_RAID_MIN_GUILD_LEVEL}`);
      const level = await loadLastWeekWitchLevel(client, guildId);
      if (level < 1) throw new GuildAltarDomainError("altar_empty", "The guild beat no witches last week");
      const previous = await loadBought(client, playerId);
      if (previous.some((entry) => entry.currency === currency)) throw new GuildAltarDomainError("altar_already_bought", "This potion is already active today");
      const collectionComplete = await hasCompletedCollection(client, playerId, WITCHES_COLLECTION_ID);
      const potion = getAltarPotions(level, collectionComplete)[currency];
      const updated = await client.query<{ gold: string; silver: string }>(
        `UPDATE players SET ${currency} = ${currency} - $2, updated_at = NOW()
         WHERE id = $1 AND ${currency} >= $2 RETURNING gold, silver`,
        [playerId, potion.price],
      );
      const balance = updated.rows[0];
      if (!balance) throw new GuildAltarDomainError(currency === "gold" ? "insufficient_gold" : "insufficient_silver", `Insufficient ${currency} for the potion`);
      await client.query(
        "INSERT INTO player_altar_potions (player_id, potion_day, currency, hp_pct) VALUES ($1, (NOW() AT TIME ZONE 'UTC')::date, $2, $3)",
        [playerId, currency, potion.hpPct],
      );
      const gold = toNonNegativeInteger(balance.gold, "gold");
      const silver = toNonNegativeInteger(balance.silver, "silver");
      const bought = [...previous, { currency, hpPct: potion.hpPct }];
      const altar = buildGuildAltarView(level, gold, silver, collectionComplete, guildLevel, bought);
      await client.query("COMMIT");
      return {
        altar,
        baseIncrease: potion.hpPct,
        collectionBonus: currency === "gold" && collectionComplete ? 2 : 0,
        currency,
        newLevel: level,
        previousLevel: level,
        totalIncrease: potion.hpPct,
        updatedBalance: { gold, silver },
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof GuildAltarPersistenceError || error instanceof GuildAltarDomainError) throw error;
      throw new GuildAltarPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }
}
