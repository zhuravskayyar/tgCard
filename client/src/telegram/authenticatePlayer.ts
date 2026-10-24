import {
  CARD_ELEMENTS,
  COLLECTION_BONUS_SCOPES,
  COLLECTION_MODIFIER_TYPES,
  EQUIPMENT_SLOTS,
  PLAYER_NICKNAME_MAX_LENGTH,
  type AuthIdentityView,
  type AccountProtectionTaskView,
  type AuthSessionProvider,
  type AuthSessionResponse,
  type LinkIdentityRequest,
  type LinkIdentityResponse,
  type PlayerCollectionBonus,
  type PlayerSummary,
  type PublicPlayerEquipment,
  type TelegramAuthRequest,
} from "@cardastika/shared";
import { getApiEndpoint } from "../api/config";
import { clearSessionToken, getSessionToken, setSessionToken } from "../auth/session";

export class PlayerBootstrapError extends Error {
  constructor(public readonly status: number) {
    super("Player bootstrap failed");
    this.name = "PlayerBootstrapError";
  }
}

export class AccountLinkError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AccountLinkError";
  }
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNonNegativeInteger(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isCollectionBonus(value: unknown): value is PlayerCollectionBonus {
  if (!value || typeof value !== "object") return false;
  const bonus = value as Record<string, unknown>;
  if (typeof bonus.collectionId !== "string" || typeof bonus.collectionName !== "string" || typeof bonus.bonusLabel !== "string") {
    return false;
  }
  if (!bonus.bonus || typeof bonus.bonus !== "object") return false;
  const modifier = bonus.bonus as Record<string, unknown>;
  const validType = typeof modifier.type === "string" && COLLECTION_MODIFIER_TYPES.includes(modifier.type as typeof COLLECTION_MODIFIER_TYPES[number]);
  const validElement = modifier.element === undefined || (typeof modifier.element === "string" && CARD_ELEMENTS.includes(modifier.element as typeof CARD_ELEMENTS[number]));
  const validScope = modifier.scope === undefined || (typeof modifier.scope === "string" && COLLECTION_BONUS_SCOPES.includes(modifier.scope as typeof COLLECTION_BONUS_SCOPES[number]));
  const requiresElement = modifier.type === "element_damage_pct";
  return validType
    && validElement
    && validScope
    && (!requiresElement || typeof modifier.element === "string")
    && typeof modifier.value === "number"
    && Number.isFinite(modifier.value)
    && modifier.value >= 0;
}

function isPublicPlayerEquipment(value: unknown): value is PublicPlayerEquipment {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const equipment = value as Record<string, unknown>;
  if (!equipment.equipped || typeof equipment.equipped !== "object" || Array.isArray(equipment.equipped)) return false;
  const equipped = equipment.equipped as Record<string, unknown>;
  return EQUIPMENT_SLOTS.every((slot) => equipped[slot] === null || typeof equipped[slot] === "string");
}

function isPlayerSummary(value: unknown): value is PlayerSummary {
  if (!value || typeof value !== "object") {
    return false;
  }

  const player = value as Record<string, unknown>;
  return (
    typeof player.id === "string" &&
    isNullableString(player.username) &&
    (player.nickname === undefined || (isNullableString(player.nickname) && (player.nickname === null || Array.from(player.nickname).length <= PLAYER_NICKNAME_MAX_LENGTH))) &&
    typeof player.firstName === "string" &&
    isNullableString(player.photoUrl) &&
    (player.tutorialEligible === undefined || typeof player.tutorialEligible === "boolean") &&
    Number.isSafeInteger(player.level) &&
    Number(player.level) >= 1 &&
    isNonNegativeInteger(player.accountXp) &&
    Number.isSafeInteger(player.accountXpRequired) &&
    Number(player.accountXpRequired) >= 0 &&
    (player.experienceRewardPct === undefined || (Number.isFinite(player.experienceRewardPct) && Number(player.experienceRewardPct) >= 0)) &&
    (player.collectionBonuses === undefined || (Array.isArray(player.collectionBonuses) && player.collectionBonuses.every(isCollectionBonus))) &&
    (player.equipment === undefined || isPublicPlayerEquipment(player.equipment)) &&
    isNonNegativeInteger(player.silver) &&
    isNonNegativeInteger(player.gold) &&
    (player.duelWins === undefined || isNonNegativeInteger(player.duelWins)) &&
    (player.duelRating === undefined || isNonNegativeInteger(player.duelRating)) &&
    (player.duelHighestLeagueIndex === undefined || isNonNegativeInteger(player.duelHighestLeagueIndex))
  );
}

function isAuthSessionResponse(value: unknown): value is AuthSessionResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Record<string, unknown>;
  return typeof response.sessionToken === "string"
    && isPlayerSummary(response.player)
    && Array.isArray(response.identities)
    && isAuthSessionProvider(response.sessionProvider);
}

