import {
  CARD_RARITIES,
  type AdminAuditLogItem,
  type AdminAuditResponse,
  type AdminCardDefinitionItem,
  type AdminCardGrantResponse,
  type AdminCardRemoveResponse,
  type AdminCardsResponse,
  type AdminCurrency,
  type AdminDashboardResponse,
  type AdminIdentity,
  type AdminOwnedCard,
  type AdminPlayerDetailResponse,
  type AdminPlayerListItem,
  type AdminPlayerMutationResponse,
  type AdminPlayersResponse,
  type CardDefinition,
  type CardElement,
  type CardRarity,
  type CardSource,
} from "@cardastika/shared";
import {
  MAX_ACCOUNT_LEVEL,
  MAX_CARD_LEVEL,
  getBasePowerForLevel,
  getCardPower,
  getRarityForLevel,
  getRequiredAccountXp,
} from "@cardastika/game-core";
import type { Pool, PoolClient } from "pg";
import { createStandardCardInstance, CryptoCardRandomSource } from "../cards/cardInstanceCreator.js";
import { recordCardDiscovery } from "../collections/discoveryService.js";
import { recalculateAutomaticDeck } from "../decks/automaticDeckService.js";
import { recordAdminAudit } from "./adminAudit.js";

type Queryable = Pick<PoolClient, "query">;

export class AdminDomainError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AdminDomainError";
  }
}

export class AdminPersistenceError extends Error {
  constructor(options?: ErrorOptions) {
    super("Admin persistence is unavailable", options);
    this.name = "AdminPersistenceError";
  }
}

export interface AdminPlayerListOptions {
  createdFrom?: string;
  createdTo?: string;
  direction: "asc" | "desc";
  goldMin?: number;
  levelMax?: number;
  levelMin?: number;
  limit: number;
  page: number;
  search?: string;
  silverMin?: number;
  sort: "createdAt" | "gold" | "level" | "name" | "silver";
}

export interface AdminCardListOptions {
  collectionId?: string;
  direction: "asc" | "desc";
  element?: CardElement;
  limit: number;
  limited?: boolean;
  minRarity?: CardRarity;
  page: number;
  search?: string;
  sort: "code" | "element" | "name" | "ownedCopies";
}

export interface AdminAuditListOptions {
  action?: string;
  admin?: string;
  dateFrom?: string;
  dateTo?: string;
  entityId?: string;
  entityType?: string;
  limit: number;
  page: number;
}

interface PlayerRow {
  account_xp: string | number;
  created_at: Date | string;
  first_name: string;
  gold: string | number;
  id: string;
  last_name: string | null;
  level: string | number;
  nickname: string | null;
  silver: string | number;
  telegram_user_id: string | null;
  updated_at: Date | string;
  username: string | null;
}

interface OwnedCardRow {
  bonus_power: string | number;
  card_id: string;
  code: string;
  collection_id: string | null;
  display_name: string | null;
  element: CardElement;
  instance_id: string;
  level: string | number;
  slot: string | number | null;
}

interface CardDefinitionRow {
  art_key: string | null;
  code: string;
  collection_id: string | null;
  collection_name: string | null;
  description: string;
  display_name: string | null;
  element: CardElement;
  id: string;
  limited: boolean;
  min_rarity: CardRarity;
  owned_copies: string | number;
  shop_eligible: boolean;
  source: CardSource;
}

const PLAYER_PROJECTION = `
  players.id,
  COALESCE(identity.provider_user_id, players.telegram_user_id::text) AS telegram_user_id,
  players.username,
  players.nickname,
  players.first_name,
  players.last_name,
  players.level,
  players.account_xp,
  players.silver,
  players.gold,
  players.created_at,
  players.updated_at
`;

const OWNED_CARD_PROJECTION = `
  instances.id AS instance_id,
  cards.id AS card_id,
  cards.code,
  cards.display_name,
  cards.element,
  cards.collection_id,
  instances.level,
  instances.bonus_power,
  deck_slots.slot
`;

function toSafeInteger(value: string | number, field: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`Invalid ${field} returned by database`);
  return parsed;
}

