import type {
  CardRarity,
  PlayerBalance,
  PlayerCard,
  ShopCatalogResponse,
  ShopOffer,
  ShopPurchaseResponse,
} from "@cardastika/shared";
import type { Pool, PoolClient } from "pg";
import {
  recalculateAutomaticDeck,
  type AutomaticDeckRecalculationResult,
} from "../decks/automaticDeckService.js";
import {
  basisPointsToPercent,
  resolveShopRarity,
  type ShopRandomSource,
  type ShopRarityResolution,
  type StoredShopChance,
} from "./shopChancePolicy.js";
import { findShopOffer, SHOP_OFFERS, type ShopOfferDefinition } from "./shopCatalog.js";
import {
  CryptoShopRandomSource,
  selectCanonicalShopReward,
  ShopRewardUnavailableError,
} from "./shopRewardSelector.js";

interface PlayerBalanceRow {
  gold: string | number;
  id: string;
  silver: string | number;
}

interface ShopChanceRow {
  chance_basis_points: string | number;
  offer_id: string;
  target_rarity: CardRarity;
}

interface QuantityRow {
  quantity: string | number;
}

interface DeckPowerRow {
  total_power: string | number | null;
}

type ShopRewardSelector = (
  client: PoolClient,
  rarity: CardRarity,
  rng: ShopRandomSource,
) => Promise<Omit<PlayerCard, "quantity">>;

interface ShopServiceDependencies {
  recalculateDeck?: (
    client: PoolClient,
    playerId: string,
  ) => Promise<AutomaticDeckRecalculationResult>;
  resolveRarity?: (
    offer: ShopOfferDefinition,
    chances: readonly StoredShopChance[],
    rng: ShopRandomSource,
  ) => ShopRarityResolution;
  rng?: ShopRandomSource;
  selectReward?: ShopRewardSelector;
}

export class ShopOfferMissingError extends Error {
  constructor() {
    super("Shop offer does not exist");
    this.name = "ShopOfferMissingError";
  }
}

export class ShopPlayerMissingError extends Error {
  constructor() {
    super("Player does not exist");
    this.name = "ShopPlayerMissingError";
  }
}

export class InsufficientShopFundsError extends Error {
  constructor(public readonly currency: "silver" | "gold") {
    super(`Insufficient ${currency}`);
    this.name = "InsufficientShopFundsError";
  }
}

export class ShopPersistenceError extends Error {
  constructor() {
    super("Shop persistence is unavailable");
    this.name = "ShopPersistenceError";
  }
}

