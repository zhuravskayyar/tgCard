import {
  NOTIFICATION_KINDS,
  NOTIFICATION_LOCALES,
  type NotificationKind,
  type NotificationLocale,
  type NotificationPreferences,
  type NotificationSettingsResponse,
  type NotificationSettingsUpdate,
} from "@cardastika/shared";
import type { Pool } from "pg";
import { getNotificationTexts } from "../bot/notificationTexts.js";
import { TelegramApiError, type TelegramApiClient } from "../bot/telegramApi.js";

/** Messages per sweep run; the rest waits for the next run. Keeps a run well under Telegram's ~30 msg/s. */
export const NOTIFICATION_SWEEP_BUDGET = 60;
const SWEEP_LEASE_SECONDS = 120;

export type DeliveryResult = "sent" | "blocked";

/** One delivery channel. Telegram today; Web Push can implement the same interface later. */
export interface NotificationSender {
  send(chatId: string, text: string, playLabel: string): Promise<DeliveryResult>;
}

export class NotificationRateLimitError extends Error {
  constructor() {
    super("Notification channel is rate limited");
    this.name = "NotificationRateLimitError";
  }
}

/** Telegram bot channel: 403 or «chat not found» means the player blocked or never started the bot. */
export function createTelegramSender(
  api: Pick<TelegramApiClient, "sendMessage">,
  miniAppUrl: string | null,
): NotificationSender {
  const buttonUrl = miniAppUrl?.startsWith("https://") ? miniAppUrl : null;
  return {
    async send(chatId, text, playLabel) {
      try {
        await api.sendMessage(
          Number(chatId),
          text,
          buttonUrl ? { inline_keyboard: [[{ text: playLabel, web_app: { url: buttonUrl } }]] } : undefined,
        );
        return "sent";
      } catch (error) {
        if (error instanceof TelegramApiError) {
          if (error.status === 403 || (error.status === 400 && /chat not found/iu.test(error.message))) return "blocked";
          if (error.status === 429) throw new NotificationRateLimitError();
        }
        throw error;
      }
    },
  };
}

const COLUMN: Readonly<Record<NotificationKind, string>> = {
  duelReady: "duel_ready",
  mail: "mail",
  guild: "guild",
  announcements: "announcements",
  winback: "winback",
};

type MarkerColumn = "duel_notified_refill_at" | "mail_notified_at" | "guild_notified_at" | "winback_notified_at" | "announcement_notified_id";

/** Timestamps travel as text: a JS Date would drop the microseconds the dedupe comparison needs. */
interface Candidate {
  player_id: string;
  chat_id: string;
  locale: string;
  marker: string;
  mail_count?: number;
  author?: string;
  guild_name?: string;
  body?: string;
}

interface SweepStep {
  kind: NotificationKind;
  marker: MarkerColumn;
  sql: string;
  text(candidate: Candidate): string;
}

/** Every recipient has a Telegram chat, the type switched on and no recorded delivery refusal. */
const RECIPIENTS = `
  FROM players p
  LEFT JOIN auth_identities tg ON tg.player_id = p.id AND tg.provider = 'telegram'
  LEFT JOIN player_notification_settings s ON s.player_id = p.id`;
const RECIPIENT_COLUMNS = `p.id AS player_id, COALESCE(p.telegram_user_id::text, tg.provider_user_id) AS chat_id, COALESCE(s.locale, 'uk') AS locale`;
const RECIPIENT_FILTER = (kind: NotificationKind) => `
  COALESCE(p.telegram_user_id::text, tg.provider_user_id) IS NOT NULL
  AND s.telegram_blocked_at IS NULL
  AND COALESCE(s.${COLUMN[kind]}, TRUE)`;

/**
 * Triggers are read from game state, so the duel, mail and chat code needs no hooks:
 * $1 is the sweep time, $2 the remaining budget. Old events (over a day) are never announced.
 */
