import type {
  CardDefinition,
  CardRarity,
  PlayerMailAction,
  PlayerMailActionResponse,
  PlayerMailCardReward,
  PlayerBalance,
  PlayerMailClaimResponse,
  PlayerMailMessage,
  PlayerMailResponse,
} from "@cardastika/shared";
import type { Pool, PoolClient } from "pg";
import { createStandardCardInstance, CryptoCardRandomSource } from "../cards/cardInstanceCreator.js";
import { recordCardDiscovery } from "../collections/discoveryService.js";
import { recalculateAutomaticDeck } from "../decks/automaticDeckService.js";

interface MailRow {
  action_completed_at: Date | string | null;
  action_type: "none" | "nickname_change";
  body: string;
  card_art_key: string | null;
  card_code: string | null;
  card_description: string | null;
  card_display_name: string | null;
  card_element: "fire" | "water" | "air" | "earth" | null;
  card_id: string | null;
  card_level: number | string | null;
  card_collection_id: string | null;
  card_limited: boolean | null;
  card_min_rarity: CardRarity | null;
  card_shop_eligible: boolean | null;
  claimed_at: Date | string | null;
  created_at: Date | string;
  gold: string | number;
  id: string;
  silver: string | number;
  subject: string;
}

const MAIL_SELECT = `
  player_mail.id, player_mail.subject, player_mail.body, player_mail.silver, player_mail.gold,
  player_mail.created_at, player_mail.claimed_at, player_mail.action_type, player_mail.action_completed_at,
  player_mail.card_id, player_mail.card_level,
  reward_cards.art_key AS card_art_key, reward_cards.code AS card_code,
  reward_cards.description AS card_description, reward_cards.display_name AS card_display_name,
  reward_cards.element AS card_element, reward_cards.collection_id AS card_collection_id,
  reward_cards.limited AS card_limited, reward_cards.min_rarity AS card_min_rarity,
  reward_cards.shop_eligible AS card_shop_eligible
`;

interface BalanceRow {
  gold: string | number;
  silver: string | number;
}

