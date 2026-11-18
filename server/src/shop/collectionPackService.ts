import {
  getCollectionPackRotation,
  getCollectionPackSchedule,
  priceMissingCollectionCards,
  selectGeneratedLevelForRarity,
  selectShopLevelForRarity,
  type CollectionPackRotation,
  type GeneratedLevelPolicy,
} from "@cardastika/game-core";
import {
  CARD_RARITIES,
  type CardDefinition,
  type CardRarity,
  type CollectionPackCard,
  type CollectionPackPurchaseResponse,
  type CollectionPacksResponse,
} from "@cardastika/shared";
import type { Pool, PoolClient } from "pg";
import type { CampaignService } from "../campaign/campaignService.js";
import { createStandardCardInstance } from "../cards/cardInstanceCreator.js";
import { recordCardDiscovery } from "../collections/discoveryService.js";
import { recalculateAutomaticDeck, type AutomaticDeckRecalculationResult } from "../decks/automaticDeckService.js";
import {
  COLLECTION_PACKS,
  COLLECTION_PACK_SET_LIMIT,
  PACK_RANDOM_OFFER_PREFIX,
  PACK_SET_OFFER_PREFIX,
  type CollectionPackConfig,
} from "./collectionPackConfig.js";
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

/** A pack comes round once per full cycle of the rotation. */
const COLLECTION_PACKS_CYCLE_WEEKS = 5;

/** The set price for the cards still missing: the configured price when nothing is discovered, otherwise the ladder (never above the set). */
function missingPrice(setPrice: number, members: readonly PackCardRow[], missing: readonly PackCardRow[]) {
  // A fully collected set keeps a positive list price; the offer itself shows «Зібрано» and cannot be bought.
  if (!members.length || setPrice <= 0 || !missing.length) return setPrice;
  return priceMissingCollectionCards(missing.map((row) => row.min_rarity), members.length, setPrice);
}

export class CollectionPackNotActiveError extends Error {
  constructor() {
    super("This collection pack is not on sale this week");
    this.name = "CollectionPackNotActiveError";
  }
}

export class CollectionPackLimitReachedError extends Error {
  constructor() {
    super("The weekly purchase limit of this collection is reached");
    this.name = "CollectionPackLimitReachedError";
  }
}

interface PackCardRow {
  art_key: string | null;
  bonus_label: string | null;
  card_id: string;
  code: string;
  collection_code: string;
  collection_id: string | null;
  collection_name: string;
  description: string;
  discovered: boolean;
  display_name: string | null;
  element: CardDefinition["element"];
  limited: boolean;
  min_rarity: CardRarity;
  shop_eligible: boolean;
  source: string;
}

type PackRotation = Pick<CollectionPackRotation, "endsAt" | "weekKey"> & { packIds: readonly string[] };

interface CollectionPackDependencies {
  campaign?: Pick<CampaignService, "recordEvent">;
  levelPolicy?: GeneratedLevelPolicy;
  now?: () => Date;
  /** The sellable packs; tests inject fixture collections. */
  packs?: readonly CollectionPackConfig[];
  recalculateDeck?: (client: PoolClient, playerId: string) => Promise<AutomaticDeckRecalculationResult>;
  rng?: ShopRandomSource;
  /** The packs on sale for a date; defaults to the game-core rotation. */
  rotation?: (now: Date) => PackRotation;
}

function toRarity(value: string): CardRarity {
  const rarity = CARD_RARITIES.find((candidate) => candidate === value);
  if (!rarity) throw new Error("Unknown collection pack card rarity");
  return rarity;
}

const CARD_COLUMNS = `
  cards.id AS card_id, cards.code, cards.display_name, cards.art_key, cards.element, cards.collection_id,
  cards.min_rarity, cards.shop_eligible, cards.description, cards.limited, cards.source
`;

export class CollectionPackService {
  private readonly campaign?: Pick<CampaignService, "recordEvent">;
  private readonly levelPolicy: GeneratedLevelPolicy;
  private readonly now: () => Date;
  private readonly packs: readonly CollectionPackConfig[];
  private readonly recalculateDeck: NonNullable<CollectionPackDependencies["recalculateDeck"]>;
  private readonly rng: ShopRandomSource;
  private readonly rotation: (now: Date) => PackRotation;

  constructor(
    private readonly pool: Pick<Pool, "connect" | "query">,
    dependencies: CollectionPackDependencies = {},
  ) {
    this.campaign = dependencies.campaign;
    this.levelPolicy = dependencies.levelPolicy ?? selectShopLevelForRarity;
    this.now = dependencies.now ?? (() => new Date());
    this.packs = dependencies.packs ?? COLLECTION_PACKS;
    this.recalculateDeck = dependencies.recalculateDeck ?? recalculateAutomaticDeck;
    this.rng = dependencies.rng ?? new CryptoShopRandomSource();
    this.rotation = dependencies.rotation ?? getCollectionPackRotation;
  }

