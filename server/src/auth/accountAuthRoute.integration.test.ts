import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { Pool } from "pg";
import type { VerifiedIdentity } from "./identity.js";
import {
  handleAuthConfig,
  handleAuthMe,
  handleGuestAuth,
  handleGoogleAuth,
  handleLinkIdentity,
  handleLogout,
  handleRefreshSession,
  handleTelegramAuth,
  handleTelegramWebAuth,
} from "./accountAuthRoute.js";
import { GoogleIdentityError, verifyGoogleCredential } from "./googleIdentity.js";
import { PlayerAuthService } from "./playerAuth.js";
import { SessionRepository } from "./sessionRepository.js";
import { GuestCreationRateLimiter } from "./guestCreationRateLimiter.js";
import { getGuestClientIp } from "./guestCreationRateLimiter.js";
import { PlayerRepository } from "../users/playerRepository.js";
import { getSeasonWindow } from "../battlePassConfig.js";
import type { IncomingMessage } from "node:http";

const databaseUrl = process.env.DATABASE_URL?.trim();
const botToken = "123456:test-route-token";
const googleClientId = "cardastika-test-client";

test("guest client IP trusts Vercel's documented header and ignores client forwarding headers locally", () => {
  const request = {
    headers: {
      "x-forwarded-for": "198.51.100.17, 10.0.0.4",
      "x-vercel-forwarded-for": "203.0.113.22",
      "x-real-ip": "192.0.2.200",
    },
    socket: { remoteAddress: "127.0.0.1" },
  } as unknown as IncomingMessage;

  assert.equal(getGuestClientIp(request, true), "198.51.100.17");
  assert.equal(getGuestClientIp(request, false), "127.0.0.1");
});

interface JsonResponse {
  status: number;
  body: unknown;
  retryAfter?: string;
}

function dataCheckString(data: Record<string, string>) {
  return Object.entries(data)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function signedMiniAppInitData(id: string) {
  const data: Record<string, string> = {
    auth_date: String(Math.floor(Date.now() / 1_000)),
    user: JSON.stringify({ first_name: "Mini App", id: Number(id), username: "mini_app_user" }),
  };
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString(data)).digest("hex");
  return new URLSearchParams({ ...data, hash }).toString();
}

function signedTelegramWidgetData(id: string) {
  const data: Record<string, string> = {
    allows_write_to_pm: "true",
    auth_date: String(Math.floor(Date.now() / 1_000)),
    first_name: "Widget Telegram",
    id,
    username: "widget_telegram_user",
  };
  const secretKey = createHash("sha256").update(botToken).digest();
  return {
    ...data,
    hash: createHmac("sha256", secretKey).update(dataCheckString(data)).digest("hex"),
  };
}