function isAuthSessionProvider(value: unknown): value is AuthSessionProvider {
  return value === "guest" || value === "google" || value === "telegram";
}

function isAccountProtectionTask(value: unknown): value is AccountProtectionTaskView {
  if (!value || typeof value !== "object") return false;
  const task = value as Record<string, unknown>;
  return task.rewardDiamonds === 5
    && (task.status === "locked" || task.status === "available" || task.status === "completed" || task.status === "not_applicable");
}

async function readAuthResponse(response: Response) {
  if (!response.ok) throw new PlayerBootstrapError(response.status);
  const value: unknown = await response.json();
  if (!isAuthSessionResponse(value)) throw new PlayerBootstrapError(502);
  setSessionToken(value.sessionToken);
  return value;
}

export async function authenticateTelegramPlayer(initData: string, signal: AbortSignal) {
  const body: TelegramAuthRequest = { initData };
  const response = await fetch(getApiEndpoint("/api/auth/telegram"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });

  return (await readAuthResponse(response)).player;
}

async function authenticateExternal(path: string, body: unknown, signal: AbortSignal) {
  const response = await fetch(getApiEndpoint(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  return readAuthResponse(response);
}

export function authenticateGooglePlayer(credential: string, signal: AbortSignal) {
  return authenticateExternal("/api/auth/google", { credential }, signal);
}

export function authenticateGuestPlayer(signal: AbortSignal) {
  return authenticateExternal("/api/auth/guest", {}, signal);
}

export function authenticateTelegramWebPlayer(authData: Record<string, string>, signal: AbortSignal) {
  return authenticateExternal("/api/auth/telegram/web", { authData }, signal);
}

export async function loadCurrentPlayer(signal: AbortSignal) {
  return (await loadCurrentAuth(signal)).player;
}

export async function loadCurrentAuth(signal: AbortSignal) {
  const token = getSessionToken();
  if (!token) throw new PlayerBootstrapError(401);
  const refresh = await fetch(getApiEndpoint("/api/auth/refresh"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  if (!refresh.ok) {
    if (refresh.status === 401) clearSessionToken();
    throw new PlayerBootstrapError(refresh.status);
  }
  const response = await fetch(getApiEndpoint("/api/auth/me"), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) {
    if (response.status === 401) clearSessionToken();
    throw new PlayerBootstrapError(response.status);
  }
  const value: unknown = await response.json();
  if (
    !value
    || typeof value !== "object"
    || !isPlayerSummary((value as Record<string, unknown>).player)
    || !Array.isArray((value as Record<string, unknown>).identities)
    || !isAuthSessionProvider((value as Record<string, unknown>).sessionProvider)
    || !isAccountProtectionTask((value as Record<string, unknown>).accountProtection)
  ) {
    throw new PlayerBootstrapError(502);
  }
  return value as {
    accountProtection: AccountProtectionTaskView;
    identities: AuthIdentityView[];
    player: PlayerSummary;
    sessionProvider: AuthSessionProvider;
  };
}

export async function linkGoogleAccount(credential: string, signal: AbortSignal, replaceExisting = false) {
  return linkIdentity({ provider: "google", credential, replaceExisting }, signal);
}

export async function linkTelegramAccount(authData: Record<string, string>, signal: AbortSignal) {
  return linkIdentity({ provider: "telegram", authData }, signal);
}

export async function linkTelegramMiniAppAccount(initData: string, signal: AbortSignal) {
  return linkIdentity({ provider: "telegram", initData }, signal);
}

async function linkIdentity(body: LinkIdentityRequest, signal: AbortSignal): Promise<LinkIdentityResponse> {
  const token = getSessionToken();
  if (!token) throw new PlayerBootstrapError(401);
  const response = await fetch(getApiEndpoint("/api/auth/link"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
    signal,
  });
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const apiError = value && typeof value === "object" && "error" in value
      ? (value as { error?: unknown }).error
      : null;
    const details = apiError && typeof apiError === "object" ? apiError as Record<string, unknown> : null;
    throw new AccountLinkError(
      response.status,
      typeof details?.code === "string" ? details.code : "account_link_failed",
      typeof details?.message === "string" ? details.message : "Не вдалося прив'язати цей спосіб входу.",
    );
  }
  if (
    !value
    || typeof value !== "object"
    || !Array.isArray((value as Record<string, unknown>).identities)
    || typeof (value as Record<string, unknown>).replacedExisting !== "boolean"
    || typeof (value as Record<string, unknown>).rewardGranted !== "boolean"
  ) {
    throw new AccountLinkError(502, "invalid_account_link_response", "Сервер повернув некоректну відповідь.");
  }
  return value as LinkIdentityResponse;
}

export async function logoutPlayer() {
  const token = getSessionToken();
  if (token) {
    await fetch(getApiEndpoint("/api/auth/logout"), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      credentials: "same-origin",
    }).catch(() => undefined);
  }
  clearSessionToken();
}
