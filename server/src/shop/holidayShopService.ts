import {
  priceMissingCollectionCards,
  selectGeneratedLevelForRarity,
  selectShopLevelForRarity,
  type GeneratedLevelPolicy,
} from "@cardastika/game-core";
import {
  CARD_RARITIES,
  SHOP_CURRENCIES,
  type CardDefinition,
  type CardRarity,
  type HolidayBundlePurchaseResponse,
  type HolidayShopEvent,
  type HolidayShopResponse,
  type ShopCurrency,
} from "@cardastika/shared";
import type { Pool, PoolClient } from "pg";
import type { CampaignService } from "../campaign/campaignService.js";
import { createStandardCardInstance } from "../cards/cardInstanceCreator.js";
import { recordCardDiscovery } from "../collections/discoveryService.js";
import { recalculateAutomaticDeck, type AutomaticDeckRecalculationResult } from "../decks/automaticDeckService.js";
import {
  findActiveHolidayWindow,
  findNextHolidayWindow,
  holidayWindowKey,
  type HolidaySpan,
  type HolidayWindow,
} from "./holidayCalendar.js";
import type { ShopRandomSource } from "./shopChancePolicy.js";
import { CryptoShopRandomSource } from "./shopRewardSelector.js";
import {
  InsufficientShopFundsError,
  loadCurrentDeckPower,
  ShopBundleMissingError,
  ShopBundleUnavailableError,
  ShopCollectionCompleteError,
  ShopPersistenceError,
  ShopPlayerMissingError,
  ShopPriceChangedError,
  toBalance,
} from "./shopService.js";

export class HolidayNotActiveError extends Error {
  constructor() {
    super("The holiday of this bundle is not running");
    this.name = "HolidayNotActiveError";
  }
}

export class HolidayLimitReachedError extends Error {
  constructor() {
    super("The holiday bundle purchase limit is reached");
    this.name = "HolidayLimitReachedError";
  }
}

interface HolidayRow {
  description: string;
  display_name: string;
  end_day: number;
  end_month: number;
  id: string;
  start_day: number;
  start_month: number;
}

interface HolidayBundleRow {
  card_count: number;
  collection_code: string;
  collection_name: string | null;
  currency: string;
  display_name: string;
  full_set: boolean;
  holiday_id: string;
  id: string;
  price: number;
  purchase_limit: number;
  rarity: string;
}

interface CollectionCardRow {
  art_key: string | null;
  card_id: string;
  code: string;
  collection_id: string | null;
  description: string;
  discovered: boolean;
  display_name: string | null;
  element: CardDefinition["element"];
  limited: boolean;
  min_rarity: CardRarity;
  shop_eligible: boolean;
  source: string;
}

interface HolidayShopDependencies {
  campaign?: Pick<CampaignService, "recordEvent">;
  levelPolicy?: GeneratedLevelPolicy;
  now?: () => Date;
  recalculateDeck?: (client: PoolClient, playerId: string) => Promise<AutomaticDeckRecalculationResult>;
  rng?: ShopRandomSource;
}

const rarityRank = new Map<string, number>(CARD_RARITIES.map((rarity, index) => [rarity, index]));

function toSpan(row: Pick<HolidayRow, "end_day" | "end_month" | "start_day" | "start_month">): HolidaySpan {
  return { startMonth: row.start_month, startDay: row.start_day, endMonth: row.end_month, endDay: row.end_day };
}

function toCurrency(value: string): ShopCurrency {
  const currency = SHOP_CURRENCIES.find((candidate) => candidate === value);
  if (!currency) throw new Error("Unknown holiday bundle currency");
  return currency;
}

function toRarity(value: string): CardRarity {
  const rarity = CARD_RARITIES.find((candidate) => candidate === value);
  if (!rarity) throw new Error("Unknown holiday bundle rarity");
  return rarity;
}

/**
 * The price of a full-set bundle for a player: the ladder price of the cards still undiscovered,
 * never above the whole collection's price (`bundle.price`); nothing discovered keeps that price.
 */
function fullSetPrice(listPrice: number, members: readonly CollectionCardRow[], missing: readonly CollectionCardRow[]) {
  if (!members.length || !missing.length) return listPrice;
  return priceMissingCollectionCards(missing.map((card) => card.min_rarity), members.length, listPrice);
}

/** Picks `count` distinct items with a partial Fisher–Yates shuffle. */
function pickDistinct<T>(items: readonly T[], count: number, rng: ShopRandomSource) {
  const pool = [...items];
  for (let index = 0; index < count; index += 1) {
    const swap = index + rng.nextInt(pool.length - index);
    [pool[index], pool[swap]] = [pool[swap]!, pool[index]!];
  }
  return pool.slice(0, count);
}

