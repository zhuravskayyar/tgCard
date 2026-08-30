import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { CampaignService } from "../campaign/campaignService.js";

const REFERRAL_PREFIX = "ref_";
const REFERRAL_PATTERN = /^ref_([a-z0-9]{8,24})$/i;
const BOOST_DURATION_MS = 24 * 60 * 60 * 1_000;

interface PlayerRow {
  id: string;
}

export type ReferralAcceptanceStatus =
  | "accepted"
  | "already_accepted"
  | "invalid"
  | "not_present"
  | "self_referral";

export interface ReferralAcceptanceResult {
  boostExpiresAt: string | null;
  status: ReferralAcceptanceStatus;
}

const START_PARAMETER_KEYS = ["start_param", "startapp", "start"] as const;

function referralCodeFromCandidate(value: string) {
  const match = value.trim().match(REFERRAL_PATTERN);
  return match?.[1]?.toLowerCase() ?? null;
}

/**
 * Extracts a referral code from Telegram's signed start parameter. The
 * wrappers are accepted for compatibility with copied launch links, while the
 * caller remains responsible for validating the outer Telegram initData.
 */
export function parseReferralStartParam(value: unknown) {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;

  const candidates = [raw];
  try {
    const url = new URL(raw, "https://cardastika.local");
    for (const key of START_PARAMETER_KEYS) {
      const nested = url.searchParams.get(key);
      if (nested) candidates.push(nested);
    }
  } catch {
    // Ignore malformed URL wrappers and try the direct value.
  }

  if (raw.startsWith("?") || raw.startsWith("#") || raw.includes("=")) {
    const query = new URLSearchParams(raw.replace(/^[?#]/, ""));
    for (const key of START_PARAMETER_KEYS) {
      const nested = query.get(key);
      if (nested) candidates.push(nested);
    }
  }

  for (const candidate of candidates) {
    const code = referralCodeFromCandidate(candidate);
    if (code) return code;
  }
  return null;
}

export function toReferralStartParam(referralCode: string) {
  return `${REFERRAL_PREFIX}${referralCode.trim().toLowerCase()}`;
}

export class ReferralService {
  constructor(
    private readonly pool: Pool,
    private readonly campaign: Pick<CampaignService, "recordEvent">,
  ) {}

  async acceptFromTelegramStart(
    invitedPlayerId: string,
    startParam: string | null,
    now: Date = new Date(),
  ): Promise<ReferralAcceptanceResult> {
    if (!startParam?.trim()) return { status: "not_present", boostExpiresAt: null };
    const referralCode = parseReferralStartParam(startParam);
    if (!referralCode) return { status: "invalid", boostExpiresAt: null };

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const invitedResult = await client.query<PlayerRow>(
        "SELECT id FROM players WHERE id = $1 FOR UPDATE",
        [invitedPlayerId],
      );
      const invited = invitedResult.rows[0];
      if (!invited) throw new Error("Authenticated invited player no longer exists");
      const inviterResult = await client.query<PlayerRow>(
        "SELECT id FROM players WHERE referral_code = $1 FOR UPDATE",
        [referralCode],
      );
      const inviter = inviterResult.rows[0];
      if (!inviter) {
        await client.query("ROLLBACK");
        return { status: "invalid", boostExpiresAt: null };
      }
      if (inviter.id === invited.id) {
        await client.query("ROLLBACK");
        return { status: "self_referral", boostExpiresAt: null };
      }
      const previous = await client.query<{ inviter_player_id: string }>(
        "SELECT inviter_player_id FROM player_referrals WHERE invited_player_id = $1",
        [invited.id],
      );
      if (previous.rowCount) {
        await client.query("ROLLBACK");
        return { status: "already_accepted", boostExpiresAt: null };
      }

      await client.query(
        `
          INSERT INTO player_referrals (
            id, inviter_player_id, invited_player_id, accepted_at, source
          ) VALUES ($1, $2, $3, $4, 'telegram_start')
        `,
        [randomUUID(), inviter.id, invited.id, now],
      );
      const [playerAId, playerBId] = inviter.id.localeCompare(invited.id) < 0
        ? [inviter.id, invited.id]
        : [invited.id, inviter.id];
      await client.query(
        `
          INSERT INTO player_friends (player_a_id, player_b_id, created_at, source)
          VALUES ($1, $2, $3, 'referral')
          ON CONFLICT (player_a_id, player_b_id) DO NOTHING
        `,
        [playerAId, playerBId, now],
      );
      const expiresAt = new Date(now.getTime() + BOOST_DURATION_MS);
      const boost = await client.query(
        `
          INSERT INTO player_boosts (
            id, player_id, boost_type, starts_at, expires_at, source
          ) VALUES ($1, $2, 'account_x2', $3, $4, 'campaign_referral')
          ON CONFLICT (player_id, boost_type, source) DO NOTHING
          RETURNING expires_at
        `,
        [randomUUID(), inviter.id, now, expiresAt],
      );
      await this.campaign.recordEvent(client, inviter.id, "REFERRAL_ACCEPTED", {}, now);
      await this.campaign.recordEvent(client, inviter.id, "FRIEND_CREATED", {}, now);
      await client.query("COMMIT");
      return {
        status: "accepted",
        boostExpiresAt: boost.rowCount === 1 ? expiresAt.toISOString() : null,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
