import { randomUUID } from "node:crypto";
import {
  canOpenChestShop,
  CHEST_SHOP_CHEST_COUNT,
  CHEST_SHOP_FEED_FROM,
  CHEST_SHOP_OPEN_MS,
  getChestPrizeLevel,
  getChestShopChest,
  getChestShopWeekKey,
  isChestShopOpen,
  pickChestPrizeKind,
  type ChestShopState,
} from "@cardastika/game-core";
import {
  CARD_ELEMENTS,
  getPlayerDisplayName,
  type ChestShopFeedEntry,
  type ChestShopGrantedPrize,
  type ChestShopOpenChestResponse,
  type ChestShopPossiblePrize,
  type ChestShopView,
} from "@cardastika/shared";
import type { Pool, PoolClient } from "pg";
import { loadLowestDeckCardLevel, loadRewardCardDefinition } from "../battlePassService.js";
import { getSeasonWindow } from "../battlePassConfig.js";
import type { CampaignService } from "../campaign/campaignService.js";
import { createMagicSourceInstance, createStandardCardInstance, CryptoCardRandomSource } from "../cards/cardInstanceCreator.js";
import { recordCardDiscovery } from "../collections/discoveryService.js";
import { mapCardInstanceRow, type CardInstanceProjectionRow } from "../cards/cardInstanceMapper.js";
import { recalculateAutomaticDeck } from "../decks/automaticDeckService.js";
import { grantRandomEquipment } from "../equipment/equipmentChestService.js";

const FEED_SIZE = 15;

export class ChestShopError extends Error {
  constructor(readonly code: "chest_shop_closed" | "chest_shop_unavailable" | "chest_shop_conflict" | "not_enough_silver" | "player_not_found") {
    super(code);
    this.name = "ChestShopError";
  }
}

interface ShopRow {
  chest_shop_open_until: Date | null;
  chest_shop_next: number;
  /** Read as `::text` so a DATE never shifts with the server timezone. */
  chest_shop_week: string | null;
}

interface FeedRow {
  chest_number: number;
  created_at: Date;
  first_name: string;
  nickname: string | null;
  prize: ChestShopGrantedPrize;
  username: string | null;
}

/** One card instance in the same shape the inventory and shop use. */
async function loadCardInstance(client: PoolClient, instanceId: string) {
  const result = await client.query<CardInstanceProjectionRow>(
    `SELECT player_card_instances.id AS instance_id, cards.id AS card_id, cards.code, cards.display_name, cards.art_key,
       cards.element, player_card_instances.level, player_card_instances.bonus_power,
       player_card_instances.level_progress_elements, player_card_instances.stored_elements, cards.collection_id, cards.limited
     FROM player_card_instances INNER JOIN cards ON cards.id = player_card_instances.card_id
     WHERE player_card_instances.id = $1`,
    [instanceId],
  );
  return result.rows[0] ? mapCardInstanceRow(result.rows[0]) : null;
}

function toState(row: ShopRow): ChestShopState {
  return {
    openUntil: row.chest_shop_open_until ? new Date(row.chest_shop_open_until) : null,
    nextChest: row.chest_shop_next,
    weeklyOpenedWeek: row.chest_shop_week,
  };
}

function nextWeekStart(now: Date) {
  const monday = new Date(`${getChestShopWeekKey(now)}T00:00:00.000Z`);
  monday.setUTCDate(monday.getUTCDate() + 7);
  return monday;
}

/** The six prizes the chest can hold, as the reference page lists them. */
function possiblePrizes(chestNumber: number, ninthCardLevel: number): ChestShopPossiblePrize[] {
  const chest = getChestShopChest(chestNumber);
  const level = getChestPrizeLevel(chestNumber, ninthCardLevel);
  return [
    { kind: "gold_small", amount: chest.goldSmall },
    { kind: "gold_large", amount: chest.goldLarge },
    { kind: "diamonds", amount: chest.diamonds },
    { kind: "equipment", equipmentRarity: chest.equipmentRarity },
    { kind: "card", level },
    { kind: "source", level },
  ];
}

export class ChestShopService {
  constructor(
    private readonly pool: Pool,
    private readonly options: { campaign?: Pick<CampaignService, "recordEvent">; random?: () => number } = {},
  ) {}

  async getShop(playerId: string, now = new Date()): Promise<ChestShopView> {
    const client = await this.pool.connect();
    try {
      return await this.buildView(client, playerId, await this.readState(client, playerId, false), now);
    } finally {
      client.release();
    }
  }

