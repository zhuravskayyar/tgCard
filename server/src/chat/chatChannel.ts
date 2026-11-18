import { CHAT_MAX_LENGTH, type ChatMessage, type ChatView } from "@cardastika/shared";
import type { Pool } from "pg";
import {
  loadWinterFestivePlayers,
  WINTER_FEAST_ID,
  WINTER_REINFORCEMENT_COLLECTION_ID,
} from "../collections/winterReinforcement.js";
import { findActiveHolidayWindow, toHolidaySpan, type HolidaySpanRow } from "../shop/holidayCalendar.js";
import { PlayerPersistenceError } from "../users/playerRepository.js";

const CHAT_PAGE_SIZE = 50;
const CHAT_COOLDOWN_MS = 2_000;

interface ChatRow { id: string; player_id: string; author: string; body: string; created_at: Date | string; }

export class ChatError extends Error {
  constructor(public readonly status: 400 | 404 | 429, public readonly code: string, message: string) {
    super(message);
    this.name = "ChatError";
  }
}

function toMessage(row: ChatRow, winterFestiveUntil?: string): ChatMessage {
  return {
    id: row.id,
    author: row.author,
    body: row.body,
    createdAt: new Date(row.created_at).toISOString(),
    ...(winterFestiveUntil ? { winterFestiveUntil } : {}),
  };
}

/** A lobby chat stored in its own table; every table has the same shape (see migrations 071 and 075). */
export class ChatChannel {
  constructor(
    private readonly pool: Pick<Pool, "connect" | "query">,
    private readonly table: "arena_chat_messages" | "tournament_chat_messages" | "guild_raid_chat_messages",
    /** Raid chats live in one table and are split by guild and channel. */
    private readonly scope?: { guildId: string; channel: string },
  ) {}

  private scopeFilter(offset: number) {
    return this.scope ? { sql: `guild_id = $${offset} AND channel = $${offset + 1}`, values: [this.scope.guildId, this.scope.channel] } : null;
  }

  async read(): Promise<ChatView> {
    try {
      const filter = this.scopeFilter(3);
      const result = await this.pool.query<ChatRow & { winter_holiday: HolidaySpanRow | null }>(
        `WITH page AS (
          SELECT id, player_id, author, body, created_at
          FROM ${this.table}${filter ? ` WHERE ${filter.sql}` : ""}
          ORDER BY created_at DESC, id DESC LIMIT ${CHAT_PAGE_SIZE}
        ), winter AS (
          SELECT start_month, start_day, end_month, end_day FROM shop_holidays WHERE id = $1 AND enabled
        )
        SELECT page.*, row_to_json(winter) AS winter_holiday
        FROM page
        LEFT JOIN player_collection_completions completion
          ON completion.player_id = page.player_id AND completion.collection_id = $2
        LEFT JOIN winter ON completion.player_id IS NOT NULL
        ORDER BY page.created_at ASC, page.id ASC`,
        [WINTER_FEAST_ID, WINTER_REINFORCEMENT_COLLECTION_ID, ...(filter?.values ?? [])],
      );
      const holiday = result.rows.find((row) => row.winter_holiday)?.winter_holiday;
      const window = holiday ? findActiveHolidayWindow(toHolidaySpan(holiday), new Date()) : null;
      const winterFestiveUntil = window?.endsAt.toISOString();
      return { messages: result.rows.map((row) => toMessage(row, row.winter_holiday ? winterFestiveUntil : undefined)) };
    } catch (cause) {
      throw new PlayerPersistenceError({ cause });
    }
  }

  async send(playerId: string, rawBody: string): Promise<ChatMessage> {
    const body = rawBody.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/gu, " ").trim();
    if (!body) throw new ChatError(400, "empty_message", "Message cannot be empty");
    if (Array.from(body).length > CHAT_MAX_LENGTH) throw new ChatError(400, "message_too_long", "Message is too long");

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${this.table}:${playerId}`]);
      const recent = await client.query<{ created_at: Date | string }>(
        `SELECT created_at FROM ${this.table} WHERE player_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [playerId],
      );
      if (recent.rows[0] && Date.now() - new Date(recent.rows[0].created_at).getTime() < CHAT_COOLDOWN_MS) {
        throw new ChatError(429, "chat_rate_limited", "Wait a moment before sending another message");
      }
      const inserted = this.scope
        ? await client.query<ChatRow>(`
          INSERT INTO ${this.table} (player_id, author, body, guild_id, channel)
          SELECT id, LEFT(COALESCE(NULLIF(BTRIM(nickname), ''), NULLIF(BTRIM(username), ''), first_name), 24), $2, $3, $4
          FROM players WHERE id = $1
          RETURNING id, player_id, author, body, created_at
        `, [playerId, body, this.scope.guildId, this.scope.channel])
        : await client.query<ChatRow>(`
          INSERT INTO ${this.table} (player_id, author, body)
          SELECT id, LEFT(COALESCE(NULLIF(BTRIM(nickname), ''), NULLIF(BTRIM(username), ''), first_name), 24), $2
          FROM players WHERE id = $1
          RETURNING id, player_id, author, body, created_at
        `, [playerId, body]);
      const row = inserted.rows[0];
      if (!row) throw new ChatError(404, "player_missing", "Player not found");
      const festive = await loadWinterFestivePlayers(client, [playerId]);
      await client.query("COMMIT");
      return toMessage(row, festive?.endsAt);
    } catch (cause) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (cause instanceof ChatError) throw cause;
      throw new PlayerPersistenceError({ cause });
    } finally {
      client.release();
    }
  }
}
