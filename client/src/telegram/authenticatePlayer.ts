import { CARD_ELEMENTS, COLLECTION_MODIFIER_TYPES, EQUIPMENT_SLOTS, PLAYER_NICKNAME_MAX_LENGTH, type AuthIdentityView, type AuthSessionResponse, type PlayerCollectionBonus, type PlayerSummary, type PublicPlayerEquipment, type TelegramAuthRequest } from "@cardastika/shared";
import { getApiEndpoint } from "../api/config";
import { clearSessionToken, getSessionToken, setSessionToken } from "../auth/session";

export class PlayerBootstrapError extends Error {
  constructor(public readonly status: number) {
    super("Player bootstrap failed");
    this.name = "PlayerBootstrapError";
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
  const requiresElement = modifier.type === "element_damage_pct";
  return validType
    && validElement
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
    && Array.isArray(response.identities);
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

export function authenticateTelegramWebPlayer(authData: Record<string, string>, signal: AbortSignal) {
  return authenticateExternal("/api/auth/telegram/web", { authData }, signal);
}

export async function loadCurrentPlayer(signal: AbortSignal) {
  return (await loadCurrentAuth(signal)).player;
}

export async function loadCurrentAuth(signal: AbortSignal) {
  const token = getSessionToken();
  if (!token) throw new PlayerBootstrapError(401);
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
  if (!value || typeof value !== "object" || !isPlayerSummary((value as Record<string, unknown>).player) || !Array.isArray((value as Record<string, unknown>).identities)) {
    throw new PlayerBootstrapError(502);
  }
  return value as { player: PlayerSummary; identities: AuthIdentityView[] };
}

export async function linkGoogleAccount(credential: string, signal: AbortSignal) {
  return linkIdentity({ provider: "google", credential }, signal);
}

export async function linkTelegramAccount(authData: Record<string, string>, signal: AbortSignal) {
  return linkIdentity({ provider: "telegram", authData }, signal);
}

async function linkIdentity(body: unknown, signal: AbortSignal) {
  const token = getSessionToken();
  if (!token) throw new PlayerBootstrapError(401);
  const response = await fetch(getApiEndpoint("/api/auth/link"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) throw new PlayerBootstrapError(response.status);
  return response.json() as Promise<{ identities: AuthIdentityView[] }>;
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