  /** Starts this week's opening: four hours, beginning again from chest 1. */
  async openShop(playerId: string, now = new Date()): Promise<ChestShopView> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const state = await this.readState(client, playerId, true);
      if (!canOpenChestShop(state, now)) throw new ChestShopError("chest_shop_unavailable");
      const opened: ChestShopState = {
        openUntil: new Date(now.getTime() + CHEST_SHOP_OPEN_MS),
        nextChest: 1,
        weeklyOpenedWeek: getChestShopWeekKey(now),
      };
      await client.query(
        "UPDATE players SET chest_shop_open_until = $2, chest_shop_next = 1, chest_shop_week = $3, updated_at = NOW() WHERE id = $1",
        [playerId, opened.openUntil, opened.weeklyOpenedWeek],
      );
      const view = await this.buildView(client, playerId, opened, now);
      await client.query("COMMIT");
      return view;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /** Buys the next chest in order for silver and grants its random prize. */
  async openChest(playerId: string, chestNumber: number, now = new Date()): Promise<ChestShopOpenChestResponse> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const state = await this.readState(client, playerId, true);
      if (!isChestShopOpen(state, now)) throw new ChestShopError("chest_shop_closed");
      if (state.nextChest !== chestNumber) throw new ChestShopError("chest_shop_conflict");
      const chest = getChestShopChest(chestNumber);
      const paid = await client.query<{ gold: string | number; silver: string | number }>(
        "UPDATE players SET silver = silver - $2, updated_at = NOW() WHERE id = $1 AND silver >= $2 RETURNING gold, silver",
        [playerId, chest.price],
      );
      if (!paid.rows[0]) throw new ChestShopError("not_enough_silver");