function toNonNegativeInteger(value: string | number, field: string) {
  const parsed = toSafeInteger(value, field);
  if (parsed < 0) throw new Error(`Negative ${field} returned by database`);
  return parsed;
}

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapPlayer(row: PlayerRow): AdminPlayerListItem {
  return {
    createdAt: toIso(row.created_at),
    firstName: row.first_name,
    gold: toNonNegativeInteger(row.gold, "player gold"),
    id: row.id,
    lastName: row.last_name,
    level: toNonNegativeInteger(row.level, "player level"),
    nickname: row.nickname,
    silver: toNonNegativeInteger(row.silver, "player silver"),
    telegramUserId: row.telegram_user_id,
    updatedAt: toIso(row.updated_at),
    username: row.username,
  };
}

function mapOwnedCard(row: OwnedCardRow): AdminOwnedCard {
  const level = toNonNegativeInteger(row.level, "card level");
  const bonusPower = toNonNegativeInteger(row.bonus_power, "card bonus power");
  const slot = row.slot === null ? null : toNonNegativeInteger(row.slot, "deck slot");
  return {
    basePower: getBasePowerForLevel(level),
    bonusPower,
    cardId: row.card_id,
    code: row.code,
    collectionId: row.collection_id,
    displayName: row.display_name,
    element: row.element,
    finalPower: getCardPower({ level, bonusPower }),
    inDeck: slot !== null,
    instanceId: row.instance_id,
    level,
    rarity: getRarityForLevel(level),
    slot,
  };
}

function pagination(page: number, limit: number, total: number) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

async function loadPlayer(database: Queryable, playerId: string, lock = false) {
  const result = await database.query<PlayerRow>(
    `
      SELECT ${PLAYER_PROJECTION}
      FROM players
      LEFT JOIN LATERAL (
        SELECT provider_user_id
        FROM auth_identities
        WHERE player_id = players.id AND provider = 'telegram'
        ORDER BY created_at
        LIMIT 1
      ) identity ON TRUE
      WHERE players.id = $1
      ${lock ? "FOR UPDATE OF players" : ""}
    `,
    [playerId],
  );
  const row = result.rows[0];
  if (!row) throw new AdminDomainError(404, "player_not_found", "Гравця не знайдено");
  return row;
}

export class AdminService {
  private readonly cardRng = new CryptoCardRandomSource();

  constructor(private readonly pool: Pool) {}