  async getCatalog(playerId: string): Promise<CollectionPacksResponse> {
    try {
      const now = this.now();
      const rotation = this.rotation(now);
      const active = this.packs.filter((pack) => rotation.packIds.includes(pack.id));
      const playerResult = await this.pool.query<{ gold: string | number; silver: string | number }>(
        "SELECT silver, gold FROM players WHERE id = $1",
        [playerId],
      );
      const player = playerResult.rows[0];
      if (!player) throw new ShopPlayerMissingError();
      const gold = toBalance(player).gold;

      const codes = active.flatMap((pack) => pack.collectionCodes);
      const cardResult = await this.pool.query<PackCardRow>(
        `
          SELECT collections.code AS collection_code, collections.display_name AS collection_name, collections.bonus_label, ${CARD_COLUMNS},
            (discoveries.card_id IS NOT NULL) AS discovered
          FROM collections
          INNER JOIN collection_cards ON collection_cards.collection_id = collections.id
          INNER JOIN cards ON cards.id = collection_cards.card_id
          LEFT JOIN player_card_discoveries discoveries ON discoveries.card_id = cards.id AND discoveries.player_id = $1
          WHERE collections.code = ANY($2::text[])
          ORDER BY collections.code, collection_cards.position
        `,
        [playerId, codes],
      );
      const purchaseResult = await this.pool.query<{ collection_code: string; purchase_count: number }>(
        `
          SELECT collection_code, purchase_count
          FROM player_collection_pack_purchases
          WHERE player_id = $1 AND week_start = $2::date AND collection_code = ANY($3::text[])
        `,
        [playerId, rotation.weekKey, codes],
      );
      const purchased = new Map(purchaseResult.rows.map((row) => [row.collection_code, Number(row.purchase_count)]));

      const schedule = getCollectionPackSchedule(now, this.rotation);
      return {
        endsAt: rotation.endsAt.toISOString(),
        nextWeekPackNames: schedule.nextWeekPackIds
          .map((id) => this.packs.find((pack) => pack.id === id)?.displayName)
          .filter((name): name is string => Boolean(name)),
        packs: active.map((pack) => {
          const rows = cardResult.rows.filter((row) => pack.collectionCodes.includes(row.collection_code));
          const distinct = new Map(rows.map((row) => [row.card_id, row]));
          const randomPrice = pack.randomPrice;
          return {
            id: pack.id,
            displayName: pack.displayName,
            description: pack.description,
            returnsInWeeks: schedule.returnsInWeeks[pack.id] ?? COLLECTION_PACKS_CYCLE_WEEKS,
            setOffers: pack.collectionCodes.map((code) => {
              const members = rows.filter((row) => row.collection_code === code);
              const missing = members.filter((row) => !row.discovered);
              const price = missingPrice(pack.setPrices[code] ?? 0, members, missing);
              return {
                id: `${PACK_SET_OFFER_PREFIX}${code}`,
                bonusLabel: members[0]?.bonus_label ?? "",
                collectionName: members[0]?.collection_name ?? code,
                missingCount: missing.length,
                cards: members.map((row): CollectionPackCard => ({
                  cardId: row.card_id,
                  displayName: row.display_name,
                  element: row.element,
                  rarity: toRarity(row.min_rarity),
                  discovered: row.discovered,
                })),
                price,
                purchaseLimit: COLLECTION_PACK_SET_LIMIT,
                purchased: purchased.get(code) ?? 0,
                canAfford: gold >= price,
              };
            }),
            randomOffer: {
              id: `${PACK_RANDOM_OFFER_PREFIX}${pack.id}`,
              price: randomPrice,
              totalCount: distinct.size,
              discoveredCount: [...distinct.values()].filter((row) => row.discovered).length,
              canAfford: gold >= randomPrice,
            },
          };
        }),
      };
    } catch (error) {
      if (error instanceof ShopPlayerMissingError) throw error;
      throw new ShopPersistenceError();
    }
  }