async function requestJson(origin: string, path: string, init: RequestInit = {}): Promise<JsonResponse> {
  const response = await fetch(`${origin}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  const retryAfter = response.headers.get("retry-after");
  return { status: response.status, body: text ? JSON.parse(text) : null, ...(retryAfter ? { retryAfter } : {}) };
}

async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not expose a port");
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server) {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function createAuthServer(pool: Pool, googleIdentities: Map<string, VerifiedIdentity>) {
  const players = new PlayerRepository(pool);
  const sessions = new SessionRepository(pool);
  const auth = new PlayerAuthService(players, sessions, botToken);
  const guestCreationRateLimiter = new GuestCreationRateLimiter(pool, `${botToken}:${randomUUID()}`);
  const verifyGoogle = async (credential: string, clientId: string | null): Promise<VerifiedIdentity> => {
    if (clientId !== googleClientId) throw new GoogleIdentityError("invalid_google_credential");
    const identity = googleIdentities.get(credential);
    if (!identity) throw new GoogleIdentityError("invalid_google_credential");
    return identity;
  };
  const dependencies = {
    auth,
    botToken,
    googleClientId,
    players,
    guestCreationRateLimiter,
    telegramBotUsername: "route_test_bot",
    verifyGoogle: verifyGoogle as typeof verifyGoogleCredential,
  };

  const server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    const task = request.method === "GET" && path === "/api/auth/config"
      ? handleAuthConfig(request, response, dependencies)
      : request.method === "POST" && path === "/api/auth/telegram"
      ? handleTelegramAuth(request, response, dependencies)
      : request.method === "POST" && path === "/api/auth/guest"
        ? handleGuestAuth(request, response, dependencies)
      : request.method === "POST" && path === "/api/auth/telegram/web"
        ? handleTelegramWebAuth(request, response, dependencies)
        : request.method === "POST" && path === "/api/auth/google"
          ? handleGoogleAuth(request, response, dependencies)
          : request.method === "GET" && path === "/api/auth/me"
            ? handleAuthMe(request, response, dependencies)
            : request.method === "POST" && path === "/api/auth/link"
              ? handleLinkIdentity(request, response, dependencies)
              : request.method === "POST" && path === "/api/auth/logout"
                ? handleLogout(request, response, dependencies)
          : request.method === "POST" && path === "/api/auth/refresh"
            ? handleRefreshSession(request, response, dependencies)
            : Promise.resolve(response.writeHead(404).end());
    void task;
  });
  return { players, server, sessions };
}

test("Telegram Mini App login creates a Cardastika session and logout revokes it", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const userId = String(Date.now() * 1_000 + 11);
  const { server } = createAuthServer(pool, new Map());
  const origin = await listen(server);
  let playerId: string | undefined;
  try {
    const config = await requestJson(origin, "/api/auth/config");
    assert.deepEqual(config, {
      status: 200,
      body: { googleClientId, telegramBotUsername: "route_test_bot" },
    });

    const tamperedUserId = String(Date.now() * 1_000 + 999);
    const tamperedInitData = signedMiniAppInitData(userId).replace(userId, tamperedUserId);
    const tamperedLogin = await requestJson(origin, "/api/auth/telegram", {
      method: "POST",
      body: JSON.stringify({ initData: tamperedInitData }),
    });
    assert.equal(tamperedLogin.status, 401);
    const spoofedUser = await pool.query(
      "SELECT 1 FROM players WHERE telegram_user_id = $1",
      [tamperedUserId],
    );
    assert.equal(spoofedUser.rowCount, 0);

    const login = await requestJson(origin, "/api/auth/telegram", {
      method: "POST",
      body: JSON.stringify({ initData: signedMiniAppInitData(userId) }),
    });
    assert.equal(login.status, 200);
    const loginBody = login.body as { player: { id: string }; sessionToken: string; identities: Array<{ provider: string }> };
    playerId = loginBody.player.id;
    assert.ok(loginBody.sessionToken);
    assert.deepEqual(loginBody.identities.map(({ provider }) => provider), ["telegram"]);

    const repeatedLogin = await requestJson(origin, "/api/auth/telegram", {
      method: "POST",
      body: JSON.stringify({ initData: signedMiniAppInitData(userId) }),
    });
    assert.equal(repeatedLogin.status, 200);
    assert.equal((repeatedLogin.body as { player: { id: string } }).player.id, playerId);

    const me = await requestJson(origin, "/api/auth/me", {
      headers: { Authorization: `Bearer ${loginBody.sessionToken}` },
    });
    assert.equal(me.status, 200);
    assert.equal((me.body as { player: { id: string } }).player.id, playerId);

    const sessionHash = createHash("sha256").update(loginBody.sessionToken).digest("hex");
    await pool.query("UPDATE player_sessions SET expires_at = NOW() + INTERVAL '1 day' WHERE token_hash = $1", [sessionHash]);
    const refresh = await requestJson(origin, "/api/auth/refresh", {
      method: "POST",
      headers: { Authorization: `Bearer ${loginBody.sessionToken}` },
    });
    assert.deepEqual(refresh, { status: 200, body: { ok: true } });
    const extended = await pool.query<{ expires_at: Date }>("SELECT expires_at FROM player_sessions WHERE token_hash = $1", [sessionHash]);
    assert.ok(extended.rows[0]!.expires_at.getTime() > Date.now() + 29 * 24 * 60 * 60 * 1_000);

    await pool.query("UPDATE player_sessions SET expires_at = NOW() - INTERVAL '1 second' WHERE token_hash = $1", [sessionHash]);
    const expiredRefresh = await requestJson(origin, "/api/auth/refresh", {
      method: "POST",
      headers: { Authorization: `Bearer ${loginBody.sessionToken}` },
    });
    assert.equal(expiredRefresh.status, 401);
    const expiredMe = await requestJson(origin, "/api/auth/me", {
      headers: { Authorization: `Bearer ${loginBody.sessionToken}` },
    });
    assert.equal(expiredMe.status, 401);

    const logout = await requestJson(origin, "/api/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${loginBody.sessionToken}` },
    });
    assert.deepEqual(logout, { status: 200, body: { ok: true } });

    const revoked = await requestJson(origin, "/api/auth/me", {
      headers: { Authorization: `Bearer ${loginBody.sessionToken}` },
    });
    assert.equal(revoked.status, 401);
  } finally {
    if (playerId) await pool.query("DELETE FROM players WHERE id = $1", [playerId]);
    await close(server);
    await pool.end();
  }
});

