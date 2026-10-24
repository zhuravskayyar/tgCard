import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import type { IncomingMessage } from "node:http";
import type { Pool } from "pg";

const GUEST_CREATION_HOURLY_LIMIT = 5;
const GUEST_CREATION_DAILY_LIMIT = 20;
const MAX_RECORDED_ATTEMPTS_PER_WINDOW = 1_000;
const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;

interface GuestCreationRateLimitRow {
  day_count: number;
  day_started_at: Date | string;
  hour_count: number;
  hour_started_at: Date | string;
}

export class GuestCreationRateLimiterUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super("Guest account creation protection is unavailable", options);
    this.name = "GuestCreationRateLimiterUnavailableError";
  }
}

function expandIpv6(address: string) {
  let normalized = address.toLowerCase();
  if (normalized.includes(".")) {
    const lastColon = normalized.lastIndexOf(":");
    const ipv4 = normalized.slice(lastColon + 1);
    const octets = ipv4.split(".").map(Number);
    if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null;
    const high = ((octets[0]! << 8) | octets[1]!).toString(16);
    const low = ((octets[2]! << 8) | octets[3]!).toString(16);
    normalized = `${normalized.slice(0, lastColon + 1)}${high}:${low}`;
  }

  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const zeroCount = 8 - left.length - right.length;
  if ((halves.length === 1 && zeroCount !== 0) || (halves.length === 2 && zeroCount < 1)) return null;
  const groups = [...left, ...Array.from({ length: zeroCount }, () => "0"), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[a-f\d]{1,4}$/u.test(group))) return null;
  return groups.map((group) => Number.parseInt(group, 16).toString(16));
}

export function normalizeGuestClientIp(value: string | null | undefined) {
  const candidate = value?.trim().replace(/^\[|\]$/gu, "").split("%")[0] ?? "";
  const family = isIP(candidate);
  if (family === 4) return `ipv4:${candidate}`;
  if (family !== 6) return null;

  if (candidate.startsWith("::ffff:")) {
    const mappedIpv4 = candidate.slice("::ffff:".length);
    if (isIP(mappedIpv4) === 4) return `ipv4:${mappedIpv4}`;
  }

  const groups = expandIpv6(candidate);
  return groups ? `ipv6:${groups.slice(0, 4).join(":")}/64` : null;
}

function readHeader(request: IncomingMessage, name: string) {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

export function getGuestClientIp(request: IncomingMessage, isVercel = process.env.VERCEL === "1") {
  // Vercel overwrites X-Forwarded-For with the actual client IP. Generic
  // forwarded headers are ignored outside Vercel so callers cannot choose a quota key.
  const address = isVercel
    ? readHeader(request, "x-forwarded-for")?.split(",", 1)[0]?.trim() ?? request.socket.remoteAddress
    : request.socket.remoteAddress;
  const candidate = address?.trim().replace(/^\[|\]$/gu, "").split("%")[0] ?? "";
  return normalizeGuestClientIp(candidate) ? candidate : null;
}

function toDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function secondsUntilReset(startedAt: Date | string, durationMs: number) {
  return Math.max(1, Math.ceil((toDate(startedAt).getTime() + durationMs - Date.now()) / 1_000));
}

export class GuestCreationRateLimiter {
  constructor(
    private readonly pool: Pool,
    private readonly secret: string,
  ) {}

  async consume(clientIp: string): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
    const normalizedIp = normalizeGuestClientIp(clientIp);
    if (!normalizedIp) throw new GuestCreationRateLimiterUnavailableError();

    const ipHash = createHmac("sha256", this.secret)
      .update(`cardastika:guest-creation:v1:${normalizedIp}`)
      .digest("hex");

    try {
      await this.pool.query(
        "DELETE FROM guest_creation_rate_limits WHERE updated_at < NOW() - INTERVAL '7 days'",
      );
      const result = await this.pool.query<GuestCreationRateLimitRow>(
        `
          INSERT INTO guest_creation_rate_limits (
            ip_hash, hour_started_at, hour_count, day_started_at, day_count, updated_at
          )
          VALUES ($1, date_trunc('hour', NOW()), 1, date_trunc('day', NOW()), 1, NOW())
          ON CONFLICT (ip_hash) DO UPDATE SET
            hour_count = CASE
              WHEN guest_creation_rate_limits.hour_started_at < date_trunc('hour', NOW()) THEN 1
              ELSE LEAST(guest_creation_rate_limits.hour_count + 1, ${MAX_RECORDED_ATTEMPTS_PER_WINDOW})
            END,
            hour_started_at = date_trunc('hour', NOW()),
            day_count = CASE
              WHEN guest_creation_rate_limits.day_started_at < date_trunc('day', NOW()) THEN 1
              ELSE LEAST(guest_creation_rate_limits.day_count + 1, ${MAX_RECORDED_ATTEMPTS_PER_WINDOW})
            END,
            day_started_at = date_trunc('day', NOW()),
            updated_at = NOW()
          RETURNING hour_count, hour_started_at, day_count, day_started_at
        `,
        [ipHash],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Guest rate-limit counter was not returned");

      if (row.hour_count <= GUEST_CREATION_HOURLY_LIMIT && row.day_count <= GUEST_CREATION_DAILY_LIMIT) {
        return { allowed: true };
      }

      const retryAfterSeconds = Math.max(
        ...(row.hour_count > GUEST_CREATION_HOURLY_LIMIT ? [secondsUntilReset(row.hour_started_at, HOUR_MS)] : []),
        ...(row.day_count > GUEST_CREATION_DAILY_LIMIT ? [secondsUntilReset(row.day_started_at, DAY_MS)] : []),
      );
      return { allowed: false, retryAfterSeconds };
    } catch (error) {
      throw new GuestCreationRateLimiterUnavailableError({ cause: error });
    }
  }
}