function toNonNegativeInteger(value: string | number, field: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid ${field} value returned by mail service`);
  }
  return parsed;
}

function toIso(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid mail timestamp returned by database");
  return date.toISOString();
}

function toMessage(row: MailRow): PlayerMailMessage {
  const cardReward: PlayerMailCardReward | null = row.card_id === null ? null : {
    artKey: row.card_art_key,
    cardId: row.card_id,
    code: row.card_code ?? row.card_id,
    displayName: row.card_display_name,
    element: row.card_element ?? "fire",
    level: toNonNegativeInteger(row.card_level ?? 0, "mail card level"),
  };
  return {
    actionCompletedAt: row.action_completed_at === null ? null : toIso(row.action_completed_at),
    actionType: row.action_type,
    body: row.body,
    claimedAt: row.claimed_at === null ? null : toIso(row.claimed_at),
    createdAt: toIso(row.created_at),
    gold: toNonNegativeInteger(row.gold, "mail gold"),
    id: row.id,
    cardReward,
    silver: toNonNegativeInteger(row.silver, "mail silver"),
    subject: row.subject,
  };
}

function toBalance(row: BalanceRow): PlayerBalance {
  return {
    gold: toNonNegativeInteger(row.gold, "gold"),
    silver: toNonNegativeInteger(row.silver, "silver"),
  };
}

export class MailMessageNotFoundError extends Error {
  constructor() {
    super("Mail message does not exist");
    this.name = "MailMessageNotFoundError";
  }
}

export class MailPersistenceError extends Error {
  constructor(options?: ErrorOptions) {
    super("Mail persistence is unavailable", options);
    this.name = "MailPersistenceError";
  }
}

export class MailService {
  constructor(private readonly pool: Pick<Pool, "connect" | "query">) {}

  private async ensureNicknameChangeMail(playerId: string) {
    await this.pool.query(
      `
        INSERT INTO player_mail (player_id, subject, body, action_type)
        SELECT $1, $2, $3, 'nickname_change'
        WHERE NOT EXISTS (
          SELECT 1
          FROM player_mail
          WHERE player_id = $1 AND action_type = 'nickname_change'
        )
        ON CONFLICT DO NOTHING
      `,
      [
        playerId,
        "Зміни свій нік",
        "Встанови власний ігровий нік до 10 символів. Обери «Змінити», щоб задати його, або «Залишити», щоб зберегти поточне ім’я.",
      ],
    );
  }

  async getInbox(playerId: string): Promise<PlayerMailResponse> {
    try {
      await this.ensureNicknameChangeMail(playerId);
      const result = await this.pool.query<MailRow>(
        `
          SELECT ${MAIL_SELECT}
          FROM player_mail
          LEFT JOIN cards reward_cards ON reward_cards.id = player_mail.card_id
          WHERE player_mail.player_id = $1
          ORDER BY created_at DESC, id DESC
        `,
        [playerId],
      );
      const messages = result.rows.map(toMessage);
      return {
        messages,
        unreadCount: messages.filter((message) => message.actionType === "nickname_change"
          ? message.actionCompletedAt === null
          : message.claimedAt === null).length,
      };
    } catch (error) {
      throw new MailPersistenceError({ cause: error });
    }
  }

  async claim(playerId: string, messageId: string): Promise<PlayerMailClaimResponse> {
    let client: PoolClient | undefined;

    try {
      client = await this.pool.connect();
      await client.query("BEGIN");

      const mailResult = await client.query<MailRow>(
        `
          SELECT ${MAIL_SELECT}
          FROM player_mail
          LEFT JOIN cards reward_cards ON reward_cards.id = player_mail.card_id
          WHERE player_mail.id = $1 AND player_mail.player_id = $2
          FOR UPDATE OF player_mail
        `,
        [messageId, playerId],
      );
      const message = mailResult.rows[0];
      if (!message) throw new MailMessageNotFoundError();

      const balanceResult = await client.query<BalanceRow>(
        "SELECT silver, gold FROM players WHERE id = $1 FOR UPDATE",
        [playerId],
      );
      const balance = balanceResult.rows[0];
      if (!balance) throw new Error("Player does not exist");

      let claimed = false;
      let claimedAt = message.claimed_at;
      if (claimedAt === null) {
        if (message.card_id !== null) {
          if (
            !message.card_code || !message.card_element || !message.card_description
            || message.card_level === null || message.card_min_rarity === null
            || message.card_limited === null || message.card_shop_eligible === null
          ) {
            throw new Error("Mail card reward definition is incomplete");
          }
          const definition: CardDefinition = {
            artKey: message.card_art_key,
            code: message.card_code,
            collectionId: message.card_collection_id,
            description: message.card_description,
            displayName: message.card_display_name,
            element: message.card_element,
            id: message.card_id,
            limited: message.card_limited,
            minRarity: message.card_min_rarity,
            shopEligible: message.card_shop_eligible,
            source: "raid",
          };
          const cardLevel = toNonNegativeInteger(message.card_level, "mail card level");
          await createStandardCardInstance(client, playerId, definition, cardLevel, new CryptoCardRandomSource());
          await recordCardDiscovery(client, playerId, message.card_id);
          await recalculateAutomaticDeck(client, playerId);
        }
        const updatedPlayer = await client.query<BalanceRow>(
          `
            UPDATE players
            SET silver = silver + $2, gold = gold + $3, updated_at = NOW()
            WHERE id = $1
            RETURNING silver, gold
          `,
          [playerId, message.silver, message.gold],
        );
        const updatedBalance = updatedPlayer.rows[0];
        if (!updatedBalance) throw new Error("Player balance update returned no row");

        const claimedResult = await client.query<{ claimed_at: Date | string }>(
          `
            UPDATE player_mail
            SET claimed_at = NOW()
            WHERE id = $1 AND player_id = $2 AND claimed_at IS NULL
            RETURNING claimed_at
          `,
          [messageId, playerId],
        );
        claimedAt = claimedResult.rows[0]?.claimed_at ?? null;
        if (claimedAt === null) throw new Error("Mail claim timestamp was not stored");
        claimed = true;
        await client.query("COMMIT");
        return {
          claimed,
          claimedAt: toIso(claimedAt),
          messageId,
          updatedBalance: toBalance(updatedBalance),
        };
      }

      await client.query("COMMIT");
      return {
        claimed,
        claimedAt: toIso(claimedAt),
        messageId,
        updatedBalance: toBalance(balance),
      };
    } catch (error) {
      await client?.query("ROLLBACK").catch(() => undefined);
      if (error instanceof MailMessageNotFoundError) throw error;
      if (error instanceof MailPersistenceError) throw error;
      throw new MailPersistenceError({ cause: error });
    } finally {
      client?.release();
    }
  }

  async resolveAction(playerId: string, messageId: string, action: PlayerMailAction): Promise<PlayerMailActionResponse> {
    try {
      const result = await this.pool.query<{ action_completed_at: Date | string }>(
        `
          UPDATE player_mail
          SET action_completed_at = COALESCE(action_completed_at, NOW())
          WHERE id = $1 AND player_id = $2 AND action_type = 'nickname_change'
          RETURNING action_completed_at
        `,
        [messageId, playerId],
      );
      const completedAt = result.rows[0]?.action_completed_at;
      if (!completedAt) throw new MailMessageNotFoundError();
      return { action, actionCompletedAt: toIso(completedAt), messageId };
    } catch (error) {
      if (error instanceof MailMessageNotFoundError) throw error;
      throw new MailPersistenceError({ cause: error });
    }
  }
}