test("Google web login and explicit Telegram linking resolve to one player", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const googleCredential = `google-route-${Date.now()}`;
  const telegramId = String(Date.now() * 1_000 + 12);
  const googleIdentity: VerifiedIdentity = {
    provider: "google",
    providerUserId: `google-sub-${Date.now()}`,
    email: `${googleCredential}@example.com`,
    firstName: "Google Route",
    lastName: null,
    photoUrl: null,
  };
  const { server } = createAuthServer(pool, new Map([[googleCredential, googleIdentity]]));
  const origin = await listen(server);
  let playerId: string | undefined;
  try {
    const login = await requestJson(origin, "/api/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential: googleCredential }),
    });
    assert.equal(login.status, 200);
    const loginBody = login.body as { player: { id: string }; sessionToken: string; identities: Array<{ provider: string }> };
    playerId = loginBody.player.id;
    assert.deepEqual(loginBody.identities.map(({ provider }) => provider), ["google"]);

    const repeated = await requestJson(origin, "/api/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential: googleCredential }),
    });
    assert.equal(repeated.status, 200);
    assert.equal((repeated.body as { player: { id: string } }).player.id, playerId);

    const link = await requestJson(origin, "/api/auth/link", {
      method: "POST",
      headers: { Authorization: `Bearer ${loginBody.sessionToken}` },
      body: JSON.stringify({ provider: "telegram", authData: signedTelegramWidgetData(telegramId) }),
    });
    assert.equal(link.status, 200);
    assert.equal((link.body as { replacedExisting: boolean }).replacedExisting, false);
    assert.deepEqual((link.body as { identities: Array<{ provider: string }> }).identities.map(({ provider }) => provider).sort(), ["google", "telegram"]);

    const telegramLogin = await requestJson(origin, "/api/auth/telegram/web", {
      method: "POST",
      body: JSON.stringify({ authData: signedTelegramWidgetData(telegramId) }),
    });
    assert.equal(telegramLogin.status, 200);
    assert.equal((telegramLogin.body as { player: { id: string } }).player.id, playerId);
  } finally {
    if (playerId) await pool.query("DELETE FROM players WHERE id = $1", [playerId]);
    await close(server);
    await pool.end();
  }
});