  async getDashboard(): Promise<AdminDashboardResponse> {
    try {
      const [players, economy, cardTotals, rarityLevels, popularCard, gameData] = await Promise.all([
        this.pool.query<{ new_last_7_days: string; new_today: string; total: string }>(
          `SELECT COUNT(*) AS total,
            COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) AS new_today,
            COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') AS new_last_7_days
           FROM players`,
        ),
        this.pool.query<{ average_gold: string | null; average_silver: string | null; total_gold: string; total_silver: string }>(
          `SELECT COALESCE(SUM(silver), 0) AS total_silver,
            COALESCE(SUM(gold), 0) AS total_gold,
            AVG(silver) AS average_silver,
            AVG(gold) AS average_gold
           FROM players`,
        ),
        this.pool.query<{ definitions: string; owned_instances: string }>(
          `SELECT (SELECT COUNT(*) FROM cards) AS definitions,
            (SELECT COUNT(*) FROM player_card_instances) AS owned_instances`,
        ),
        this.pool.query<{ level: string | number; total: string }>(
          "SELECT level, COUNT(*) AS total FROM player_card_instances GROUP BY level",
        ),
        this.pool.query<{ card_id: string; display_name: string | null; owned_copies: string }>(
          `SELECT cards.id AS card_id, cards.display_name, COUNT(instances.id) AS owned_copies
           FROM player_card_instances instances
           INNER JOIN cards ON cards.id = instances.card_id
           GROUP BY cards.id
           ORDER BY COUNT(instances.id) DESC, cards.code
           LIMIT 1`,
        ),
        this.pool.query<{ duel_losses: string; duel_wins: string; duels: string; redemptions: string }>(
          `SELECT
            (SELECT COUNT(*) FROM duels) AS duels,
            (SELECT COUNT(*) FROM duels WHERE status = 'won') AS duel_wins,
            (SELECT COUNT(*) FROM duels WHERE status = 'lost') AS duel_losses,
            (SELECT COUNT(*) FROM player_limited_card_redemptions) AS redemptions`,
        ),
      ]);
      const rarityCounts = Object.fromEntries(CARD_RARITIES.map((rarity) => [rarity, 0])) as Record<CardRarity, number>;
      for (const row of rarityLevels.rows) {
        const level = toNonNegativeInteger(row.level, "card level");
        rarityCounts[getRarityForLevel(level)] += toNonNegativeInteger(row.total, "rarity count");
      }
      const playerStats = players.rows[0];
      const balances = economy.rows[0];
      const cards = cardTotals.rows[0];
      const games = gameData.rows[0];
      if (!playerStats || !balances || !cards || !games) throw new Error("Dashboard aggregate returned no rows");
      const popular = popularCard.rows[0];
      return {
        players: {
          total: toNonNegativeInteger(playerStats.total, "player total"),
          newToday: toNonNegativeInteger(playerStats.new_today, "new players today"),
          newLast7Days: toNonNegativeInteger(playerStats.new_last_7_days, "new players last 7 days"),
          activeLast24Hours: null,
        },
        economy: {
          totalSilver: toNonNegativeInteger(balances.total_silver, "total silver"),
          totalGold: toNonNegativeInteger(balances.total_gold, "total gold"),
          averageSilver: Math.round(Number(balances.average_silver ?? 0) * 100) / 100,
          averageGold: Math.round(Number(balances.average_gold ?? 0) * 100) / 100,
        },
        cards: {
          definitions: toNonNegativeInteger(cards.definitions, "card definitions"),
          ownedInstances: toNonNegativeInteger(cards.owned_instances, "owned instances"),
          rarityCounts,
          mostPopular: popular ? {
            cardId: popular.card_id,
            displayName: popular.display_name ?? popular.card_id,
            ownedCopies: toNonNegativeInteger(popular.owned_copies, "popular card copies"),
          } : null,
        },
        gameData: {
          duels: toNonNegativeInteger(games.duels, "duels"),
          duelWins: toNonNegativeInteger(games.duel_wins, "duel wins"),
          duelLosses: toNonNegativeInteger(games.duel_losses, "duel losses"),
          limitedPromoRedemptions: toNonNegativeInteger(games.redemptions, "limited redemptions"),
          shopActivityConnected: false,
        },
      };
    } catch (error) {
      throw new AdminPersistenceError({ cause: error });
    }
  }