const STEPS: readonly SweepStep[] = [
  {
    kind: "duelReady",
    marker: "duel_notified_refill_at",
    // The refill is lazy (duelCooldown.getDuelAvailability), so an expired break still reads duel_remaining = 0.
    sql: `SELECT ${RECIPIENT_COLUMNS}, p.duel_refill_at::text AS marker ${RECIPIENTS}
      WHERE ${RECIPIENT_FILTER("duelReady")}
        AND p.duel_remaining = 0
        AND p.duel_refill_at <= $1 AND p.duel_refill_at > $1 - INTERVAL '1 day'
        AND s.duel_notified_refill_at IS DISTINCT FROM p.duel_refill_at
        AND (p.last_seen_at IS NULL OR p.last_seen_at < p.duel_refill_at)
      LIMIT $2`,
    text: (candidate) => getNotificationTexts(candidate.locale).duelReady,
  },
  {
    kind: "mail",
    marker: "mail_notified_at",
    sql: `SELECT ${RECIPIENT_COLUMNS}, MAX(m.created_at)::text AS marker, COUNT(*)::int AS mail_count ${RECIPIENTS}
      JOIN player_mail m ON m.player_id = p.id AND m.claimed_at IS NULL
      WHERE ${RECIPIENT_FILTER("mail")}
        AND m.created_at <= $1 AND m.created_at > $1 - INTERVAL '1 day'
        AND m.created_at > COALESCE(s.mail_notified_at, '-infinity')
        AND m.created_at > COALESCE(p.last_seen_at, '-infinity')
        AND (s.mail_notified_at IS NULL OR s.mail_notified_at < $1 - INTERVAL '30 minutes')
      GROUP BY p.id, tg.provider_user_id, s.locale
      LIMIT $2`,
    text: (candidate) => getNotificationTexts(candidate.locale).mail(candidate.mail_count ?? 1),
  },
  {
    kind: "guild",
    marker: "guild_notified_at",
    // Guild chat is the raid chat; at most one message per player every three hours.
    sql: `SELECT DISTINCT ON (p.id) ${RECIPIENT_COLUMNS}, c.created_at::text AS marker, c.author, g.name AS guild_name ${RECIPIENTS}
      JOIN guild_members gm ON gm.player_id = p.id
      JOIN guilds g ON g.id = gm.guild_id
      JOIN guild_raid_chat_messages c ON c.guild_id = gm.guild_id AND c.player_id <> p.id
      WHERE ${RECIPIENT_FILTER("guild")}
        AND c.created_at <= $1 AND c.created_at > $1 - INTERVAL '1 day'
        AND c.created_at > gm.joined_at
        AND c.created_at > COALESCE(s.guild_notified_at, '-infinity')
        AND c.created_at > COALESCE(p.last_seen_at, '-infinity')
        AND (s.guild_notified_at IS NULL OR s.guild_notified_at < $1 - INTERVAL '3 hours')
      ORDER BY p.id, c.created_at DESC
      LIMIT $2`,
    text: (candidate) => getNotificationTexts(candidate.locale).guild(candidate.author ?? "", candidate.guild_name ?? ""),
  },
  {
    kind: "announcements",
    marker: "announcement_notified_id",
    // The newest unseen announcement from the last week; body falls back to Ukrainian.
    sql: `SELECT ${RECIPIENT_COLUMNS}, a.id AS marker,
        COALESCE(CASE COALESCE(s.locale, 'uk') WHEN 'en' THEN a.body_en WHEN 'de' THEN a.body_de WHEN 'ru' THEN a.body_ru END, a.body_uk) AS body
      ${RECIPIENTS}
      CROSS JOIN LATERAL (
        SELECT id, body_uk, body_en, body_de, body_ru FROM notification_announcements
        WHERE created_at <= $1 AND created_at > $1 - INTERVAL '7 days' AND id > COALESCE(s.announcement_notified_id, 0)
        ORDER BY id DESC LIMIT 1
      ) a
      WHERE ${RECIPIENT_FILTER("announcements")}
      LIMIT $2`,
    text: (candidate) => candidate.body ?? "",
  },
  {
    kind: "winback",
    marker: "winback_notified_at",
    // One reminder per absence: inactive 3–30 days and not reminded since the last visit.
    sql: `SELECT ${RECIPIENT_COLUMNS}, $1::timestamptz AS marker ${RECIPIENTS}
      WHERE ${RECIPIENT_FILTER("winback")}
        AND p.last_seen_at < $1 - INTERVAL '3 days' AND p.last_seen_at > $1 - INTERVAL '30 days'
        AND (s.winback_notified_at IS NULL OR s.winback_notified_at < p.last_seen_at)
      LIMIT $2`,
    text: (candidate) => getNotificationTexts(candidate.locale).winback,
  },
];

export interface SweepReport {
  /** False when another sweep holds the lease. */
  ran: boolean;
  sent: Partial<Record<NotificationKind, number>>;
  blocked: number;
  failed: number;
  rateLimited: boolean;
}

interface SettingsRow {
  duel_ready: boolean;
  mail: boolean;
  guild: boolean;
  announcements: boolean;
  winback: boolean;
  telegram_blocked_at: Date | string | null;
  chat_id: string | null;
}

export class NotificationSettingsError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "NotificationSettingsError";
  }
}

export class NotificationService {
  constructor(
    private readonly pool: Pick<Pool, "query">,
    private readonly sender: NotificationSender,
    private readonly budget = NOTIFICATION_SWEEP_BUDGET,
  ) {}

