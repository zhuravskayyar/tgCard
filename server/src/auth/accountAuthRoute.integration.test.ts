import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { Pool } from "pg";
import type { VerifiedIdentity } from "./identity.js";
import {
  handleAuthConfig,
  handleAuthMe,
  handleGoogleAuth,
  handleLinkIdentity,
  handleLogout,
  handleTelegramAuth,
  handleTelegramWebAuth,
} from "./accountAuthRoute.js";
import { GoogleIdentityError, verifyGoogleCredential } from "./googleIdentity.js";
import { PlayerAuthService } from "./playerAuth.js";
import { SessionRepository } from "./sessionRepository.js";
import { PlayerRepository } from "../users/playerRepository.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
const botToken = "123456:test-route-token";
const googleClientId = "cardastika-test-client";

interface JsonResponse {
  status: number;
  body: unknown;
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
  return { status: response.status, body: text ? JSON.parse(text) : null };
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
    telegramBotUsername: "route_test_bot",
    verifyGoogle: verifyGoogle as typeof verifyGoogleCredential,
  };

  const server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    const task = request.method === "GET" && path === "/api/auth/config"
      ? handleAuthConfig(request, response, dependencies)
      : request.method === "POST" && path === "/api/auth/telegram"
      ? handleTelegramAuth(request, response, dependencies)
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
                : Promise.resolve(response.writeHead(404).end());
    void task;
  });
  return { players, server };
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

    const login = await requestJson(origin, "/api/auth/telegram", {
      method: "POST",
      body: JSON.stringify({ initData: signedMiniAppInitData(userId) }),
    });
    assert.equal(login.status, 200);
    const loginBody = login.body as { player: { id: string }; sessionToken: string; identities: Array<{ provider: string }> };
    playerId = loginBody.player.id;
    assert.ok(loginBody.sessionToken);
    assert.deepEqual(loginBody.identities.map(({ provider }) => provider), ["telegram"]);

    const me = await requestJson(origin, "/api/auth/me", {
      headers: { Authorization: `Bearer ${loginBody.sessionToken}` },
    });
    assert.equal(me.status, 200);
    assert.equal((me.body as { player: { id: string } }).player.id, playerId);

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
