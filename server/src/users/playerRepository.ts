import { randomUUID } from "node:crypto";
import { getPlayerCollectionModifiers, getRequiredAccountXp } from "@cardastika/game-core";
import { getDefaultPlayerNickname, NICKNAME_SKIN_IDS, PLAYER_NICKNAME_MAX_LENGTH, type AuthIdentityView, type AuthProvider, type EquippedEquipment, type NicknameSkinId, type PlayerCollectionBonus, type PlayerEquipmentInventory, type PlayerSummary } from "@cardastika/shared";
import type { Pool, PoolClient } from "pg";
import type { VerifiedIdentity } from "../auth/identity.js";
import type { ValidatedTelegramUser } from "../auth/telegramInitData.js";
import { getAccountBoostStatus } from "../boosts/accountBoost.js";
import { getCompletedCollectionBonuses } from "../collections/discoveryService.js";
import { recalculateAutomaticDeck } from "../decks/automaticDeckService.js";
import { grantStarterCards } from "../inventory/starterCardGrant.js";
import { NEW_PLAYER_DEFAULTS } from "./playerDefaults.js";
import { EquipmentValidationError, parseStoredEquipment, serializeEquipment, toPublicPlayerEquipment, validateEquipmentUpdate } from "../equipment/equipmentState.js";

interface PlayerRow {
  arena_league_index: number;
  arena_rating: number;
  arena_tokens: string | number;
  arena_top3_count: number;
  arena_wins: number;
  account_xp: number;
  card_shards: string | number;
  duel_wins: number;
  duel_highest_league_index: number;
  duel_rating: number;
  equipment: unknown;
  first_name: string;
  equipped_nickname_skin: string | null;
  gold: string | number;
  id: string;
  last_name: string | null;
  level: number;
  nickname: string | null;
  photo_url: string | null;
  rating: number;
  silver: string | number;
  tutorial_eligible: boolean;
  username: string | null;
}

export class PlayerPersistenceError extends Error {
  constructor(options?: ErrorOptions) {
    super("Player persistence is unavailable", options);
    this.name = "PlayerPersistenceError";
  }
}

export class AuthIdentityConflictError extends Error {
  constructor() {
    super("This account is already linked to another Cardastika profile.");
    this.name = "AuthIdentityConflictError";
  }
}

export class AuthIdentityAlreadyLinkedError extends Error {
  constructor() {
    super("This authentication provider is already linked to the profile.");
    this.name = "AuthIdentityAlreadyLinkedError";
  }
}

export class PlayerNicknameValidationError extends Error {
  constructor(public readonly code: "nickname_required" | "nickname_too_long") {
    super(code);
    this.name = "PlayerNicknameValidationError";
  }
}

function normalizeNickname(value: string) {
  const nickname = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (!nickname) throw new PlayerNicknameValidationError("nickname_required");
  if (Array.from(nickname).length > PLAYER_NICKNAME_MAX_LENGTH) {
    throw new PlayerNicknameValidationError("nickname_too_long");
  }
  return nickname;
}