  async getSettings(playerId: string): Promise<NotificationSettingsResponse> {
    const result = await this.pool.query<SettingsRow>(
      `SELECT COALESCE(s.duel_ready, TRUE) AS duel_ready, COALESCE(s.mail, TRUE) AS mail, COALESCE(s.guild, TRUE) AS guild,
          COALESCE(s.announcements, TRUE) AS announcements, COALESCE(s.winback, TRUE) AS winback,
          s.telegram_blocked_at, COALESCE(p.telegram_user_id::text, tg.provider_user_id) AS chat_id
        ${RECIPIENTS}
        WHERE p.id = $1`,
      [playerId],
    );
    const row = result.rows[0];
    if (!row) throw new NotificationSettingsError("player_missing", "Player not found");
    const preferences = Object.fromEntries(NOTIFICATION_KINDS.map((kind) => [kind, row[COLUMN[kind] as keyof SettingsRow] === true])) as NotificationPreferences;
    return { preferences, telegramLinked: row.chat_id !== null, telegramBlocked: row.telegram_blocked_at !== null };
  }

  /** Saving settings also clears a delivery refusal, so a player who restarted the bot gets messages again. */
  async updateSettings(playerId: string, update: NotificationSettingsUpdate): Promise<NotificationSettingsResponse> {
    const values: unknown[] = [playerId];
    const columns: string[] = [];
    for (const kind of NOTIFICATION_KINDS) {
      const value = update.preferences?.[kind];
      if (value === undefined) continue;
      if (typeof value !== "boolean") throw new NotificationSettingsError("invalid_preferences", `${kind} must be a boolean`);
      values.push(value);
      columns.push(COLUMN[kind]);
    }
    if (update.locale !== undefined) {
      if (!NOTIFICATION_LOCALES.includes(update.locale as NotificationLocale)) {
        throw new NotificationSettingsError("invalid_locale", "Unsupported locale");
      }
      values.push(update.locale);
      columns.push("locale");
    }
    const placeholders = columns.map((_, index) => `$${index + 2}`);
    await this.pool.query(
      `INSERT INTO player_notification_settings (player_id${columns.map((column) => `, ${column}`).join("")})
        SELECT id${placeholders.map((placeholder) => `, ${placeholder}`).join("")} FROM players WHERE id = $1
        ON CONFLICT (player_id) DO UPDATE SET
          ${columns.map((column) => `${column} = EXCLUDED.${column}, `).join("")}telegram_blocked_at = NULL, updated_at = NOW()`,
      values,
    );
    return this.getSettings(playerId);
  }

  async sweep(now = new Date()): Promise<SweepReport> {
    const report: SweepReport = { ran: false, sent: {}, blocked: 0, failed: 0, rateLimited: false };
    const lease = await this.pool.query(
      `UPDATE notification_sweep_lease SET locked_until = $1::timestamptz + make_interval(secs => $2)
        WHERE locked_until < $1 RETURNING 1`,
      [now, SWEEP_LEASE_SECONDS],
    );
    if (!lease.rowCount) return report;
    report.ran = true;

    try {
      let remaining = this.budget;
      for (const step of STEPS) {
        if (remaining <= 0 || report.rateLimited) break;
        const candidates = (await this.pool.query<Candidate>(step.sql, [now, remaining])).rows;
        for (const candidate of candidates) {
          remaining -= 1;
          const text = step.text(candidate);
          let result: DeliveryResult;
          try {
            result = await this.sender.send(candidate.chat_id, text, getNotificationTexts(candidate.locale).play);
          } catch (error) {
            if (error instanceof NotificationRateLimitError) {
              report.rateLimited = true;
              break;
            }
            report.failed += 1;
            console.error(`Notification ${step.kind} delivery failed`, error instanceof Error ? error.message : error);
            continue;
          }
          if (result === "blocked") {
            report.blocked += 1;
            await this.mark(candidate.player_id, "telegram_blocked_at", now);
          } else {
            report.sent[step.kind] = (report.sent[step.kind] ?? 0) + 1;
            await this.mark(candidate.player_id, step.marker, candidate.marker);
          }
        }
      }
    } finally {
      await this.pool.query("UPDATE notification_sweep_lease SET locked_until = '-infinity'");
    }
    return report;
  }

  private async mark(playerId: string, column: MarkerColumn | "telegram_blocked_at", value: unknown) {
    await this.pool.query(
      `INSERT INTO player_notification_settings (player_id, ${column}) VALUES ($1, $2)
        ON CONFLICT (player_id) DO UPDATE SET ${column} = EXCLUDED.${column}, updated_at = NOW()`,
      [playerId, value],
    );
  }
}
