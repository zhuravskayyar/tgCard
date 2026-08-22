import { randomUUID } from "node:crypto";
import type { PlayerSummary } from "@cardastika/shared";
import type { Pool, PoolClient } from "pg";
import type { ValidatedTelegramUser } from "../auth/telegramInitData.js";
import { ensureStarterDeck } from "../decks/starterDeck.js";
import { grantStarterCards } from "../inventory/starterCardGrant.js";
import { NEW_PLAYER_DEFAULTS } from "./playerDefaults.js";

interface PlayerRow {
  first_name: string;
  gold: string | number;
  id: string;
  level: number;
  photo_url: string | null;
  silver: string | number;
  username: string | null;
}

export class PlayerPersistenceError extends Error {
  constructor() {
    super("Player persistence is unavailable");
    this.name = "PlayerPersistenceError";
  }
}

function toSafeNumber(value: string | number, field: "silver" | "gold") {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid ${field} value returned by database`);
  }

  return parsed;
}

function toPlayerSummary(row: PlayerRow): PlayerSummary {
  return {
    id: row.id,
    username: row.username,
    firstName: row.first_name,
    photoUrl: row.photo_url,
    level: row.level,
    silver: toSafeNumber(row.silver, "silver"),
    gold: toSafeNumber(row.gold, "gold"),
  };
}

export class PlayerRepository {
  constructor(private readonly pool: Pool) {}

  private async upsertTelegramPlayer(client: PoolClient, user: ValidatedTelegramUser) {
    return client.query<PlayerRow>(
      `
        INSERT INTO players (
          id,
          telegram_user_id,
          username,
          first_name,
          last_name,
          photo_url,
          level,
          silver,
          gold
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (telegram_user_id) DO UPDATE SET
          username = EXCLUDED.username,
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          photo_url = EXCLUDED.photo_url,
          updated_at = NOW()
        RETURNING id, username, first_name, photo_url, level, silver, gold
      `,
      [
        randomUUID(),
        user.id,
        user.username,
        user.firstName,
        user.lastName,
        user.photoUrl,
        NEW_PLAYER_DEFAULTS.level,
        NEW_PLAYER_DEFAULTS.silver,
        NEW_PLAYER_DEFAULTS.gold,
      ],
    );
  }

  async findOrCreateFromTelegram(user: ValidatedTelegramUser): Promise<PlayerSummary> {
    let client: PoolClient | undefined;

    try {
      client = await this.pool.connect();
      await client.query("BEGIN");
      const result = await this.upsertTelegramPlayer(client, user);

      const player = result.rows[0];
      if (!player) {
        throw new Error("Player upsert returned no row");
      }

      await grantStarterCards(client, player.id);
      await ensureStarterDeck(client, player.id);
      const summary = toPlayerSummary(player);
      await client.query("COMMIT");
      return summary;
    } catch {
      await client?.query("ROLLBACK").catch(() => undefined);
      throw new PlayerPersistenceError();
    } finally {
      client?.release();
    }
  }
}