test("a signed-in Telegram player can explicitly transfer an existing Google identity", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const googleCredential = `google-transfer-route-${Date.now()}`;
  const telegramId = String(Date.now() * 1_000 + 13);
  const googleIdentity: VerifiedIdentity = {
    provider: "google",
    providerUserId: `google-transfer-sub-${Date.now()}`,
    email: `${googleCredential}@example.com`,
    firstName: "Google Transfer",
    lastName: null,
    photoUrl: null,
  };
  const { server } = createAuthServer(pool, new Map([[googleCredential, googleIdentity]]));
  const origin = await listen(server);
  const playerIds: string[] = [];
  try {
    const googleLogin = await requestJson(origin, "/api/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential: googleCredential }),
    });
    assert.equal(googleLogin.status, 200);
    const googleLoginBody = googleLogin.body as { player: { id: string }; sessionToken: string };
    playerIds.push(googleLoginBody.player.id);

    const telegramLogin = await requestJson(origin, "/api/auth/telegram", {
      method: "POST",
      body: JSON.stringify({ initData: signedMiniAppInitData(telegramId) }),
    });
    assert.equal(telegramLogin.status, 200);
    const telegramLoginBody = telegramLogin.body as { player: { id: string }; sessionToken: string };
    playerIds.push(telegramLoginBody.player.id);

    const conflict = await requestJson(origin, "/api/auth/link", {
      method: "POST",
      headers: { Authorization: `Bearer ${telegramLoginBody.sessionToken}` },
      body: JSON.stringify({ provider: "google", credential: googleCredential }),
    });
    assert.deepEqual(conflict, {
      status: 409,
      body: { error: { code: "identity_belongs_to_other_player", message: "Цей акаунт уже прив'язаний до іншого профілю Cardastika." } },
    });

    const transfer = await requestJson(origin, "/api/auth/link", {
      method: "POST",
      headers: { Authorization: `Bearer ${telegramLoginBody.sessionToken}` },
      body: JSON.stringify({ provider: "google", credential: googleCredential, replaceExisting: true }),
    });
    assert.equal(transfer.status, 200);
    assert.equal((transfer.body as { replacedExisting: boolean }).replacedExisting, true);
    assert.deepEqual((transfer.body as { identities: Array<{ provider: string }> }).identities.map(({ provider }) => provider).sort(), ["google", "telegram"]);

    const oldSession = await requestJson(origin, "/api/auth/me", {
      headers: { Authorization: `Bearer ${googleLoginBody.sessionToken}` },
    });
    assert.equal(oldSession.status, 401);

    const repeatedGoogleLogin = await requestJson(origin, "/api/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential: googleCredential }),
    });
    assert.equal(repeatedGoogleLogin.status, 200);
    assert.equal((repeatedGoogleLogin.body as { player: { id: string } }).player.id, telegramLoginBody.player.id);
    assert.equal(Number((await pool.query("SELECT count(*) FROM players WHERE id = $1", [googleLoginBody.player.id])).rows[0].count), 1);
  } finally {
    if (playerIds.length) await pool.query("DELETE FROM players WHERE id = ANY($1::uuid[])", [playerIds]);
    await close(server);
    await pool.end();
  }
});

