import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import type { AuthProvider } from "@cardastika/shared";
import { HttpRequestError, readJsonBody, sendJson } from "../http/json.js";
import {
  AuthIdentityAlreadyLinkedError,
  AuthIdentityConflictError,
  PlayerPersistenceError,
  type PlayerRepository,
} from "../users/playerRepository.js";
import { verifyGoogleCredential, GoogleIdentityError } from "./googleIdentity.js";
import { PlayerSessionError, PlayerAuthService } from "./playerAuth.js";
import { resolveTelegramBotUsername, validateTelegramLoginWidget, TelegramWidgetAuthError } from "./telegramLoginWidget.js";
import { validateTelegramInitDataPayload, TelegramInitDataError } from "./telegramInitData.js";

interface AuthRouteDependencies {
  auth: PlayerAuthService;
  botToken: string;
  googleClientId: string | null;
  players: PlayerRepository;
  telegramBotUsername?: string | null;
  referrals?: { acceptFromTelegramStart(playerId: string, startParam: string | null): Promise<unknown> };
  responseHeaders?: OutgoingHttpHeaders;
  verifyGoogle?: typeof verifyGoogleCredential;
}

export async function handleAuthConfig(
  _request: IncomingMessage,
  response: ServerResponse,
  dependencies: AuthRouteDependencies,
) {
  const headers = dependencies.responseHeaders ?? {};
  sendJson(response, 200, {
    googleClientId: dependencies.googleClientId,
    telegramBotUsername: await resolveTelegramBotUsername(dependencies.botToken, dependencies.telegramBotUsername),
  }, headers);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readCredential(body: unknown) {
  if (!isRecord(body) || typeof body.credential !== "string" || !body.credential.trim()) {
    throw new HttpRequestError(400, "invalid_auth_request", "credential is required");
  }
  return body.credential.trim();
}

function readTelegramWidgetData(body: unknown) {
  if (!isRecord(body) || !isRecord(body.authData)) {
    throw new HttpRequestError(400, "invalid_telegram_login", "authData is required");
  }
  const authData: Record<string, string> = {};
  for (const [key, value] of Object.entries(body.authData)) {
    if (typeof value !== "string") throw new HttpRequestError(400, "invalid_telegram_login", "authData is invalid");
    authData[key] = value;
  }
  return authData;
}

function readProvider(body: unknown): AuthProvider {
  if (!isRecord(body) || (body.provider !== "google" && body.provider !== "telegram")) {
    throw new HttpRequestError(400, "invalid_provider", "provider must be google or telegram");
  }
  return body.provider;
}

function sendAuthError(response: ServerResponse, error: unknown, headers: OutgoingHttpHeaders) {
  if (error instanceof HttpRequestError) {
    sendJson(response, error.status, { error: { code: error.code, message: error.message } }, headers);
    return;
  }
  if (error instanceof PlayerSessionError || error instanceof TelegramInitDataError || error instanceof TelegramWidgetAuthError) {
    sendJson(response, 401, { error: { code: error.code, message: "Authentication failed" } }, headers);
    return;
  }
  if (error instanceof GoogleIdentityError) {
    sendJson(response, error.code === "google_not_configured" ? 503 : 401, {
      error: { code: error.code, message: error.code === "google_not_configured" ? "Google login is not configured" : "Google authentication failed" },
    }, headers);
    return;
  }
  if (error instanceof AuthIdentityConflictError) {
    sendJson(response, 409, {
      error: { code: "identity_belongs_to_other_player", message: "Цей акаунт уже прив'язаний до іншого профілю Cardastika." },
    }, headers);
    return;
  }
  if (error instanceof AuthIdentityAlreadyLinkedError) {
    sendJson(response, 409, { error: { code: "identity_already_linked", message: "Цей спосіб входу вже прив'язаний до профілю." } }, headers);
    return;
  }
  if (error instanceof PlayerPersistenceError) {
    sendJson(response, 503, { error: { code: "database_unavailable", message: "Auth service is unavailable" } }, headers);
    return;
  }
  console.error("Unexpected authentication failure", error);
  sendJson(response, 500, { error: { code: "internal_error", message: "Unexpected server failure" } }, headers);
}

export async function handleTelegramAuth(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: AuthRouteDependencies,
) {
  const headers = dependencies.responseHeaders ?? {};
  try {
    const body = await readJsonBody(request);
    if (!isRecord(body) || typeof body.initData !== "string" || !body.initData.trim()) {
      throw new HttpRequestError(400, "missing_init_data", "initData is required");
    }
    const validated = validateTelegramInitDataPayload(body.initData, dependencies.botToken);
    const player = await dependencies.players.findOrCreateFromTelegram(validated.user);
    await dependencies.referrals?.acceptFromTelegramStart(player.id, validated.startParam);
    sendJson(response, 200, await dependencies.auth.createSession(player, "telegram"), headers);
  } catch (error) {
    sendAuthError(response, error, headers);
  }
}

export async function handleTelegramWebAuth(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: AuthRouteDependencies,
) {
  const headers = dependencies.responseHeaders ?? {};
  try {
    const authData = readTelegramWidgetData(await readJsonBody(request));
    const identity = validateTelegramLoginWidget(authData, dependencies.botToken);
    const player = await dependencies.players.findOrCreateFromIdentity(identity);
    sendJson(response, 200, await dependencies.auth.createSession(player, "telegram"), headers);
  } catch (error) {
    sendAuthError(response, error, headers);
  }
}

export async function handleGoogleAuth(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: AuthRouteDependencies,
) {
  const headers = dependencies.responseHeaders ?? {};
  try {
    const credential = readCredential(await readJsonBody(request));
    const identity = await (dependencies.verifyGoogle ?? verifyGoogleCredential)(credential, dependencies.googleClientId);
    const player = await dependencies.players.findOrCreateFromIdentity(identity);
    sendJson(response, 200, await dependencies.auth.createSession(player, "google"), headers);
  } catch (error) {
    sendAuthError(response, error, headers);
  }
}

export async function handleAuthMe(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: AuthRouteDependencies,
) {
  const headers = dependencies.responseHeaders ?? {};
  try {
    const authenticated = await dependencies.auth.authenticateRequest(request, dependencies.players);
    sendJson(response, 200, {
      player: authenticated.player,
      identities: await dependencies.players.listAuthIdentities(authenticated.player.id),
    }, headers);
  } catch (error) {
    sendAuthError(response, error, headers);
  }
}

export async function handleLinkIdentity(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: AuthRouteDependencies,
) {
  const headers = dependencies.responseHeaders ?? {};
  try {
    const authenticated = await dependencies.auth.authenticateRequest(request, dependencies.players);
    const body = await readJsonBody(request);
    const provider = readProvider(body);
    let identity;
    if (provider === "google") {
      identity = await (dependencies.verifyGoogle ?? verifyGoogleCredential)(readCredential(body), dependencies.googleClientId);
    } else {
      const authData = readTelegramWidgetData(body);
      identity = validateTelegramLoginWidget(authData, dependencies.botToken);
    }
    sendJson(response, 200, {
      identities: await dependencies.players.linkIdentity(authenticated.player.id, identity),
    }, headers);
  } catch (error) {
    sendAuthError(response, error, headers);
  }
}

export async function handleLogout(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: AuthRouteDependencies,
) {
  const headers = dependencies.responseHeaders ?? {};
  try {
    const authorization = request.headers.authorization?.trim() ?? "";
    if (authorization.startsWith("Bearer ")) await dependencies.auth.revokeSession(authorization.slice(7).trim());
    sendJson(response, 200, { ok: true }, headers);
  } catch (error) {
    sendAuthError(response, error, headers);
  }
}