const BUNDLE_COLUMNS = `
  bundles.id, bundles.holiday_id, bundles.display_name, bundles.collection_code, bundles.full_set,
  bundles.card_count, bundles.rarity, bundles.currency, bundles.price, bundles.purchase_limit,
  collections.display_name AS collection_name
`;

export class HolidayShopService {
  private readonly campaign?: Pick<CampaignService, "recordEvent">;
  private readonly levelPolicy: GeneratedLevelPolicy;
  private readonly now: () => Date;
  private readonly recalculateDeck: NonNullable<HolidayShopDependencies["recalculateDeck"]>;
  private readonly rng: ShopRandomSource;

  constructor(
    private readonly pool: Pick<Pool, "connect" | "query">,
    dependencies: HolidayShopDependencies = {},
  ) {
    this.campaign = dependencies.campaign;
    this.levelPolicy = dependencies.levelPolicy ?? selectShopLevelForRarity;
    this.now = dependencies.now ?? (() => new Date());
    this.recalculateDeck = dependencies.recalculateDeck ?? recalculateAutomaticDeck;
    this.rng = dependencies.rng ?? new CryptoShopRandomSource();
  }

  async getCatalog(playerId: string): Promise<HolidayShopResponse> {
    try {
      const now = this.now();
      const playerResult = await this.pool.query<{ gold: string | number; silver: string | number }>(
        "SELECT silver, gold FROM players WHERE id = $1",
        [playerId],
      );
      const player = playerResult.rows[0];
      if (!player) throw new ShopPlayerMissingError();
      const balance = toBalance(player);

      const holidayResult = await this.pool.query<HolidayRow>(
        `
          SELECT id, display_name, description, start_month, start_day, end_month, end_day
          FROM shop_holidays
          WHERE enabled = TRUE
          ORDER BY position, id
        `,
      );
      const active: Array<{ row: HolidayRow; window: HolidayWindow }> = [];
      let upcoming: { row: HolidayRow; window: HolidayWindow } | null = null;
      for (const row of holidayResult.rows) {
        const window = findActiveHolidayWindow(toSpan(row), now);
        if (window) {
          active.push({ row, window });
          continue;
        }
        const next = findNextHolidayWindow(toSpan(row), now);
        if (!upcoming || next.startsAt < upcoming.window.startsAt) upcoming = { row, window: next };
      }
      const shown = upcoming ? [...active, upcoming] : active;
      if (!shown.length) return { holidays: [] };

      const bundleResult = await this.pool.query<HolidayBundleRow>(
        `
          SELECT ${BUNDLE_COLUMNS}
          FROM shop_holiday_bundles bundles
          LEFT JOIN collections ON collections.code = bundles.collection_code
          WHERE bundles.holiday_id = ANY($1::text[])
          ORDER BY bundles.position, bundles.id
        `,
        [shown.map(({ row }) => row.id)],
      );
      const purchaseResult = await this.pool.query<{ bundle_id: string; purchase_count: number; window_start: string }>(
        `
          SELECT bundle_id, window_start::text AS window_start, purchase_count
          FROM player_holiday_bundle_purchases
          WHERE player_id = $1 AND bundle_id = ANY($2::text[])
        `,
        [playerId, bundleResult.rows.map((bundle) => bundle.id)],
      );
      const purchased = new Map(purchaseResult.rows.map((row) => [`${row.bundle_id}:${row.window_start.slice(0, 10)}`, Number(row.purchase_count)]));
      const fullSetCodes = [...new Set(bundleResult.rows.filter((bundle) => bundle.full_set).map((bundle) => bundle.collection_code))];
      const memberRows = fullSetCodes.length
        ? (await this.pool.query<CollectionCardRow & { collection_code: string }>(
            `
              SELECT collections.code AS collection_code, cards.id AS card_id, cards.code, cards.display_name, cards.art_key,
                cards.element, cards.collection_id, cards.min_rarity, cards.shop_eligible, cards.description, cards.limited, cards.source,
                EXISTS (SELECT 1 FROM player_card_discoveries discoveries WHERE discoveries.card_id = cards.id AND discoveries.player_id = $1) AS discovered
              FROM collections
              INNER JOIN collection_cards ON collection_cards.collection_id = collections.id
              INNER JOIN cards ON cards.id = collection_cards.card_id
              WHERE collections.code = ANY($2::text[])
              ORDER BY collections.code, collection_cards.position
            `,
            [playerId, fullSetCodes],
          )).rows
        : [];

      return {
        holidays: shown.map(({ row, window }): HolidayShopEvent => ({
          id: row.id,
          displayName: row.display_name,
          description: row.description,
          startsAt: window.startsAt.toISOString(),
          endsAt: window.endsAt.toISOString(),
          active: active.some((entry) => entry.row.id === row.id),
          bundles: bundleResult.rows
            .filter((bundle) => bundle.holiday_id === row.id)
            .map((bundle) => {
              const currency = toCurrency(bundle.currency);
              const members = bundle.full_set ? memberRows.filter((card) => card.collection_code === bundle.collection_code) : [];
              const missing = members.filter((card) => !card.discovered);
              const price = bundle.full_set ? fullSetPrice(Number(bundle.price), members, missing) : Number(bundle.price);
              return {
                id: bundle.id,
                fullSet: bundle.full_set,
                missingCount: bundle.full_set && members.length ? missing.length : Number(bundle.card_count),
                displayName: bundle.display_name,
                collectionName: bundle.collection_name ?? bundle.collection_code,
                cardCount: Number(bundle.card_count),
                rarity: toRarity(bundle.rarity),
                currency,
                price,
                purchaseLimit: Number(bundle.purchase_limit),
                purchased: purchased.get(`${bundle.id}:${holidayWindowKey(window)}`) ?? 0,
                canAfford: balance[currency] >= price,
              };
            }),
        })),
      };
    } catch (error) {
      if (error instanceof ShopPlayerMissingError) throw error;
      throw new ShopPersistenceError();
    }
  }