test("a signed-in Google player cannot transfer an existing Telegram profile", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const googleCredential = `telegram-authoritative-route-${Date.now()}`;
  const telegramId = String(Date.now() * 1_000 + 14);
  const googleIdentity: VerifiedIdentity = {
    provider: "google",
    providerUserId: `telegram-authoritative-sub-${Date.now()}`,
    email: `${googleCredential}@example.com`,
    firstName: "Google Target",
    lastName: null,
    photoUrl: null,
  };
  const { server } = createAuthServer(pool, new Map([[googleCredential, googleIdentity]]));
  const origin = await listen(server);
  const playerIds: string[] = [];
  try {
    const telegramLogin = await requestJson(origin, "/api/auth/telegram", {
      method: "POST",
      body: JSON.stringify({ initData: signedMiniAppInitData(telegramId) }),
    });
    assert.equal(telegramLogin.status, 200);
    const telegramLoginBody = telegramLogin.body as { player: { id: string } };
    playerIds.push(telegramLoginBody.player.id);

    const googleLogin = await requestJson(origin, "/api/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential: googleCredential }),
    });
    assert.equal(googleLogin.status, 200);
    const googleLoginBody = googleLogin.body as { player: { id: string }; sessionToken: string };
    playerIds.push(googleLoginBody.player.id);

    const transfer = await requestJson(origin, "/api/auth/link", {
      method: "POST",
      headers: { Authorization: `Bearer ${googleLoginBody.sessionToken}` },
      body: JSON.stringify({ provider: "telegram", authData: signedTelegramWidgetData(telegramId), replaceExisting: true }),
    });
    assert.deepEqual(transfer, {
      status: 409,
      body: {
        error: {
          code: "telegram_profile_is_authoritative",
          message: "Цей Telegram уже має профіль. Увійдіть через Telegram і прив'яжіть Google у його налаштуваннях.",
        },
      },
    });

    const repeatedTelegramLogin = await requestJson(origin, "/api/auth/telegram", {
      method: "POST",
      body: JSON.stringify({ initData: signedMiniAppInitData(telegramId) }),
    });
    assert.equal((repeatedTelegramLogin.body as { player: { id: string } }).player.id, telegramLoginBody.player.id);
  } finally {
    if (playerIds.length) await pool.query("DELETE FROM players WHERE id = ANY($1::uuid[])", [playerIds]);
    await close(server);
    await pool.end();
  }
});