function toSafeNumber(value: string | number, field: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${field} value returned by database`);
  return parsed;
}

function playerColumns() {
  return `
    players.id, players.username, players.first_name, players.last_name,
    players.photo_url, players.level, players.silver, players.gold,
    players.rating, players.account_xp, players.card_shards, players.duel_wins,
    players.duel_rating, players.duel_highest_league_index, players.arena_rating,
    players.arena_league_index, players.arena_wins, players.arena_top3_count,
    players.arena_tokens, players.equipped_nickname_skin, players.tutorial_eligible,
    players.equipment, players.nickname`;
}

function playerReturningColumns() {
  return `
    id, username, first_name, last_name, photo_url, level, silver, gold,
    rating, account_xp, card_shards, duel_wins, duel_rating,
    duel_highest_league_index, arena_rating, arena_league_index, arena_wins,
    arena_top3_count, arena_tokens, equipped_nickname_skin, tutorial_eligible,
    equipment, nickname`;
}

function toEquippedNicknameSkin(value: string | null | undefined): NicknameSkinId | null {
  if (value === null || value === undefined) return null;
  return NICKNAME_SKIN_IDS.find((skinId) => skinId === value) ?? null;
}

function toPlayerSummary(
  row: PlayerRow,
  experienceRewardPct = 0,
  collectionBonuses: readonly PlayerCollectionBonus[] = [],
): PlayerSummary {
  return {
    accountXp: toSafeNumber(row.account_xp, "accountXp"),
    accountXpRequired: getRequiredAccountXp(row.level),
    arenaLeagueIndex: toSafeNumber(row.arena_league_index, "arenaLeagueIndex"),
    arenaRating: toSafeNumber(row.arena_rating, "arenaRating"),
    arenaTokens: toSafeNumber(row.arena_tokens, "arenaTokens"),
    arenaTop3Count: toSafeNumber(row.arena_top3_count, "arenaTop3Count"),
    arenaWins: toSafeNumber(row.arena_wins, "arenaWins"),
    cardShards: toSafeNumber(row.card_shards, "cardShards"),
    collectionBonuses: [...collectionBonuses],
    duelHighestLeagueIndex: toSafeNumber(row.duel_highest_league_index, "duelHighestLeagueIndex"),
    duelRating: toSafeNumber(row.duel_rating, "duelRating"),
    duelWins: toSafeNumber(row.duel_wins, "duelWins"),
    equipment: toPublicPlayerEquipment(row.id, row.equipment),
    equippedNicknameSkin: toEquippedNicknameSkin(row.equipped_nickname_skin),
    experienceRewardPct,
    firstName: row.first_name,
    gold: toSafeNumber(row.gold, "gold"),
    id: row.id,
    tutorialEligible: row.tutorial_eligible,
    level: row.level,
    nickname: row.nickname,
    photoUrl: row.photo_url,
    rating: toSafeNumber(row.rating, "rating"),
    silver: toSafeNumber(row.silver, "silver"),
    username: row.username,
  };
}

function toVerifiedTelegramIdentity(user: ValidatedTelegramUser): VerifiedIdentity {
  return {
    provider: "telegram",
    providerUserId: user.id,
    email: null,
    firstName: user.firstName,
    lastName: user.lastName,
    photoUrl: user.photoUrl,
  };
}

export class PlayerRepository {
  constructor(private readonly pool: Pool) {}

  private async loadPlayerRow(client: PoolClient, playerId: string) {
    const result = await client.query<PlayerRow>(
      `SELECT ${playerColumns()} FROM players WHERE players.id = $1 FOR UPDATE`,
      [playerId],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Player does not exist");
    return row;
  }

  private async toSummary(client: PoolClient, row: PlayerRow) {
    const collectionBonuses = await getCompletedCollectionBonuses(client, row.id);
    const collectionModifiers = getPlayerCollectionModifiers(collectionBonuses.map(({ bonus }) => bonus));
    const accountBoost = await getAccountBoostStatus(client, row.id);
    return toPlayerSummary(
      row,
      collectionModifiers.experienceRewardPct + (accountBoost.multiplier - 1) * 100,
      collectionBonuses,
    );
  }

  private async findIdentityPlayer(client: PoolClient, provider: AuthProvider, providerUserId: string) {
    const result = await client.query<PlayerRow>(
      `
        SELECT ${playerColumns()}
        FROM auth_identities
        INNER JOIN players ON players.id = auth_identities.player_id
        WHERE auth_identities.provider = $1 AND auth_identities.provider_user_id = $2
        FOR UPDATE OF players
      `,
      [provider, providerUserId],
    );
    return result.rows[0] ?? null;
  }

  private async bootstrapPlayer(client: PoolClient, playerId: string) {
    await grantStarterCards(client, playerId);
    await recalculateAutomaticDeck(client, playerId);
  }

  private async persistIdentity(client: PoolClient, playerId: string, identity: VerifiedIdentity) {
    const result = await client.query(
      `
        INSERT INTO auth_identities (id, player_id, provider, provider_user_id, email)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (provider, provider_user_id) DO NOTHING
      `,
      [randomUUID(), playerId, identity.provider, identity.providerUserId, identity.email],
    );
    return result.rowCount === 1;
  }

  private async upsertTelegramPlayer(client: PoolClient, user: ValidatedTelegramUser) {
    const playerId = randomUUID();
    const referralCode = playerId.replaceAll("-", "").slice(0, 12).toLowerCase();
    return client.query<PlayerRow>(
      `
       INSERT INTO players (
          id, telegram_user_id, username, nickname, first_name, last_name, photo_url,
         level, silver, gold, referral_code, tutorial_eligible
       )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TRUE)
       ON CONFLICT (telegram_user_id) DO UPDATE SET
          username = EXCLUDED.username,
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          photo_url = EXCLUDED.photo_url,
          updated_at = NOW()
        RETURNING ${playerReturningColumns()}
      `,
      [
        playerId,
       user.id,
       user.username,
        getDefaultPlayerNickname(user.username, user.firstName),
       user.firstName,
        user.lastName,
        user.photoUrl,
        NEW_PLAYER_DEFAULTS.level,
        NEW_PLAYER_DEFAULTS.silver,
        NEW_PLAYER_DEFAULTS.gold,
        referralCode,
      ],
    );
  }

  private async updateTelegramProfile(client: PoolClient, playerId: string, user: ValidatedTelegramUser) {
    await client.query(
      `
        UPDATE players
        SET telegram_user_id = $2, username = $3, first_name = $4, last_name = $5,
            photo_url = $6, updated_at = NOW()
        WHERE id = $1
      `,
      [playerId, user.id, user.username, user.firstName, user.lastName, user.photoUrl],
    );
  }

  async findOrCreateFromTelegram(user: ValidatedTelegramUser) {
    return this.findOrCreateFromIdentity(toVerifiedTelegramIdentity(user), user);
  }

  async findOrCreateFromIdentity(identity: VerifiedIdentity, telegramUser?: ValidatedTelegramUser): Promise<PlayerSummary> {
    let client: PoolClient | undefined;
    try {
      client = await this.pool.connect();
      await client.query("BEGIN");
      const existing = await this.findIdentityPlayer(client, identity.provider, identity.providerUserId);
      let row = existing;

      if (row) {
        if (identity.provider === "telegram" && telegramUser) await this.updateTelegramProfile(client, row.id, telegramUser);
        if (identity.provider === "google") {
          await client.query(
            "UPDATE auth_identities SET email = $3 WHERE player_id = $1 AND provider = $2",
            [row.id, identity.provider, identity.email],
          );
        }
        row = await this.loadPlayerRow(client, row.id);
      } else if (identity.provider === "telegram" && telegramUser) {
        const inserted = await this.upsertTelegramPlayer(client, telegramUser);
        row = inserted.rows[0] ?? null;
        if (!row) throw new Error("Telegram player upsert returned no row");
        await this.persistIdentity(client, row.id, identity);
      } else {
        const playerId = randomUUID();
        const inserted = await client.query<PlayerRow>(
          `
           INSERT INTO players (
              id, telegram_user_id, username, nickname, first_name, last_name, photo_url,
             level, silver, gold, referral_code, tutorial_eligible
           )
            VALUES ($1, NULL, NULL, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)
           RETURNING ${playerReturningColumns()}
          `,
          [
           playerId,
            getDefaultPlayerNickname(null, identity.firstName),
           identity.firstName,
            identity.lastName,
            identity.photoUrl,
            NEW_PLAYER_DEFAULTS.level,
            NEW_PLAYER_DEFAULTS.silver,
            NEW_PLAYER_DEFAULTS.gold,
            playerId.replaceAll("-", "").slice(0, 12).toLowerCase(),
          ],
        );
        row = inserted.rows[0] ?? null;
        if (!row) throw new Error("External player insert returned no row");
        const insertedIdentity = await this.persistIdentity(client, row.id, identity);
        if (!insertedIdentity) {
          const owner = await client.query<{ player_id: string }>(
            "SELECT player_id FROM auth_identities WHERE provider = $1 AND provider_user_id = $2",
            [identity.provider, identity.providerUserId],
          );
          const ownerId = owner.rows[0]?.player_id;
          if (!ownerId) throw new Error("External identity owner disappeared during bootstrap");
          await client.query("DELETE FROM players WHERE id = $1", [row.id]);
          row = await this.loadPlayerRow(client, ownerId);
        }
      }

      await this.bootstrapPlayer(client, row.id);
      const summary = await this.toSummary(client, row);
      await client.query("COMMIT");
      return summary;
    } catch (error) {
      await client?.query("ROLLBACK").catch(() => undefined);
      throw new PlayerPersistenceError({ cause: error });
    } finally {
      client?.release();
    }
  }

  async findSummaryById(playerId: string): Promise<PlayerSummary> {
    let client: PoolClient | undefined;
    try {
      client = await this.pool.connect();
      await client.query("BEGIN");
      const row = await this.loadPlayerRow(client, playerId);
      const summary = await this.toSummary(client, row);
      await client.query("COMMIT");
      return summary;
    } catch (error) {
      await client?.query("ROLLBACK").catch(() => undefined);
      throw new PlayerPersistenceError({ cause: error });
    } finally {
      client?.release();
    }
  }

  async completeTutorial(playerId: string): Promise<PlayerSummary> {
    try {
      const result = await this.pool.query<{ id: string }>(
        "UPDATE players SET tutorial_eligible = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id",
        [playerId],
      );
      if (!result.rows[0]) throw new Error("Player does not exist");
      return await this.findSummaryById(playerId);
    } catch (error) {
      if (error instanceof PlayerPersistenceError) throw error;
      throw new PlayerPersistenceError({ cause: error });
    }
  }

  async updateNickname(playerId: string, value: string) {
    const nickname = normalizeNickname(value);
    try {
      const result = await this.pool.query<{ nickname: string | null }>(
        `
          UPDATE players
          SET nickname = $2, updated_at = NOW()
          WHERE id = $1
          RETURNING nickname
        `,
        [playerId, nickname],
      );
      const updated = result.rows[0];
      if (!updated?.nickname) throw new Error("Player nickname update returned no row");
      return { nickname: updated.nickname };
    } catch (error) {
      if (error instanceof PlayerNicknameValidationError) throw error;
      throw new PlayerPersistenceError({ cause: error });
    }
  }

  async updateEquipment(playerId: string, equipped: EquippedEquipment) {
    const validatedEquipment = validateEquipmentUpdate(equipped);
    let client: PoolClient | undefined;
    try {
      client = await this.pool.connect();
      await client.query("BEGIN");
      const row = await client.query<{ equipment: unknown }>("SELECT equipment FROM players WHERE id = $1 FOR UPDATE", [playerId]);
      if (!row.rows[0]) throw new Error("Player does not exist");
      const inventory = await client.query<{ item_id: string; quantity: number }>(
        "SELECT item_id, quantity FROM player_equipment_inventory WHERE player_id = $1 FOR UPDATE",
        [playerId],
      );
      const ownedItemIds = new Set(inventory.rows.filter(({ quantity }) => quantity > 0).map(({ item_id }) => item_id));
      for (const itemId of Object.values(validatedEquipment)) {
        if (itemId !== null && !ownedItemIds.has(itemId)) {
          throw new EquipmentValidationError("Cannot equip an item that is not in the inventory");
        }
      }
      await client.query(
        "UPDATE players SET equipment = $2::jsonb, updated_at = NOW() WHERE id = $1",
        [playerId, serializeEquipment(validatedEquipment)],
      );
      await client.query("COMMIT");
      return parseStoredEquipment(playerId, { equipped: validatedEquipment });
    } catch (error) {
      await client?.query("ROLLBACK").catch(() => undefined);
      if (error instanceof EquipmentValidationError) throw error;
      throw new PlayerPersistenceError({ cause: error });
    } finally {
      client?.release();
    }
  }

  async getEquipmentInventory(playerId: string): Promise<PlayerEquipmentInventory[]> {
    try {
      const result = await this.pool.query<{ item_id: string; quantity: number }>(
        "SELECT item_id, quantity FROM player_equipment_inventory WHERE player_id = $1 ORDER BY item_id",
        [playerId],
      );
      return result.rows.map(({ item_id, quantity }) => ({ itemId: item_id, playerId, quantity }));
    } catch (error) {
      throw new PlayerPersistenceError({ cause: error });
    }
  }

  async listAuthIdentities(playerId: string): Promise<AuthIdentityView[]> {
    const result = await this.pool.query<{ provider: AuthProvider; email: string | null; created_at: Date | string }>(
      "SELECT provider, email, created_at FROM auth_identities WHERE player_id = $1 ORDER BY provider",
      [playerId],
    );
    return result.rows.map((row) => ({
      provider: row.provider,
      email: row.email,
      createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  async linkIdentity(playerId: string, identity: VerifiedIdentity): Promise<AuthIdentityView[]> {
    let client: PoolClient | undefined;
    try {
      client = await this.pool.connect();
      await client.query("BEGIN");
      const current = await client.query(
        "SELECT provider FROM auth_identities WHERE player_id = $1 AND provider = $2 FOR UPDATE",
        [playerId, identity.provider],
      );
      if (current.rowCount) throw new AuthIdentityAlreadyLinkedError();
      const owner = await client.query<{ player_id: string }>(
        "SELECT player_id FROM auth_identities WHERE provider = $1 AND provider_user_id = $2 FOR UPDATE",
        [identity.provider, identity.providerUserId],
      );
      if (owner.rows[0] && owner.rows[0].player_id !== playerId) throw new AuthIdentityConflictError();
      const insertedIdentity = await this.persistIdentity(client, playerId, identity);
      if (!insertedIdentity) {
        const linkedOwner = await client.query<{ player_id: string }>(
          "SELECT player_id FROM auth_identities WHERE provider = $1 AND provider_user_id = $2",
          [identity.provider, identity.providerUserId],
        );
        if (linkedOwner.rows[0]?.player_id !== playerId) throw new AuthIdentityConflictError();
      }
      await client.query("COMMIT");
      return this.listAuthIdentities(playerId);
    } catch (error) {
      await client?.query("ROLLBACK").catch(() => undefined);
      if (error instanceof AuthIdentityAlreadyLinkedError || error instanceof AuthIdentityConflictError) throw error;
      throw new PlayerPersistenceError({ cause: error });
    } finally {
      client?.release();
    }
  }
}