  /** One transaction: the gold, the weekly counter, the cards and their discoveries land together or not at all. */
  async purchase(playerId: string, offerId: string, expectedPrice?: number): Promise<CollectionPackPurchaseResponse> {
    const rotation = this.rotation(this.now());
    const target = this.resolveOffer(offerId);
    if (!rotation.packIds.includes(target.pack.id)) throw new CollectionPackNotActiveError();
    const listPrice = target.kind === "set" ? target.pack.setPrices[target.code] ?? 0 : target.pack.randomPrice;
    if (listPrice <= 0) throw new ShopBundleMissingError();

    let client: PoolClient;
    try {
      client = await this.pool.connect();
    } catch {
      throw new ShopPersistenceError();
    }

    try {
      await client.query("BEGIN");
      const playerResult = await client.query<{ gold: string | number; silver: string | number }>(
        "SELECT silver, gold FROM players WHERE id = $1 FOR UPDATE",
        [playerId],
      );
      const player = playerResult.rows[0];
      if (!player) throw new ShopPlayerMissingError();

      // The price is settled under the player lock: for a set it depends on which cards are still undiscovered.
      let price = listPrice;
      let members: PackCardRow[] = [];
      let missing: PackCardRow[] = [];
      if (target.kind === "set") {
        members = await this.loadCards(client, playerId, [target.code]);
        // Never sell a partial set of the catalog: every member must be a sellable standard card.
        if (!members.length || members.some((card) => card.limited || card.source !== "standard")) throw new ShopBundleUnavailableError();
        missing = members.filter((card) => !card.discovered);
        if (!missing.length) throw new ShopCollectionCompleteError();
        price = missingPrice(listPrice, members, missing);
      }
      if (expectedPrice !== undefined && expectedPrice !== price) throw new ShopPriceChangedError();
      if (toBalance(player).gold < price) throw new InsufficientShopFundsError("gold");

      let purchasedCount = 0;
      let chosen: PackCardRow[];
      if (target.kind === "set") {
        const limitResult = await client.query<{ purchase_count: number }>(
          `
            INSERT INTO player_collection_pack_purchases (player_id, collection_code, week_start, purchase_count)
            VALUES ($1, $2, $3::date, 1)
            ON CONFLICT (player_id, collection_code, week_start) DO UPDATE
              SET purchase_count = player_collection_pack_purchases.purchase_count + 1, updated_at = NOW()
              WHERE player_collection_pack_purchases.purchase_count < $4
            RETURNING purchase_count
          `,
          [playerId, target.code, rotation.weekKey, COLLECTION_PACK_SET_LIMIT],
        );
        const row = limitResult.rows[0];
        if (!row) throw new CollectionPackLimitReachedError();
        purchasedCount = Number(row.purchase_count);

        // Only the cards the player has not discovered yet: a partly collected set is topped up, not rebought.
        chosen = missing;
      } else {
        const pool = [...new Map((await this.loadCards(client, playerId, target.pack.collectionCodes)).filter((card) => !card.limited && card.source === "standard").map((card) => [card.card_id, card])).values()];
        if (!pool.length) throw new ShopBundleUnavailableError();
        const undiscovered = pool.filter((card) => !card.discovered);
        const candidates = undiscovered.length ? undiscovered : pool;
        chosen = [candidates[this.rng.nextInt(candidates.length)]!];
      }

      const previousDeckPower = await loadCurrentDeckPower(client, playerId);
      const balanceResult = await client.query<{ gold: string | number; silver: string | number }>(
        "UPDATE players SET gold = gold - $2, updated_at = NOW() WHERE id = $1 AND gold >= $2 RETURNING silver, gold",
        [playerId, price],
      );
      const updatedPlayer = balanceResult.rows[0];
      if (!updatedPlayer) throw new InsufficientShopFundsError("gold");

      const rewards: CollectionPackPurchaseResponse["rewards"] = [];
      const newDiscoveryCardIds: string[] = [];
      let collectionCompleted: CollectionPackPurchaseResponse["collectionCompleted"];
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
        // Each card is created at the shop level range of its own minimum rarity.
        const level = selectGeneratedLevelForRarity(toRarity(row.min_rarity), this.rng, this.levelPolicy);
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
      const response: CollectionPackPurchaseResponse = {
        offerId,
        purchased: purchasedCount,
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
        error instanceof CollectionPackLimitReachedError ||
        error instanceof InsufficientShopFundsError ||
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

  private resolveOffer(offerId: string):
    | { kind: "set"; code: string; pack: CollectionPackConfig }
    | { kind: "random"; pack: CollectionPackConfig } {
    if (offerId.startsWith(PACK_SET_OFFER_PREFIX)) {
      const code = offerId.slice(PACK_SET_OFFER_PREFIX.length);
      const pack = this.packs.find((candidate) => candidate.collectionCodes.includes(code));
      if (pack) return { kind: "set", code, pack };
    } else if (offerId.startsWith(PACK_RANDOM_OFFER_PREFIX)) {
      const pack = this.packs.find((candidate) => candidate.id === offerId.slice(PACK_RANDOM_OFFER_PREFIX.length));
      if (pack) return { kind: "random", pack };
    }
    throw new ShopBundleMissingError();
  }

  /** Cards of the collections with the player's discovery state, row-locked for the grant. */
  private async loadCards(client: PoolClient, playerId: string, codes: readonly string[]) {
    const result = await client.query<PackCardRow>(
      `
        SELECT collections.code AS collection_code, collections.display_name AS collection_name, collections.bonus_label, ${CARD_COLUMNS},
          EXISTS (SELECT 1 FROM player_card_discoveries discoveries WHERE discoveries.card_id = cards.id AND discoveries.player_id = $1) AS discovered
        FROM collections
        INNER JOIN collection_cards ON collection_cards.collection_id = collections.id
        INNER JOIN cards ON cards.id = collection_cards.card_id
        WHERE collections.code = ANY($2::text[])
        ORDER BY collections.code, collection_cards.position
        FOR SHARE OF cards
      `,
      [playerId, codes],
    );
    return result.rows;
  }
}
