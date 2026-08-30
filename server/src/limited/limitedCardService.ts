import {
  selectGeneratedLevelForRarity,
  selectShopLevelForRarity,
} from "@cardastika/game-core";
import type {
  LimitedCardRedeemResponse,
  LimitedShopEvent,
  PlayerCard,
} from "@cardastika/shared";
import type { Pool, PoolClient } from "pg";
import { createStandardCardInstance, CryptoCardRandomSource } from "../cards/cardInstanceCreator.js";
import { recordCardDiscovery } from "../collections/discoveryService.js";
import { recalculateAutomaticDeck } from "../decks/automaticDeckService.js";

interface LimitedEventRow {
  art_key: string | null;
  card_id: string;
  code: string;
  description: string;
  display_name: string;
  element: LimitedShopEvent["element"];
  ends_at: Date | string;
  event_id: string;
  limited: boolean;
  min_rarity: LimitedShopEvent["rarity"];
  promo_code: string;
  redeemed: boolean;
  starts_at: Date | string;
}

export class LimitedCardEventUnavailableError extends Error {
  constructor() {
    super("This limited card event is not active");
    this.name = "LimitedCardEventUnavailableError";
  }
}

export class LimitedCardAlreadyRedeemedError extends Error {
  constructor() {
    super("This player has already redeemed the limited card");
    this.name = "LimitedCardAlreadyRedeemedError";
  }
}

export class InvalidLimitedPromoCodeError extends Error {
  constructor() {
    super("The promo code is invalid");
    this.name = "InvalidLimitedPromoCodeError";
  }
}

export class LimitedCardPersistenceError extends Error {
  constructor(options?: ErrorOptions) {
    super("Limited card persistence is unavailable");
    if (options?.cause) this.cause = options.cause;
    this.name = "LimitedCardPersistenceError";
  }
}

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toBanner(row: LimitedEventRow): LimitedShopEvent {
  if (!row.limited) throw new Error("Limited card event points to a non-limited card");
  return {
    id: row.event_id,
    displayName: row.display_name,
    artKey: row.art_key,
    element: row.element,
    rarity: row.min_rarity,
    description: row.description,
    endsAt: toIso(row.ends_at),
    limited: true,
    redeemed: row.redeemed,
  };
}

const EVENT_FIELDS = `
  SELECT
    events.id AS event_id,
    events.promo_code,
    events.starts_at,
    events.ends_at,
    cards.id AS card_id,
    cards.code,
    cards.display_name,
    cards.description,
    cards.art_key,
    cards.element,
    cards.min_rarity,
    cards.limited,
    EXISTS (
      SELECT 1
      FROM player_limited_card_redemptions redemptions
      WHERE redemptions.event_id = events.id AND redemptions.player_id = $2
    ) AS redeemed
  FROM limited_card_events events
  INNER JOIN cards ON cards.id = events.card_id
`;

const EVENT_QUERY = `${EVENT_FIELDS}
  WHERE events.id = $1
    AND events.starts_at <= $3
    AND events.ends_at > $3
`;

const ACTIVE_EVENT_QUERY = `${EVENT_FIELDS}
  WHERE events.starts_at <= $2
    AND events.ends_at > $2
  ORDER BY events.starts_at DESC
  LIMIT 1
`;

export class LimitedCardService {
  constructor(
    private readonly pool: Pick<Pool, "connect" | "query">,
    private readonly rng = new CryptoCardRandomSource(),
    private readonly recalculateDeck = recalculateAutomaticDeck,
  ) {}

  async getActiveEvent(playerId: string, now = new Date()): Promise<LimitedShopEvent | null> {
    try {
      const result = await this.pool.query<LimitedEventRow>(
        ACTIVE_EVENT_QUERY.replace("redemptions.player_id = $2", "redemptions.player_id = $1"),
        [playerId, now],
      );
      return result.rows[0] ? toBanner(result.rows[0]) : null;
    } catch (error) {
      throw new LimitedCardPersistenceError({ cause: error });
    }
  }

  async redeem(
    playerId: string,
    eventId: string,
    promoCode: string,
    now = new Date(),
  ): Promise<LimitedCardRedeemResponse> {
    let client: PoolClient;
    try {
      client = await this.pool.connect();
    } catch (error) {
      throw new LimitedCardPersistenceError({ cause: error });
    }

    try {
      await client.query("BEGIN");
      const result = await client.query<LimitedEventRow>(
        `${EVENT_QUERY}
         FOR UPDATE OF events`,
        [eventId, playerId, now],
      );
      const event = result.rows[0];
      if (!event) throw new LimitedCardEventUnavailableError();
      if (event.promo_code.trim().toLowerCase() !== promoCode.trim().toLowerCase()) {
        throw new InvalidLimitedPromoCodeError();
      }
      if (event.redeemed) throw new LimitedCardAlreadyRedeemedError();

      const redemption = await client.query(
        `
          INSERT INTO player_limited_card_redemptions (event_id, player_id)
          VALUES ($1, $2)
          ON CONFLICT (event_id, player_id) DO NOTHING
        `,
        [event.event_id, playerId],
      );
      if (redemption.rowCount !== 1) throw new LimitedCardAlreadyRedeemedError();

      const definition = {
        id: event.card_id,
        code: event.code,
        displayName: event.display_name,
        description: event.description,
        artKey: event.art_key,
        element: event.element,
        collectionId: null,
        minRarity: event.min_rarity,
        shopEligible: false,
        limited: true,
      } as const;
      const level = selectGeneratedLevelForRarity(
        "legendary",
        this.rng,
        selectShopLevelForRarity,
      );
      const reward: PlayerCard = await createStandardCardInstance(client, playerId, definition, level, this.rng);
      await recordCardDiscovery(client, playerId, event.card_id);
      const deckResult = await this.recalculateDeck(client, playerId);
      await client.query("COMMIT");

      return {
        reward,
        message: "Лімітовану карту отримано",
        deckChanged: deckResult.status === "updated",
        ...(deckResult.status !== "insufficient_valid_cards" ? { deckPower: deckResult.totalPower } : {}),
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (
        error instanceof LimitedCardEventUnavailableError
        || error instanceof LimitedCardAlreadyRedeemedError
        || error instanceof InvalidLimitedPromoCodeError
      ) throw error;
      throw new LimitedCardPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }
}