test("guest profiles persist, reject identity conflicts, and grant the link reward once", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const conflictCredential = `guest-conflict-${Date.now()}`;
  const linkedCredential = `guest-linked-${Date.now()}`;
  const conflictIdentity: VerifiedIdentity = {
    provider: "google",
    providerUserId: `guest-conflict-sub-${Date.now()}`,
    email: `${conflictCredential}@example.com`,
    firstName: "Account Owner",
    lastName: null,
    photoUrl: null,
  };
  const linkedIdentity: VerifiedIdentity = {
    provider: "google",
    providerUserId: `guest-linked-sub-${Date.now()}`,
    email: `${linkedCredential}@example.com`,
    firstName: "Guest Linked",
    lastName: null,
    photoUrl: null,
  };
  const telegramId = String(Date.now() * 1_000 + 21);
  const { server, sessions } = createAuthServer(pool, new Map([
    [conflictCredential, conflictIdentity],
    [linkedCredential, linkedIdentity],
  ]));
  const origin = await listen(server);
  const playerIds: string[] = [];
  try {
    const existingAccount = await requestJson(origin, "/api/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential: conflictCredential }),
    });
    assert.equal(existingAccount.status, 200);
    const existingBody = existingAccount.body as { player: { id: string }; sessionToken: string };
    playerIds.push(existingBody.player.id);

    const guestLogin = await requestJson(origin, "/api/auth/guest", { method: "POST" });
    assert.equal(guestLogin.status, 200, JSON.stringify(guestLogin.body));
    const guestBody = guestLogin.body as {
      identities: unknown[];
      player: { firstName: string; gold: number; id: string; level: number; silver: number; tutorialEligible: boolean };
      sessionProvider: string;
      sessionToken: string;
    };
    playerIds.push(guestBody.player.id);
    assert.equal(guestBody.sessionProvider, "guest");
    assert.match(guestBody.player.firstName, /^Сірий маг #\d{5}$/u);
    assert.equal(guestBody.player.level, 1);
    assert.equal(guestBody.player.silver, 1_500);
    assert.equal(guestBody.player.gold, 0);
    assert.equal(guestBody.player.tutorialEligible, true);
    assert.deepEqual(guestBody.identities, []);
    assert.ok(Number((await pool.query<{ count: number }>(
      "SELECT count(*)::integer AS count FROM player_card_instances WHERE player_id = $1",
      [guestBody.player.id],
    )).rows[0]?.count) > 0);

    const guestMe = await requestJson(origin, "/api/auth/me", {
      headers: { Authorization: `Bearer ${guestBody.sessionToken}` },
    });
    assert.equal(guestMe.status, 200);
    assert.equal((guestMe.body as { player: { id: string }; sessionProvider: string; accountProtection: { status: string } }).player.id, guestBody.player.id);
    assert.equal((guestMe.body as { sessionProvider: string }).sessionProvider, "guest");
    assert.equal((guestMe.body as { accountProtection: { status: string } }).accountProtection.status, "locked");

    const earlyLink = await requestJson(origin, "/api/auth/link", {
      method: "POST",
      headers: { Authorization: `Bearer ${guestBody.sessionToken}` },
      body: JSON.stringify({ provider: "telegram", initData: signedMiniAppInitData(telegramId) }),
    });
    assert.equal(earlyLink.status, 409);
    assert.equal((earlyLink.body as { error: { code: string } }).error.code, "account_protection_locked");

    await pool.query("UPDATE players SET tutorial_eligible = FALSE WHERE id = $1", [guestBody.player.id]);
    const progressBeforeLink = await pool.query<{ account_xp: string; gold: string; level: number; silver: string }>(
      "SELECT level, account_xp::text, silver::text, gold::text FROM players WHERE id = $1",
      [guestBody.player.id],
    );
    const cardsBeforeLink = await pool.query<{ count: number }>(
      "SELECT count(*)::integer AS count FROM player_card_instances WHERE player_id = $1",
      [guestBody.player.id],
    );
    const deckBeforeLink = await pool.query<{ slot: number; card_instance_id: string }>(
      "SELECT slots.slot, slots.card_instance_id FROM player_decks AS decks JOIN deck_slots AS slots ON slots.deck_id = decks.id WHERE decks.player_id = $1 ORDER BY slots.slot",
      [guestBody.player.id],
    );
    const available = await requestJson(origin, "/api/auth/me", {
      headers: { Authorization: `Bearer ${guestBody.sessionToken}` },
    });
    assert.equal((available.body as { accountProtection: { status: string } }).accountProtection.status, "available");

    const conflict = await requestJson(origin, "/api/auth/link", {
      method: "POST",
      headers: { Authorization: `Bearer ${guestBody.sessionToken}` },
      body: JSON.stringify({ provider: "google", credential: conflictCredential }),
    });
    assert.equal(conflict.status, 409);
    assert.equal((conflict.body as { error: { code: string } }).error.code, "identity_belongs_to_other_player");

    const transfer = await requestJson(origin, "/api/auth/link", {
      method: "POST",
      headers: { Authorization: `Bearer ${guestBody.sessionToken}` },
      body: JSON.stringify({ provider: "google", credential: conflictCredential, replaceExisting: true }),
    });
    assert.equal(transfer.status, 409);
    assert.equal((transfer.body as { error: { code: string } }).error.code, "guest_identity_transfer_forbidden");

    const secondSession = await sessions.create(guestBody.player.id, "guest");
    const telegramLinkRequests = await Promise.all([guestBody.sessionToken, secondSession.token].map((sessionToken) => requestJson(origin, "/api/auth/link", {
      method: "POST",
      headers: { Authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify({ provider: "telegram", initData: signedMiniAppInitData(telegramId) }),
    })));
    assert.deepEqual(telegramLinkRequests.map(({ status }) => status).sort(), [200, 409]);
    const successfulTelegramLink = telegramLinkRequests.find(({ status }) => status === 200)!;
    const rejectedTelegramLink = telegramLinkRequests.find(({ status }) => status === 409)!;
    assert.equal((successfulTelegramLink.body as { rewardGranted: boolean }).rewardGranted, true);
    assert.equal((rejectedTelegramLink.body as { error: { code: string } }).error.code, "identity_already_linked");

    const { seasonId } = getSeasonWindow(new Date());
    const rewardBalance = async () => Number((await pool.query<{ diamonds: string | number }>(
      "SELECT diamonds FROM player_battle_pass_state WHERE player_id = $1 AND season_id = $2",
      [guestBody.player.id, seasonId],
    )).rows[0]?.diamonds ?? 0);
    assert.equal(await rewardBalance(), 5);

    const rewardedIdentity = await pool.query<{ linked_provider: string; linked_provider_user_id: string }>(
      "SELECT linked_provider, linked_provider_user_id FROM player_account_link_rewards WHERE player_id = $1",
      [guestBody.player.id],
    );
    assert.deepEqual(rewardedIdentity.rows[0], { linked_provider: "telegram", linked_provider_user_id: telegramId });

    const secondGuestLogin = await requestJson(origin, "/api/auth/guest", { method: "POST" });
    assert.equal(secondGuestLogin.status, 200);
    const secondGuest = secondGuestLogin.body as { player: { id: string }; sessionToken: string };
    playerIds.push(secondGuest.player.id);
    await pool.query("UPDATE players SET tutorial_eligible = FALSE WHERE id = $1", [secondGuest.player.id]);
    const reusedTelegram = await requestJson(origin, "/api/auth/link", {
      method: "POST",
      headers: { Authorization: `Bearer ${secondGuest.sessionToken}` },
      body: JSON.stringify({ provider: "telegram", initData: signedMiniAppInitData(telegramId) }),
    });
    assert.equal(reusedTelegram.status, 409);
    assert.equal((reusedTelegram.body as { error: { code: string } }).error.code, "telegram_profile_is_authoritative");

    const googleLink = await requestJson(origin, "/api/auth/link", {
      method: "POST",
      headers: { Authorization: `Bearer ${guestBody.sessionToken}` },
      body: JSON.stringify({ provider: "google", credential: linkedCredential }),
    });
    assert.equal(googleLink.status, 200);
    assert.equal((googleLink.body as { rewardGranted: boolean }).rewardGranted, false);
    assert.equal(await rewardBalance(), 5);

    const completed = await requestJson(origin, "/api/auth/me", {
      headers: { Authorization: `Bearer ${guestBody.sessionToken}` },
    });
    assert.equal((completed.body as { accountProtection: { status: string } }).accountProtection.status, "completed");
    const conflictOwner = await pool.query<{ player_id: string }>(
      "SELECT player_id FROM auth_identities WHERE provider = 'google' AND provider_user_id = $1",
      [conflictIdentity.providerUserId],
    );
    assert.equal(conflictOwner.rows[0]?.player_id, existingBody.player.id);
    const progressAfterLink = await pool.query<{ account_xp: string; gold: string; level: number; silver: string }>(
      "SELECT level, account_xp::text, silver::text, gold::text FROM players WHERE id = $1",
      [guestBody.player.id],
    );
    const cardsAfterLink = await pool.query<{ count: number }>(
      "SELECT count(*)::integer AS count FROM player_card_instances WHERE player_id = $1",
      [guestBody.player.id],
    );
    const deckAfterLink = await pool.query<{ slot: number; card_instance_id: string }>(
      "SELECT slots.slot, slots.card_instance_id FROM player_decks AS decks JOIN deck_slots AS slots ON slots.deck_id = decks.id WHERE decks.player_id = $1 ORDER BY slots.slot",
      [guestBody.player.id],
    );
    assert.deepEqual(progressAfterLink.rows, progressBeforeLink.rows);
    assert.deepEqual(cardsAfterLink.rows, cardsBeforeLink.rows);
    assert.deepEqual(deckAfterLink.rows, deckBeforeLink.rows);
  } finally {
    if (playerIds.length) await pool.query("DELETE FROM players WHERE id = ANY($1::uuid[])", [playerIds]);
    await close(server);
    await pool.end();
  }
});