      const prize = await this.grantPrize(client, playerId, chestNumber, now);
      // The 15th chest closes the shop at once; the weekly opening is then used up.
      const last = chestNumber === CHEST_SHOP_CHEST_COUNT;
      const nextState: ChestShopState = { ...state, nextChest: last ? 1 : chestNumber + 1, openUntil: last ? null : state.openUntil };
      const balance = await client.query<{ gold: string | number; silver: string | number }>(
        `UPDATE players SET chest_shop_next = $2, chest_shop_open_until = $3, updated_at = NOW()
         WHERE id = $1 RETURNING gold, silver`,
        [playerId, nextState.nextChest, nextState.openUntil],
      );
      await client.query(
        "INSERT INTO chest_shop_openings (id, player_id, chest_number, price, prize, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
        [randomUUID(), playerId, chestNumber, chest.price, JSON.stringify(prize), now],
      );
      if (last) await this.options.campaign?.recordEvent(client, playerId, "CHEST_15_OPENED", {}, now);
      const shop = await this.buildView(client, playerId, nextState, now);
      await client.query("COMMIT");
      return {
        prize,
        chestNumber,
        player: { gold: Number(balance.rows[0]!.gold), silver: Number(balance.rows[0]!.silver) },
        shop,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async readState(client: PoolClient, playerId: string, lock: boolean) {
    const result = await client.query<ShopRow>(
      `SELECT chest_shop_open_until, chest_shop_next, chest_shop_week::text AS chest_shop_week
       FROM players WHERE id = $1${lock ? " FOR UPDATE" : ""}`,
      [playerId],
    );
    if (!result.rows[0]) throw new ChestShopError("player_not_found");
    return toState(result.rows[0]);
  }

  private async grantPrize(client: PoolClient, playerId: string, chestNumber: number, now: Date): Promise<ChestShopGrantedPrize> {
    const random = this.options.random ?? Math.random;
    const chest = getChestShopChest(chestNumber);
    const kind = pickChestPrizeKind(random);
    if (kind === "gold_small" || kind === "gold_large") {
      const amount = kind === "gold_small" ? chest.goldSmall : chest.goldLarge;
      await client.query("UPDATE players SET gold = gold + $2, updated_at = NOW() WHERE id = $1", [playerId, amount]);
      return { kind, amount };
    }
    if (kind === "diamonds") {
      // Diamonds count toward the diamond rewards, as the reference says.
      await client.query(
        `INSERT INTO player_battle_pass_state (player_id, season_id, diamonds) VALUES ($1, $2, $3)
         ON CONFLICT (player_id, season_id) DO UPDATE SET diamonds = player_battle_pass_state.diamonds + EXCLUDED.diamonds, updated_at = NOW()`,
        [playerId, getSeasonWindow(now).seasonId, chest.diamonds],
      );
      return { kind, amount: chest.diamonds };
    }
    if (kind === "equipment") {
      const item = await grantRandomEquipment(client, playerId, chest.equipmentRarity);
      return { kind, equipmentRarity: chest.equipmentRarity, equipmentItemId: item.id };
    }
    // No battle deck yet counts like a 9th card below level 19: the prize is level 1.
    const level = getChestPrizeLevel(chestNumber, await loadLowestDeckCardLevel(client, playerId).catch(() => 1));
    if (kind === "source") {
      const element = CARD_ELEMENTS[Math.floor(random() * CARD_ELEMENTS.length)]!;
      const source = await createMagicSourceInstance(client, playerId, element, level);
      const sourceCard = await loadCardInstance(client, source.instanceId);
      return { kind, level, name: source.displayName, ...(sourceCard ? { card: sourceCard, newDiscovery: false, deckChanged: false } : {}) };
    }
    const definition = await loadRewardCardDefinition(client);
    const card = await createStandardCardInstance(client, playerId, definition, level, new CryptoCardRandomSource());
    const discovery = await recordCardDiscovery(client, playerId, definition.id);
    const deckBefore = await client.query<{ card_instance_id: string }>(
      "SELECT deck_slots.card_instance_id FROM player_decks INNER JOIN deck_slots ON deck_slots.deck_id = player_decks.id WHERE player_decks.player_id = $1",
      [playerId],
    );
    await recalculateAutomaticDeck(client, playerId);
    const inDeck = await client.query("SELECT 1 FROM deck_slots WHERE card_instance_id = $1", [card.instanceId]);
    const deckChanged = Boolean(inDeck.rowCount) && !deckBefore.rows.some((row) => row.card_instance_id === card.instanceId);
    await this.options.campaign?.recordEvent(client, playerId, "CARD_ACQUIRED", { rarity: card.rarity }, now);
    if (discovery.newDiscovery) await this.options.campaign?.recordEvent(client, playerId, "CARD_DISCOVERED", {}, now);
    return { kind, level, name: definition.displayName ?? definition.code, card, newDiscovery: discovery.newDiscovery, deckChanged };
  }

  private async buildView(client: PoolClient, playerId: string, state: ChestShopState, now: Date): Promise<ChestShopView> {
    const open = isChestShopOpen(state, now);
    // An expired, unfinished shop restarts from chest 1 next time (reference).
    const chestNumber = open ? state.nextChest : 1;
    const ninthCardLevel = await loadLowestDeckCardLevel(client, playerId).catch(() => 1);
    const feed = await client.query<FeedRow>(
      `SELECT chest_shop_openings.chest_number, chest_shop_openings.prize, chest_shop_openings.created_at,
         players.first_name, players.nickname, players.username
       FROM chest_shop_openings
       INNER JOIN players ON players.id = chest_shop_openings.player_id
       WHERE chest_shop_openings.chest_number >= $1
       ORDER BY chest_shop_openings.created_at DESC
       LIMIT $2`,
      [CHEST_SHOP_FEED_FROM, FEED_SIZE],
    );
    // The player's own latest chest, so a client whose response was lost can still show the prize.
    const last = await client.query<{ chest_number: number; prize: ChestShopGrantedPrize; created_at: Date }>(
      "SELECT chest_number, prize, created_at FROM chest_shop_openings WHERE player_id = $1 ORDER BY created_at DESC LIMIT 1",
      [playerId],
    );
    const lastRow = last.rows[0];
    return {
      ...(lastRow ? { lastOpening: { chestNumber: lastRow.chest_number, prize: lastRow.prize, openedAt: new Date(lastRow.created_at).toISOString() } } : {}),
      status: open ? "open" : canOpenChestShop(state, now) ? "available" : "closed",
      openUntil: open ? state.openUntil!.toISOString() : null,
      chestNumber,
      chestCount: CHEST_SHOP_CHEST_COUNT,
      price: getChestShopChest(chestNumber).price,
      possiblePrizes: possiblePrizes(chestNumber, ninthCardLevel),
      nextWeekAt: nextWeekStart(now).toISOString(),
      // The reference feed hides the card element, level and exact amounts.
      feed: feed.rows.map((row): ChestShopFeedEntry => ({
        playerName: getPlayerDisplayName({ firstName: row.first_name, nickname: row.nickname, username: row.username }),
        chestNumber: row.chest_number,
        kind: row.prize.kind,
        ...(row.prize.equipmentRarity ? { equipmentRarity: row.prize.equipmentRarity } : {}),
        openedAt: new Date(row.created_at).toISOString(),
      })),
    };
  }
}