  async listPlayers(options: AdminPlayerListOptions): Promise<AdminPlayersResponse> {
    try {
      const values: unknown[] = [];
      const filters: string[] = [];
      const add = (value: unknown) => { values.push(value); return `$${values.length}`; };
      if (options.search) {
        const parameter = add(`%${options.search}%`);
        const exactParameter = add(options.search);
        filters.push(`(
          players.id::text = ${exactParameter}
          OR COALESCE(identity.provider_user_id, players.telegram_user_id::text, '') = ${exactParameter}
          OR (
            COALESCE(players.username, '') || ' ' ||
            COALESCE(players.nickname, '') || ' ' ||
            players.first_name || ' ' ||
            COALESCE(players.last_name, '')
          ) ILIKE ${parameter}
        )`);
      }
      if (options.levelMin !== undefined) filters.push(`players.level >= ${add(options.levelMin)}`);
      if (options.levelMax !== undefined) filters.push(`players.level <= ${add(options.levelMax)}`);
      if (options.silverMin !== undefined) filters.push(`players.silver >= ${add(options.silverMin)}`);
      if (options.goldMin !== undefined) filters.push(`players.gold >= ${add(options.goldMin)}`);
      if (options.createdFrom) filters.push(`players.created_at >= ${add(options.createdFrom)}::timestamptz`);
      if (options.createdTo) filters.push(`players.created_at < (${add(options.createdTo)}::date + INTERVAL '1 day')`);
      const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const sortColumns = {
        createdAt: "players.created_at",
        gold: "players.gold",
        level: "players.level",
        name: "COALESCE(players.nickname, players.username, players.first_name)",
        silver: "players.silver",
      } as const;
      const order = `${sortColumns[options.sort]} ${options.direction.toUpperCase()}, players.id ASC`;
      const countValues = [...values];
      const limitParameter = add(options.limit);
      const offsetParameter = add((options.page - 1) * options.limit);
      const from = `
        FROM players
        LEFT JOIN LATERAL (
          SELECT provider_user_id FROM auth_identities
          WHERE player_id = players.id AND provider = 'telegram'
          ORDER BY created_at LIMIT 1
        ) identity ON TRUE
      `;
      const [rows, totalResult] = await Promise.all([
        this.pool.query<PlayerRow>(
          `SELECT ${PLAYER_PROJECTION} ${from} ${where} ORDER BY ${order} LIMIT ${limitParameter} OFFSET ${offsetParameter}`,
          values,
        ),
        this.pool.query<{ total: string }>(`SELECT COUNT(*) AS total ${from} ${where}`, countValues),
      ]);
      const total = toNonNegativeInteger(totalResult.rows[0]?.total ?? 0, "player result total");
      return { players: rows.rows.map(mapPlayer), ...pagination(options.page, options.limit, total) };
    } catch (error) {
      if (error instanceof AdminDomainError) throw error;
      throw new AdminPersistenceError({ cause: error });
    }
  }

  async getPlayer(playerId: string, cardPage: number, cardLimit: number): Promise<AdminPlayerDetailResponse> {
    try {
      const playerPromise = loadPlayer(this.pool, playerId);
      const cardsFrom = `
        FROM player_card_instances instances
        INNER JOIN cards ON cards.id = instances.card_id
        LEFT JOIN player_decks ON player_decks.player_id = instances.player_id
        LEFT JOIN deck_slots
          ON deck_slots.deck_id = player_decks.id AND deck_slots.card_instance_id = instances.id
        WHERE instances.player_id = $1
      `;
      const [playerRow, cardsResult, cardsCount, deckResult] = await Promise.all([
        playerPromise,
        this.pool.query<OwnedCardRow>(
          `SELECT ${OWNED_CARD_PROJECTION} ${cardsFrom}
           ORDER BY deck_slots.slot NULLS LAST, cards.code, instances.created_at, instances.id
           LIMIT $2 OFFSET $3`,
          [playerId, cardLimit, (cardPage - 1) * cardLimit],
        ),
        this.pool.query<{ total: string }>(
          "SELECT COUNT(*) AS total FROM player_card_instances WHERE player_id = $1",
          [playerId],
        ),
        this.pool.query<OwnedCardRow>(
          `SELECT ${OWNED_CARD_PROJECTION} ${cardsFrom}
           AND deck_slots.slot IS NOT NULL
           ORDER BY deck_slots.slot`,
          [playerId],
        ),
      ]);
      const total = toNonNegativeInteger(cardsCount.rows[0]?.total ?? 0, "owned card total");
      return {
        player: mapPlayer(playerRow),
        cards: cardsResult.rows.map(mapOwnedCard),
        cardsPagination: pagination(cardPage, cardLimit, total),
        deck: deckResult.rows.map(mapOwnedCard),
      };
    } catch (error) {
      if (error instanceof AdminDomainError) throw error;
      throw new AdminPersistenceError({ cause: error });
    }
  }