test("guest profile and session creation roll back together", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const { server, sessions } = createAuthServer(pool, new Map());
  const origin = await listen(server);
  const before = Number((await pool.query<{ count: string }>("SELECT count(*) FROM players")).rows[0]!.count);
  const createSession = sessions.createInTransaction;
  sessions.createInTransaction = async () => { throw new Error("test session insert failure"); };
  try {
    const result = await requestJson(origin, "/api/auth/guest", { method: "POST" });
    assert.equal(result.status, 503);
    assert.equal((result.body as { error: { code: string } }).error.code, "database_unavailable");
    const after = Number((await pool.query<{ count: string }>("SELECT count(*) FROM players")).rows[0]!.count);
    assert.equal(after, before);
  } finally {
    sessions.createInTransaction = createSession;
    await close(server);
    await pool.end();
  }
});

test("guest creation is capped per client network", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const { server } = createAuthServer(pool, new Map());
  const origin = await listen(server);
  const playerIds: string[] = [];
  try {
    const requests = Array.from({ length: 6 }, (_, index) => requestJson(origin, "/api/auth/guest", {
        method: "POST",
        headers: { "X-Forwarded-For": `192.0.2.${index + 1}` },
      }));
    const results = await Promise.all(requests);
    const successfulRequests = results.filter(({ status }) => status === 200);
    const limitedRequests = results.filter(({ status }) => status === 429);
    assert.equal(successfulRequests.length, 5);
    assert.equal(limitedRequests.length, 1);
    for (const result of successfulRequests) {
      assert.equal(result.status, 200);
      playerIds.push((result.body as { player: { id: string } }).player.id);
    }
    assert.equal((limitedRequests[0]!.body as { error: { code: string } }).error.code, "guest_creation_rate_limited");
    assert.equal((limitedRequests[0]!.body as { error: { message: string } }).error.message, "Забагато гостьових акаунтів із цієї мережі. Спробуй пізніше.");
    assert.match(limitedRequests[0]!.retryAfter ?? "", /^\d+$/u);
  } finally {
    if (playerIds.length) await pool.query("DELETE FROM players WHERE id = ANY($1::uuid[])", [playerIds]);
    await close(server);
    await pool.end();
  }
});