  /** One transaction: the gold, the limit counter and every card land together or not at all. */
  async purchase(playerId: string, bundleId: string, expectedPrice?: number): Promise<HolidayBundlePurchaseResponse> {
    let client: PoolClient;
    try {
      client = await this.pool.connect();
    } catch {
      throw new ShopPersistenceError();
    }

    try {
      await client.query("BEGIN");
      const bundleResult = await client.query<HolidayBundleRow & Pick<HolidayRow, "end_day" | "end_month" | "start_day" | "start_month">>(
        `
          SELECT ${BUNDLE_COLUMNS},
            holidays.start_month, holidays.start_day, holidays.end_month, holidays.end_day
          FROM shop_holiday_bundles bundles
          INNER JOIN shop_holidays holidays ON holidays.id = bundles.holiday_id AND holidays.enabled = TRUE
          LEFT JOIN collections ON collections.code = bundles.collection_code
          WHERE bundles.id = $1
        `,
        [bundleId],
      );
      const bundle = bundleResult.rows[0];
      if (!bundle) throw new ShopBundleMissingError();
      const window = findActiveHolidayWindow(toSpan(bundle), this.now());
      if (!window) throw new HolidayNotActiveError();
      const currency = toCurrency(bundle.currency);
      const rarity = toRarity(bundle.rarity);
      const listPrice = Number(bundle.price);
      const cardCount = Number(bundle.card_count);

      const playerResult = await client.query<{ gold: string | number; silver: string | number }>(
        "SELECT silver, gold FROM players WHERE id = $1 FOR UPDATE",
        [playerId],
      );
      const player = playerResult.rows[0];
      if (!player) throw new ShopPlayerMissingError();
      // Cards are read under the player lock: a full set grants only undiscovered cards and is priced by them.
      const cardsResult = await client.query<CollectionCardRow>(
        `
          SELECT cards.id AS card_id, cards.code, cards.display_name, cards.art_key, cards.element,
            cards.collection_id, cards.min_rarity, cards.shop_eligible, cards.description, cards.limited, cards.source,
            EXISTS (SELECT 1 FROM player_card_discoveries discoveries WHERE discoveries.card_id = cards.id AND discoveries.player_id = $2) AS discovered
          FROM collection_cards
          INNER JOIN collections ON collections.id = collection_cards.collection_id
          INNER JOIN cards ON cards.id = collection_cards.card_id
          WHERE collections.code = $1
          ORDER BY collection_cards.position
          FOR SHARE OF cards
        `,
        [bundle.collection_code, playerId],
      );
      const sellable = cardsResult.rows.filter((card) => !card.limited && card.source === "standard");
      let price = listPrice;
      let chosen: CollectionCardRow[];
      if (bundle.full_set) {
        // Never sell a partial catalog set: every member must be a sellable standard card.
        if (!cardsResult.rows.length || sellable.length !== cardsResult.rows.length) throw new ShopBundleUnavailableError();
        chosen = cardsResult.rows.filter((card) => !card.discovered);
        if (!chosen.length) throw new ShopCollectionCompleteError();
        price = fullSetPrice(listPrice, cardsResult.rows, chosen);
      } else {
        const eligible = sellable.filter((card) => (rarityRank.get(card.min_rarity) ?? 99) <= (rarityRank.get(rarity) ?? -1));
        if (eligible.length < cardCount) throw new ShopBundleUnavailableError();
        // Undiscovered species first; already discovered ones only fill up what the new ones cannot.
        const fresh = eligible.filter((card) => !card.discovered);
        const seen = eligible.filter((card) => card.discovered);
        chosen = [
          ...pickDistinct(fresh, Math.min(cardCount, fresh.length), this.rng),
          ...pickDistinct(seen, Math.max(0, cardCount - fresh.length), this.rng),
        ];
      }
      if (expectedPrice !== undefined && expectedPrice !== price) throw new ShopPriceChangedError();
      if (toBalance(player)[currency] < price) throw new InsufficientShopFundsError(currency);

      const limitResult = await client.query<{ purchase_count: number }>(
        `
          INSERT INTO player_holiday_bundle_purchases (player_id, bundle_id, window_start, purchase_count)
          VALUES ($1, $2, $3::date, 1)
          ON CONFLICT (player_id, bundle_id, window_start) DO UPDATE
            SET purchase_count = player_holiday_bundle_purchases.purchase_count + 1, updated_at = NOW()
            WHERE player_holiday_bundle_purchases.purchase_count < $4
          RETURNING purchase_count
        `,
        [playerId, bundle.id, holidayWindowKey(window), Number(bundle.purchase_limit)],
      );
      const purchasedRow = limitResult.rows[0];
      if (!purchasedRow) throw new HolidayLimitReachedError();

      const previousDeckPower = await loadCurrentDeckPower(client, playerId);
      const balanceResult = await client.query<{ gold: string | number; silver: string | number }>(
        `
          UPDATE players
          SET ${currency} = ${currency} - $2, updated_at = NOW()
          WHERE id = $1 AND ${currency} >= $2
          RETURNING silver, gold
        `,
        [playerId, price],
      );
      const updatedPlayer = balanceResult.rows[0];
      if (!updatedPlayer) throw new InsufficientShopFundsError(currency);

      const rewards: HolidayBundlePurchaseResponse["rewards"] = [];
      const newDiscoveryCardIds: string[] = [];
      let collectionCompleted: HolidayBundlePurchaseResponse["collectionCompleted"];
      for (const row of chosen) {
        const definition: CardDefinition = {
          id: row.card_id,
          code: row.code,
          displayName: row.display_name,
          artKey: row.art_key,
          element: row.element,
          collectionId: row.collection_id,
          description: row.description,
          minRarity: row.min_rarity,
          shopEligible: row.shop_eligible,
          limited: row.limited,
        };
        // A full set creates each card at the level range of its own rarity, the other bundles at the bundle rarity.
        const level = selectGeneratedLevelForRarity(bundle.full_set ? row.min_rarity : rarity, this.rng, this.levelPolicy);
        const reward = await createStandardCardInstance(client, playerId, definition, level, this.rng);
        const discovery = await recordCardDiscovery(client, playerId, definition.id);
        rewards.push(reward);
        if (discovery.newDiscovery) newDiscoveryCardIds.push(definition.id);
        if (discovery.collectionCompleted) collectionCompleted = discovery.collectionCompleted;
        await this.campaign?.recordEvent(client, playerId, "SHOP_CARD_PURCHASED");
        await this.campaign?.recordEvent(client, playerId, "CARD_ACQUIRED", { rarity: reward.rarity });
        if (discovery.newDiscovery) await this.campaign?.recordEvent(client, playerId, "CARD_DISCOVERED");
      }

      const deckResult = await this.recalculateDeck(client, playerId);
      const response: HolidayBundlePurchaseResponse = {
        bundleId: bundle.id,
        purchased: Number(purchasedRow.purchase_count),
        rewards,
        newDiscoveryCardIds,
        updatedBalance: toBalance(updatedPlayer),
        deckChanged: deckResult.status === "updated",
      };
      if (collectionCompleted) response.collectionCompleted = collectionCompleted;
      if (deckResult.status !== "insufficient_valid_cards") {
        response.previousDeckPower = previousDeckPower;
        response.deckPower = deckResult.totalPower;
      }

      await client.query("COMMIT");
      return response;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (
        error instanceof HolidayNotActiveError ||
        error instanceof HolidayLimitReachedError ||
        error instanceof InsufficientShopFundsError ||
        error instanceof ShopBundleMissingError ||
        error instanceof ShopBundleUnavailableError ||
        error instanceof ShopCollectionCompleteError ||
        error instanceof ShopPlayerMissingError ||
        error instanceof ShopPriceChangedError
      ) {
        throw error;
      }
      throw new ShopPersistenceError();
    } finally {
      client.release();
    }
  }
}
