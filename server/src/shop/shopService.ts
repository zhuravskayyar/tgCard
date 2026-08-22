import type { PlayerBalance, PlayerCard, ShopPurchaseResponse } from "@cardastika/shared";
import type { Pool, PoolClient } from "pg";
import {
  recalculateAutomaticDeck,
  type AutomaticDeckRecalculationResult,
} from "../decks/automaticDeckService.js";
import { findShopOffer, type ShopOfferDefinition } from "./shopCatalog.js";
import {
  selectCanonicalShopReward,
  ShopRewardPolicyUnavailableError,
  ShopRewardUnavailableError,
} from "./shopRewardSelector.js";

interface PlayerBalanceRow {
  gold: string | number;
  id: string;
  silver: string | number;
}

interface QuantityRow {
  quantity: string | number;
}

type ShopRewardSelector = (
  client: PoolClient,
  offer: ShopOfferDefinition,
) => Promise<Omit<PlayerCard, "quantity">>;

interface ShopServiceDependencies {
  recalculateDeck?: (
    client: PoolClient,
    playerId: string,
  ) => Promise<AutomaticDeckRecalculationResult>;
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

function toNonNegativeInteger(value: string | number, field: "silver" | "gold") {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid ${field} returned during shop purchase`);
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

export class ShopService {
  private readonly recalculateDeck: NonNullable<ShopServiceDependencies["recalculateDeck"]>;
  private readonly selectReward: ShopRewardSelector;

  constructor(
    private readonly pool: Pick<Pool, "connect">,
    dependencies: ShopServiceDependencies = {},
  ) {
    this.recalculateDeck = dependencies.recalculateDeck ?? recalculateAutomaticDeck;
    this.selectReward = dependencies.selectReward ?? selectCanonicalShopReward;
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

      // Reward selection happens before the balance mutation. Missing policy/cards cannot charge a player.
      const selectedReward = await this.selectReward(client, offer);
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
      if (!updatedPlayer) {
        throw new InsufficientShopFundsError(offer.currency);
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
        balance: toBalance(updatedPlayer),
        deckChanged: deckResult.status === "updated",
      };
      if (deckResult.status !== "insufficient_valid_cards") {
        response.deckPower = deckResult.totalPower;
      }

      await client.query("COMMIT");
      return response;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (
        error instanceof InsufficientShopFundsError ||
        error instanceof ShopPlayerMissingError ||
        error instanceof ShopRewardPolicyUnavailableError ||
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