test("guest creation limits are shared across server instances and cap 20 attempts per day", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const ip = "198.51.100.42";
  const secret = `guest-rate-limit-${randomUUID()}`;
  const ipHash = createHmac("sha256", secret)
    .update(`cardastika:guest-creation:v1:ipv4:${ip}`)
    .digest("hex");
  const firstInstance = new GuestCreationRateLimiter(pool, secret);
  const secondInstance = new GuestCreationRateLimiter(pool, secret);
  const instances = [firstInstance, secondInstance];

  try {
    const concurrent = await Promise.all(Array.from({ length: 6 }, (_, index) => instances[index % instances.length]!.consume(ip)));
    assert.equal(concurrent.filter(({ allowed }) => allowed).length, 5);
    assert.equal(concurrent.filter(({ allowed }) => !allowed).length, 1);

    for (let attempt = 0; attempt < 14; attempt += 1) {
      if (attempt % 5 === 0) {
        await pool.query(
          "UPDATE guest_creation_rate_limits SET hour_started_at = NOW() - INTERVAL '1 hour' WHERE ip_hash = $1",
          [ipHash],
        );
      }
      const result = await instances[attempt % instances.length]!.consume(ip);
      assert.equal(result.allowed, true, `daily attempt ${attempt + 7} should be allowed`);
    }

    const twentyFirst = await firstInstance.consume(ip);
    assert.equal(twentyFirst.allowed, false);
    assert.ok((twentyFirst.retryAfterSeconds ?? 0) > 0);
  } finally {
    await pool.query("DELETE FROM guest_creation_rate_limits WHERE ip_hash = $1", [ipHash]);
    await pool.end();
  }
});