function toNonNegativeInteger(value: string | number, field: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid ${field} returned during shop request`);
  }
  return parsed;
}

function toPositiveInteger(value: string | number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("Invalid inventory quantity returned during shop purchase");
  }
  return parsed;
}

function toBalance(row: PlayerBalanceRow): PlayerBalance {
  return {
    silver: toNonNegativeInteger(row.silver, "silver"),
    gold: toNonNegativeInteger(row.gold, "gold"),
  };
}

function readOfferChances(offer: ShopOfferDefinition, rows: readonly ShopChanceRow[]) {
  const chanceRows = new Map(
    rows
      .filter((row) => row.offer_id === offer.id)
      .map((row) => [row.target_rarity, toNonNegativeInteger(row.chance_basis_points, "shop chance")]),
  );

  return offer.upgrades.map((upgrade) => ({
    rarity: upgrade.rarity,
    chanceBasisPoints: chanceRows.get(upgrade.rarity) ?? upgrade.initialChanceBasisPoints,
  }));
}

function toPlayerFacingOffer(
  offer: ShopOfferDefinition,
  balance: PlayerBalance,
  rows: readonly ShopChanceRow[],
): ShopOffer {
  const chanceByRarity = new Map(readOfferChances(offer, rows).map((state) => [state.rarity, state.chanceBasisPoints]));
  return {
    id: offer.id,
    currency: offer.currency,
    price: offer.price,
    guaranteedRarity: offer.guaranteedRarity,
    canAfford: balance[offer.currency] >= offer.price,
    upgrades: offer.upgrades.map((upgrade) => ({
      rarity: upgrade.rarity,
      chance: basisPointsToPercent(chanceByRarity.get(upgrade.rarity) ?? upgrade.initialChanceBasisPoints),
      increment: basisPointsToPercent(upgrade.incrementBasisPoints),
    })),
  };
}

async function loadCurrentDeckPower(client: PoolClient, playerId: string) {
  const result = await client.query<DeckPowerRow>(
    `
      SELECT COALESCE(SUM(cards.power), 0) AS total_power
      FROM player_decks
      LEFT JOIN deck_slots ON deck_slots.deck_id = player_decks.id
      LEFT JOIN cards ON cards.id = deck_slots.card_id
      WHERE player_decks.player_id = $1
    `,
    [playerId],
  );
  return toNonNegativeInteger(result.rows[0]?.total_power ?? 0, "deck power");
}

export class ShopService {
  private readonly recalculateDeck: NonNullable<ShopServiceDependencies["recalculateDeck"]>;
  private readonly resolveRarity: NonNullable<ShopServiceDependencies["resolveRarity"]>;
  private readonly rng: ShopRandomSource;
  private readonly selectReward: ShopRewardSelector;

  constructor(
    private readonly pool: Pick<Pool, "connect" | "query">,
    dependencies: ShopServiceDependencies = {},
  ) {
    this.recalculateDeck = dependencies.recalculateDeck ?? recalculateAutomaticDeck;
    this.resolveRarity = dependencies.resolveRarity ?? resolveShopRarity;
    this.rng = dependencies.rng ?? new CryptoShopRandomSource();
    this.selectReward = dependencies.selectReward ?? selectCanonicalShopReward;
  }

  async getCardsCatalog(playerId: string): Promise<ShopCatalogResponse> {
    try {
      const playerResult = await this.pool.query<PlayerBalanceRow>(
        "SELECT id, silver, gold FROM players WHERE id = $1",
        [playerId],
      );
      const player = playerResult.rows[0];
      if (!player) throw new ShopPlayerMissingError();
      const chanceResult = await this.pool.query<ShopChanceRow>(
        `
          SELECT offer_id, target_rarity, chance_basis_points
          FROM player_shop_chances
          WHERE player_id = $1
          ORDER BY offer_id, target_rarity
        `,
        [playerId],
      );
      const balance = toBalance(player);
      return { offers: SHOP_OFFERS.map((offer) => toPlayerFacingOffer(offer, balance, chanceResult.rows)) };
    } catch (error) {
      if (error instanceof ShopPlayerMissingError) throw error;
      throw new ShopPersistenceError();
    }
  }

  async purchase(playerId: string, offerId: string): Promise<ShopPurchaseResponse> {
    const offer = findShopOffer(offerId);
    if (!offer) throw new ShopOfferMissingError();

    let client: PoolClient;
    try {
      client = await this.pool.connect();
    } catch {
      throw new ShopPersistenceError();
    }

    try {
      await client.query("BEGIN");
      const playerResult = await client.query<PlayerBalanceRow>(
        "SELECT id, silver, gold FROM players WHERE id = $1 FOR UPDATE",
        [playerId],
      );
      const player = playerResult.rows[0];
      if (!player) throw new ShopPlayerMissingError();

      const currentBalance = toBalance(player);
      if (currentBalance[offer.currency] < offer.price) {
        throw new InsufficientShopFundsError(offer.currency);
      }

      for (const upgrade of offer.upgrades) {
        await client.query(
          `
            INSERT INTO player_shop_chances (
              player_id,
              offer_id,
              target_rarity,
              chance_basis_points
            )
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (player_id, offer_id, target_rarity) DO NOTHING
          `,
          [playerId, offer.id, upgrade.rarity, upgrade.initialChanceBasisPoints],
        );
      }

      const chanceResult = await client.query<ShopChanceRow>(
        `
          SELECT offer_id, target_rarity, chance_basis_points
          FROM player_shop_chances
          WHERE player_id = $1 AND offer_id = $2
          ORDER BY target_rarity
          FOR UPDATE
        `,
        [playerId, offer.id],
      );
      const currentChances = readOfferChances(offer, chanceResult.rows);
      const rarityResolution = this.resolveRarity(offer, currentChances, this.rng);
      const selectedReward = await this.selectReward(client, rarityResolution.rarity, this.rng);
      if (selectedReward.rarity !== rarityResolution.rarity) {
        throw new Error("Shop reward rarity does not match the resolved rarity");
      }

      const previousDeckPower = await loadCurrentDeckPower(client, playerId);
      const balanceResult = await client.query<PlayerBalanceRow>(
        `
          UPDATE players
          SET ${offer.currency} = ${offer.currency} - $2, updated_at = NOW()
          WHERE id = $1 AND ${offer.currency} >= $2
          RETURNING id, silver, gold
        `,
        [playerId, offer.price],
      );
      const updatedPlayer = balanceResult.rows[0];
      if (!updatedPlayer) throw new InsufficientShopFundsError(offer.currency);

      for (const chance of rarityResolution.updatedChances) {
        const updateResult = await client.query(
          `
            UPDATE player_shop_chances
            SET chance_basis_points = $4, updated_at = NOW()
            WHERE player_id = $1 AND offer_id = $2 AND target_rarity = $3
          `,
          [playerId, offer.id, chance.rarity, chance.chanceBasisPoints],
        );
        if (updateResult.rowCount !== 1) throw new Error("Shop pity update affected an unexpected row count");
      }

      const ownershipResult = await client.query<QuantityRow>(
        `
          INSERT INTO player_cards (player_id, card_id, quantity)
          VALUES ($1, $2, 1)
          ON CONFLICT (player_id, card_id) DO UPDATE SET
            quantity = player_cards.quantity + 1
          RETURNING quantity
        `,
        [playerId, selectedReward.cardId],
      );
      const ownership = ownershipResult.rows[0];
      if (!ownership) throw new Error("Shop inventory update returned no row");

      const deckResult = await this.recalculateDeck(client, playerId);
      const response: ShopPurchaseResponse = {
        reward: { ...selectedReward, quantity: toPositiveInteger(ownership.quantity) },
        updatedBalance: toBalance(updatedPlayer),
        updatedChances: rarityResolution.updatedChances.map((chance) => ({
          rarity: chance.rarity,
          chance: basisPointsToPercent(chance.chanceBasisPoints),
        })),
        deckChanged: deckResult.status === "updated",
      };
      if (deckResult.status !== "insufficient_valid_cards") {
        response.previousDeckPower = previousDeckPower;
        response.deckPower = deckResult.totalPower;
      }

      await client.query("COMMIT");
      return response;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (
        error instanceof InsufficientShopFundsError ||
        error instanceof ShopPlayerMissingError ||
        error instanceof ShopRewardUnavailableError
      ) {
        throw error;
      }
      throw new ShopPersistenceError();
    } finally {
      client.release();
    }
  }
}