  async adjustCurrency(
    admin: AdminIdentity,
    playerId: string,
    currency: AdminCurrency,
    delta: number,
  ): Promise<AdminPlayerMutationResponse> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const before = await loadPlayer(client, playerId, true);
      const current = toNonNegativeInteger(before[currency], `player ${currency}`);
      const next = current + delta;
      if (!Number.isSafeInteger(next) || next < 0) {
        throw new AdminDomainError(409, "invalid_balance", "Баланс не може бути від’ємним або виходити за безпечний діапазон");
      }
      await client.query(
        `UPDATE players SET ${currency} = $2, updated_at = NOW() WHERE id = $1`,
        [playerId, next],
      );
      const action = currency === "gold"
        ? (delta > 0 ? "PLAYER_ADD_GOLD" : "PLAYER_REMOVE_GOLD")
        : (delta > 0 ? "PLAYER_ADD_SILVER" : "PLAYER_REMOVE_SILVER");
      await recordAdminAudit(client, admin, {
        action,
        entityType: "player",
        entityId: playerId,
        before: { [currency]: current },
        after: { [currency]: next },
        metadata: { currency, delta },
      });
      const player = mapPlayer(await loadPlayer(client, playerId));
      await client.query("COMMIT");
      return {
        message: `Гравцю ${delta > 0 ? "додано" : "забрано"} ${Math.abs(delta)} ${currency === "gold" ? "золота" : "срібла"}`,
        player,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof AdminDomainError) throw error;
      throw new AdminPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }

  async changeLevel(admin: AdminIdentity, playerId: string, level: number): Promise<AdminPlayerMutationResponse> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const before = await loadPlayer(client, playerId, true);
      const previousLevel = toNonNegativeInteger(before.level, "player level");
      const previousXp = toNonNegativeInteger(before.account_xp, "account XP");
      const nextXp = level === MAX_ACCOUNT_LEVEL ? 0 : Math.min(previousXp, getRequiredAccountXp(level) - 1);
      await client.query(
        "UPDATE players SET level = $2, account_xp = $3, updated_at = NOW() WHERE id = $1",
        [playerId, level, nextXp],
      );
      await recordAdminAudit(client, admin, {
        action: "PLAYER_LEVEL_CHANGE",
        entityType: "player",
        entityId: playerId,
        before: { level: previousLevel, accountXp: previousXp },
        after: { level, accountXp: nextXp },
      });
      const player = mapPlayer(await loadPlayer(client, playerId));
      await client.query("COMMIT");
      return { message: `Рівень змінено: ${previousLevel} → ${level}`, player };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof AdminDomainError) throw error;
      throw new AdminPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }

  async grantCards(
    admin: AdminIdentity,
    playerId: string,
    cardId: string,
    quantity: number,
    level: number,
  ): Promise<AdminCardGrantResponse> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await loadPlayer(client, playerId, true);
      const cardResult = await client.query<CardDefinitionRow>(
        `SELECT cards.id, cards.code, cards.display_name, cards.art_key, cards.element,
          cards.collection_id, cards.description, cards.min_rarity, cards.shop_eligible,
          cards.limited, cards.source, NULL::text AS collection_name, 0 AS owned_copies
         FROM cards WHERE cards.id = $1 FOR SHARE OF cards`,
        [cardId],
      );
      const row = cardResult.rows[0];
      if (!row) throw new AdminDomainError(404, "card_not_found", "Карту не знайдено");
      const definition: CardDefinition = {
        id: row.id,
        code: row.code,
        displayName: row.display_name,
        description: row.description,
        artKey: row.art_key,
        element: row.element,
        collectionId: row.collection_id,
        minRarity: row.min_rarity,
        shopEligible: row.shop_eligible,
        limited: row.limited,
        source: row.source,
      };
      const createdCards: AdminOwnedCard[] = [];
      for (let index = 0; index < quantity; index += 1) {
        const card = await createStandardCardInstance(client, playerId, definition, level, this.cardRng);
        createdCards.push({ ...card, inDeck: false, slot: null });
      }
      await recordCardDiscovery(client, playerId, cardId);
      const deck = await recalculateAutomaticDeck(client, playerId);
      await recordAdminAudit(client, admin, {
        action: "PLAYER_ADD_CARD",
        entityType: "player",
        entityId: playerId,
        after: { cardId, quantity, level, instanceIds: createdCards.map(({ instanceId }) => instanceId) },
        metadata: { cardCode: row.code },
      });
      await client.query("COMMIT");
      return {
        createdCards,
        deckChanged: deck.status === "updated",
        deckPower: deck.status === "insufficient_valid_cards" ? null : deck.totalPower,
        message: quantity === 1 ? "Карту видано" : `Видано карт: ${quantity}`,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof AdminDomainError) throw error;
      throw new AdminPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }

  async removeCard(
    admin: AdminIdentity,
    playerId: string,
    instanceId: string,
  ): Promise<AdminCardRemoveResponse> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await loadPlayer(client, playerId, true);
      const cardResult = await client.query<OwnedCardRow>(
        `SELECT ${OWNED_CARD_PROJECTION}
         FROM player_card_instances instances
         INNER JOIN cards ON cards.id = instances.card_id
         LEFT JOIN player_decks ON player_decks.player_id = instances.player_id
         LEFT JOIN deck_slots ON deck_slots.deck_id = player_decks.id AND deck_slots.card_instance_id = instances.id
         WHERE instances.player_id = $1 AND instances.id = $2
         FOR UPDATE OF instances`,
        [playerId, instanceId],
      );
      const row = cardResult.rows[0];
      if (!row) throw new AdminDomainError(404, "card_instance_not_found", "Екземпляр карти не знайдено");
      const before = mapOwnedCard(row);
      if (before.inDeck) {
        await client.query(
          "DELETE FROM deck_slots USING player_decks WHERE deck_slots.deck_id = player_decks.id AND player_decks.player_id = $1 AND deck_slots.card_instance_id = $2",
          [playerId, instanceId],
        );
      }
      const deleted = await client.query(
        "DELETE FROM player_card_instances WHERE player_id = $1 AND id = $2",
        [playerId, instanceId],
      );
      if (deleted.rowCount !== 1) throw new AdminDomainError(409, "card_instance_changed", "Карта вже була змінена іншим запитом");
      const deck = await recalculateAutomaticDeck(client, playerId);
      if (before.inDeck && deck.status === "insufficient_valid_cards") {
        throw new AdminDomainError(409, "deck_would_be_invalid", "Карту не можна забрати: після цього неможливо сформувати валідну колоду з 9 карт");
      }
      await recordAdminAudit(client, admin, {
        action: "PLAYER_REMOVE_CARD",
        entityType: "player",
        entityId: playerId,
        before,
        after: { removedInstanceId: instanceId },
      });
      await client.query("COMMIT");
      return {
        removedInstanceId: instanceId,
        deckChanged: deck.status === "updated",
        deckPower: deck.status === "insufficient_valid_cards" ? null : deck.totalPower,
        message: "Карту забрано",
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof AdminDomainError) throw error;
      throw new AdminPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }

  async listCards(options: AdminCardListOptions): Promise<AdminCardsResponse> {
    try {
      const values: unknown[] = [];
      const filters: string[] = [];
      const add = (value: unknown) => { values.push(value); return `$${values.length}`; };
      if (options.search) {
        const parameter = add(`%${options.search}%`);
        filters.push(`(cards.id ILIKE ${parameter} OR cards.code ILIKE ${parameter} OR COALESCE(cards.display_name, '') ILIKE ${parameter})`);
      }
      if (options.element) filters.push(`cards.element = ${add(options.element)}`);
      if (options.minRarity) filters.push(`cards.min_rarity = ${add(options.minRarity)}`);
      if (options.collectionId) filters.push(`cards.collection_id = ${add(options.collectionId)}`);
      if (options.limited !== undefined) filters.push(`cards.limited = ${add(options.limited)}`);
      const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const sortColumns = {
        code: "cards.code",
        element: "cards.element",
        name: "COALESCE(cards.display_name, cards.code)",
        ownedCopies: "COUNT(instances.id)",
      } as const;
      const order = `${sortColumns[options.sort]} ${options.direction.toUpperCase()}, cards.id ASC`;
      const countValues = [...values];
      const limitParameter = add(options.limit);
      const offsetParameter = add((options.page - 1) * options.limit);
      const [rows, totalResult] = await Promise.all([
        this.pool.query<CardDefinitionRow>(
          `SELECT cards.id, cards.code, cards.display_name, cards.description, cards.art_key,
            cards.element, cards.collection_id, collections.display_name AS collection_name,
            cards.min_rarity, cards.shop_eligible, cards.limited, cards.source,
            COUNT(instances.id) AS owned_copies
           FROM cards
           LEFT JOIN collections ON collections.id = cards.collection_id
           LEFT JOIN player_card_instances instances ON instances.card_id = cards.id
           ${where}
           GROUP BY cards.id, collections.display_name
           ORDER BY ${order}
           LIMIT ${limitParameter} OFFSET ${offsetParameter}`,
          values,
        ),
        this.pool.query<{ total: string }>(`SELECT COUNT(*) AS total FROM cards ${where}`, countValues),
      ]);
      const total = toNonNegativeInteger(totalResult.rows[0]?.total ?? 0, "card result total");
      const cards: AdminCardDefinitionItem[] = rows.rows.map((row) => ({
        artKey: row.art_key,
        code: row.code,
        collectionId: row.collection_id,
        collectionName: row.collection_name,
        description: row.description,
        displayName: row.display_name,
        element: row.element,
        id: row.id,
        limited: row.limited,
        minRarity: row.min_rarity,
        ownedCopies: toNonNegativeInteger(row.owned_copies, "owned copies"),
        shopEligible: row.shop_eligible,
        source: row.source,
      }));
      return { cards, ...pagination(options.page, options.limit, total) };
    } catch (error) {
      throw new AdminPersistenceError({ cause: error });
    }
  }

  async listAudit(options: AdminAuditListOptions): Promise<AdminAuditResponse> {
    try {
      const values: unknown[] = [];
      const filters: string[] = [];
      const add = (value: unknown) => { values.push(value); return `$${values.length}`; };
      if (options.admin) {
        const parameter = add(`%${options.admin}%`);
        filters.push(`(COALESCE(admin_player_id::text, '') ILIKE ${parameter} OR admin_telegram_user_id ILIKE ${parameter})`);
      }
      if (options.action) filters.push(`action = ${add(options.action)}`);
      if (options.entityType) filters.push(`entity_type = ${add(options.entityType)}`);
      if (options.entityId) filters.push(`entity_id ILIKE ${add(`%${options.entityId}%`)}`);
      if (options.dateFrom) filters.push(`created_at >= ${add(options.dateFrom)}::timestamptz`);
      if (options.dateTo) filters.push(`created_at < (${add(options.dateTo)}::date + INTERVAL '1 day')`);
      const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const countValues = [...values];
      const limitParameter = add(options.limit);
      const offsetParameter = add((options.page - 1) * options.limit);
      const [rows, totalResult] = await Promise.all([
        this.pool.query<{
          action: string; admin_player_id: string | null; admin_telegram_user_id: string;
          after_state: unknown; before_state: unknown; created_at: Date | string; entity_id: string;
          entity_type: string; id: string; metadata: unknown;
        }>(
          `SELECT id, admin_player_id, admin_telegram_user_id, action, entity_type,
            entity_id, before_state, after_state, metadata, created_at
           FROM admin_audit_logs ${where}
           ORDER BY created_at DESC, id DESC
           LIMIT ${limitParameter} OFFSET ${offsetParameter}`,
          values,
        ),
        this.pool.query<{ total: string }>(`SELECT COUNT(*) AS total FROM admin_audit_logs ${where}`, countValues),
      ]);
      const total = toNonNegativeInteger(totalResult.rows[0]?.total ?? 0, "audit result total");
      const logs: AdminAuditLogItem[] = rows.rows.map((row) => ({
        action: row.action,
        adminPlayerId: row.admin_player_id,
        adminTelegramUserId: row.admin_telegram_user_id,
        after: row.after_state,
        before: row.before_state,
        createdAt: toIso(row.created_at),
        entityId: row.entity_id,
        entityType: row.entity_type,
        id: row.id,
        metadata: row.metadata,
      }));
      return { logs, ...pagination(options.page, options.limit, total) };
    } catch (error) {
      throw new AdminPersistenceError({ cause: error });
    }
  }
}

export const ADMIN_LIMITS = Object.freeze({
  accountLevel: MAX_ACCOUNT_LEVEL,
  cardLevel: MAX_CARD_LEVEL,
  grantQuantity: 100,
  pageSize: 100,
});
