import type { Pool, PoolClient } from "pg";
import {
  NICKNAME_SKIN_IDS,
  NICKNAME_SKIN_PACK_ID,
  NICKNAME_SKINS,
  type EquipNicknameSkinResponse,
  type NicknameSkinCatalogResponse,
  type NicknameSkinId,
  type NicknameSkinPurchaseResponse,
  type NicknameSkinShopOffer,
  type PlayerInventoryResponse,
} from "@cardastika/shared";

const NICKNAME_SKIN_PRICE = 250 as const;

interface PlayerRow {
  arena_tokens: string | number;
  equipped_nickname_skin: string | null;
  id: string;
}

interface CosmeticRow {
  acquired_at: Date | string;
  cosmetic_id: string;
}

function toNonNegativeInteger(value: string | number, field: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${field} value returned by database`);
  return parsed;
}

function isNicknameSkinId(value: string): value is NicknameSkinId {
  return NICKNAME_SKIN_IDS.some((skinId) => skinId === value);
}

function toEquippedSkinId(value: string | null) {
  if (value === null) return null;
  if (!isNicknameSkinId(value)) throw new Error("Unknown equipped nickname skin returned by database");
  return value;
}

function toOwnedSkinIds(rows: readonly CosmeticRow[]) {
  const acquired = new Set<NicknameSkinId>();
  for (const row of rows) {
    if (isNicknameSkinId(row.cosmetic_id)) acquired.add(row.cosmetic_id);
  }
  return NICKNAME_SKIN_IDS.filter((skinId) => acquired.has(skinId));
}

async function loadPlayer(client: Pick<PoolClient, "query">, playerId: string, lock = false) {
  const result = await client.query<PlayerRow>(
    `SELECT id, arena_tokens, equipped_nickname_skin FROM players WHERE id = $1${lock ? " FOR UPDATE" : ""}`,
    [playerId],
  );
  return result.rows[0] ?? null;
}

async function loadOwnedSkinRows(client: Pick<PoolClient, "query">, playerId: string) {
  const result = await client.query<CosmeticRow>(
    `
      SELECT cosmetic_id, acquired_at
      FROM player_cosmetics
      WHERE player_id = $1 AND cosmetic_type = 'nickname_skin'
      ORDER BY acquired_at ASC, cosmetic_id ASC
    `,
    [playerId],
  );
  return result.rows;
}

function toOffer(tokenBalance: number, ownedSkinIds: readonly NicknameSkinId[], equippedSkinId: NicknameSkinId | null): NicknameSkinShopOffer {
  return {
    canAfford: tokenBalance >= NICKNAME_SKIN_PRICE,
    choices: NICKNAME_SKIN_IDS.map((skinId) => ({ ...NICKNAME_SKINS[skinId] })),
    currency: "arena_tokens",
    equippedSkinId,
    id: NICKNAME_SKIN_PACK_ID,
    name: "Міфічне оформлення I",
    ownedSkinIds: [...ownedSkinIds],
    price: NICKNAME_SKIN_PRICE,
    progress: { owned: ownedSkinIds.length, total: NICKNAME_SKIN_IDS.length },
    subtitle: "Обери один: Blood Moon / Starforged / Broken Signal",
    tokenBalance,
    type: "nickname_skin_choice",
  };
}

async function toInventory(client: Pick<PoolClient, "query">, player: PlayerRow): Promise<PlayerInventoryResponse> {
  const ownedRows = await loadOwnedSkinRows(client, player.id);
  const ownedSkinIds = toOwnedSkinIds(ownedRows);
  const equippedNicknameSkin = toEquippedSkinId(player.equipped_nickname_skin);
  return {
    cosmetics: ownedSkinIds.map((skinId) => ({
      cosmeticType: "nickname_skin" as const,
      equipped: equippedNicknameSkin === skinId,
      id: skinId,
      name: NICKNAME_SKINS[skinId].name,
      rarity: "mythic" as const,
    })),
    equippedNicknameSkin,
    items: [],
  };
}

export class NicknameSkinPlayerMissingError extends Error {
  constructor() {
    super("Nickname skin player does not exist");
    this.name = "NicknameSkinPlayerMissingError";
  }
}

export class NicknameSkinChoiceInvalidError extends Error {
  constructor() {
    super("Nickname skin choice does not exist");
    this.name = "NicknameSkinChoiceInvalidError";
  }
}

export class NicknameSkinAlreadyOwnedError extends Error {
  constructor() {
    super("Nickname skin is already owned");
    this.name = "NicknameSkinAlreadyOwnedError";
  }
}

export class NicknameSkinInsufficientTokensError extends Error {
  constructor() {
    super("Not enough Arena Tokens for this nickname skin");
    this.name = "NicknameSkinInsufficientTokensError";
  }
}

export class NicknameSkinNotOwnedError extends Error {
  constructor() {
    super("Nickname skin is not owned");
    this.name = "NicknameSkinNotOwnedError";
  }
}

export class NicknameSkinPersistenceError extends Error {
  constructor() {
    super("Nickname skin persistence is unavailable");
    this.name = "NicknameSkinPersistenceError";
  }
}

export class NicknameSkinService {
  constructor(private readonly pool: Pick<Pool, "connect" | "query">) {}

  async getCatalog(playerId: string): Promise<NicknameSkinCatalogResponse> {
    try {
      const player = await loadPlayer(this.pool, playerId);
      if (!player) throw new NicknameSkinPlayerMissingError();
      const ownedRows = await loadOwnedSkinRows(this.pool, playerId);
      const ownedSkinIds = toOwnedSkinIds(ownedRows);
      return {
        offer: toOffer(
          toNonNegativeInteger(player.arena_tokens, "arena tokens"),
          ownedSkinIds,
          toEquippedSkinId(player.equipped_nickname_skin),
        ),
      };
    } catch (error) {
      if (error instanceof NicknameSkinPlayerMissingError) throw error;
      throw new NicknameSkinPersistenceError();
    }
  }

  async getInventory(playerId: string): Promise<PlayerInventoryResponse> {
    try {
      const player = await loadPlayer(this.pool, playerId);
      if (!player) throw new NicknameSkinPlayerMissingError();
      return toInventory(this.pool, player);
    } catch (error) {
      if (error instanceof NicknameSkinPlayerMissingError) throw error;
      throw new NicknameSkinPersistenceError();
    }
  }

  async purchase(playerId: string, choiceId: NicknameSkinId): Promise<NicknameSkinPurchaseResponse> {
    if (!isNicknameSkinId(choiceId)) throw new NicknameSkinChoiceInvalidError();

    let client: PoolClient;
    try {
      client = await this.pool.connect();
    } catch {
      throw new NicknameSkinPersistenceError();
    }

    try {
      await client.query("BEGIN");
      const player = await loadPlayer(client, playerId, true);
      if (!player) throw new NicknameSkinPlayerMissingError();

      const ownedResult = await client.query<{ cosmetic_id: string }>(
        "SELECT cosmetic_id FROM player_cosmetics WHERE player_id = $1 AND cosmetic_type = 'nickname_skin' FOR UPDATE",
        [playerId],
      );
      if (ownedResult.rows.some((row) => row.cosmetic_id === choiceId)) throw new NicknameSkinAlreadyOwnedError();

      const currentTokens = toNonNegativeInteger(player.arena_tokens, "arena tokens");
      if (currentTokens < NICKNAME_SKIN_PRICE) throw new NicknameSkinInsufficientTokensError();

      await client.query(
        "INSERT INTO player_cosmetics (player_id, cosmetic_type, cosmetic_id) VALUES ($1, 'nickname_skin', $2)",
        [playerId, choiceId],
      );
      const updatedResult = await client.query<{ arena_tokens: string | number }>(
        `
          UPDATE players
          SET arena_tokens = arena_tokens - $2, equipped_nickname_skin = $3, updated_at = NOW()
          WHERE id = $1 AND arena_tokens >= $2
          RETURNING arena_tokens
        `,
        [playerId, NICKNAME_SKIN_PRICE, choiceId],
      );
      const updated = updatedResult.rows[0];
      if (!updated) throw new NicknameSkinInsufficientTokensError();

      const updatedPlayer: PlayerRow = { ...player, arena_tokens: updated.arena_tokens, equipped_nickname_skin: choiceId };
      const inventory = await toInventory(client, updatedPlayer);
      const offer = toOffer(toNonNegativeInteger(updated.arena_tokens, "arena tokens"), inventory.cosmetics.map(({ id }) => id), choiceId);
      await client.query("COMMIT");
      return {
        acquiredSkin: choiceId,
        inventory,
        offer,
        updatedBalance: { arenaTokens: toNonNegativeInteger(updated.arena_tokens, "arena tokens") },
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (
        error instanceof NicknameSkinAlreadyOwnedError
        || error instanceof NicknameSkinChoiceInvalidError
        || error instanceof NicknameSkinInsufficientTokensError
        || error instanceof NicknameSkinPlayerMissingError
      ) throw error;
      throw new NicknameSkinPersistenceError();
    } finally {
      client.release();
    }
  }

  async equip(playerId: string, skinId: NicknameSkinId | null): Promise<EquipNicknameSkinResponse> {
    if (skinId !== null && !isNicknameSkinId(skinId)) throw new NicknameSkinChoiceInvalidError();

    let client: PoolClient;
    try {
      client = await this.pool.connect();
    } catch {
      throw new NicknameSkinPersistenceError();
    }

    try {
      await client.query("BEGIN");
      const player = await loadPlayer(client, playerId, true);
      if (!player) throw new NicknameSkinPlayerMissingError();
      if (skinId !== null) {
        const owned = await client.query(
          "SELECT 1 FROM player_cosmetics WHERE player_id = $1 AND cosmetic_type = 'nickname_skin' AND cosmetic_id = $2",
          [playerId, skinId],
        );
        if (!owned.rowCount) throw new NicknameSkinNotOwnedError();
      }
      await client.query(
        "UPDATE players SET equipped_nickname_skin = $2, updated_at = NOW() WHERE id = $1",
        [playerId, skinId],
      );
      const inventory = await toInventory(client, { ...player, equipped_nickname_skin: skinId });
      await client.query("COMMIT");
      return { inventory };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (
        error instanceof NicknameSkinChoiceInvalidError
        || error instanceof NicknameSkinNotOwnedError
        || error instanceof NicknameSkinPlayerMissingError
      ) throw error;
      throw new NicknameSkinPersistenceError();
    } finally {
      client.release();
    }
  }
}
