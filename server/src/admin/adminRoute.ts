import { CARD_ELEMENTS, CARD_RARITIES, type AdminCurrency, type CardElement, type CardRarity } from "@cardastika/shared";
import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import { isAuthFailure } from "../auth/routeAuth.js";
import { HttpRequestError, readJsonBody, sendJson } from "../http/json.js";
import { AdminAccessDeniedError, type AdminAuthService } from "./adminAuth.js";
import {
  ADMIN_LIMITS,
  AdminDomainError,
  AdminPersistenceError,
  type AdminAuditListOptions,
  type AdminCardListOptions,
  type AdminPlayerListOptions,
  type AdminService,
} from "./adminService.js";

interface AdminRouteDependencies {
  auth: Pick<AdminAuthService, "requireAdmin">;
  responseHeaders?: OutgoingHttpHeaders;
  service: AdminService;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readInteger(value: string | null, field: string, minimum: number, maximum: number) {
  if (value === null || !/^\d+$/.test(value)) {
    throw new HttpRequestError(400, "invalid_query", `${field} is invalid`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new HttpRequestError(400, "invalid_query", `${field} is invalid`);
  }
  return parsed;
}

function readOptionalInteger(value: string | null, field: string, minimum: number, maximum: number) {
  return value === null || value === "" ? undefined : readInteger(value, field, minimum, maximum);
}

function readDate(value: string | null, field: string) {
  if (value === null || value === "") return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(new Date(`${value}T00:00:00Z`).getTime())) {
    throw new HttpRequestError(400, "invalid_query", `${field} is invalid`);
  }
  return value;
}

function readSearch(value: string | null) {
  const normalized = value?.normalize("NFKC").trim().replace(/\s+/gu, " ") ?? "";
  if (normalized.length > 100) throw new HttpRequestError(400, "invalid_query", "search is too long");
  return normalized || undefined;
}

function readPageOptions(searchParams: URLSearchParams) {
  return {
    page: readInteger(searchParams.get("page") ?? "1", "page", 1, Number.MAX_SAFE_INTEGER),
    limit: readInteger(searchParams.get("limit") ?? "25", "limit", 1, ADMIN_LIMITS.pageSize),
  };
}

function readPlayerListOptions(searchParams: URLSearchParams): AdminPlayerListOptions {
  const sort = searchParams.get("sort") ?? "createdAt";
  const direction = searchParams.get("direction") ?? "desc";
  if (!["createdAt", "gold", "level", "name", "silver"].includes(sort)) {
    throw new HttpRequestError(400, "invalid_query", "sort is invalid");
  }
  if (direction !== "asc" && direction !== "desc") {
    throw new HttpRequestError(400, "invalid_query", "direction is invalid");
  }
  return {
    ...readPageOptions(searchParams),
    search: readSearch(searchParams.get("search")),
    levelMin: readOptionalInteger(searchParams.get("levelMin"), "levelMin", 1, ADMIN_LIMITS.accountLevel),
    levelMax: readOptionalInteger(searchParams.get("levelMax"), "levelMax", 1, ADMIN_LIMITS.accountLevel),
    silverMin: readOptionalInteger(searchParams.get("silverMin"), "silverMin", 0, Number.MAX_SAFE_INTEGER),
    goldMin: readOptionalInteger(searchParams.get("goldMin"), "goldMin", 0, Number.MAX_SAFE_INTEGER),
    createdFrom: readDate(searchParams.get("createdFrom"), "createdFrom"),
    createdTo: readDate(searchParams.get("createdTo"), "createdTo"),
    sort: sort as AdminPlayerListOptions["sort"],
    direction,
  };
}

function readCardListOptions(searchParams: URLSearchParams): AdminCardListOptions {
  const sort = searchParams.get("sort") ?? "name";
  const direction = searchParams.get("direction") ?? "asc";
  const element = searchParams.get("element");
  const minRarity = searchParams.get("minRarity");
  const limited = searchParams.get("limited");
  if (!["code", "element", "name", "ownedCopies"].includes(sort)) {
    throw new HttpRequestError(400, "invalid_query", "sort is invalid");
  }
  if (direction !== "asc" && direction !== "desc") {
    throw new HttpRequestError(400, "invalid_query", "direction is invalid");
  }
  if (element && !CARD_ELEMENTS.includes(element as CardElement)) {
    throw new HttpRequestError(400, "invalid_query", "element is invalid");
  }
  if (minRarity && !CARD_RARITIES.includes(minRarity as CardRarity)) {
    throw new HttpRequestError(400, "invalid_query", "minRarity is invalid");
  }
  if (limited !== null && limited !== "true" && limited !== "false") {
    throw new HttpRequestError(400, "invalid_query", "limited is invalid");
  }
  const collectionId = searchParams.get("collectionId")?.trim() || undefined;
  if (collectionId && collectionId.length > 100) throw new HttpRequestError(400, "invalid_query", "collectionId is too long");
  return {
    ...readPageOptions(searchParams),
    search: readSearch(searchParams.get("search")),
    sort: sort as AdminCardListOptions["sort"],
    direction,
    element: element as CardElement | undefined,
    minRarity: minRarity as CardRarity | undefined,
    limited: limited === null ? undefined : limited === "true",
    collectionId,
  };
}

function readAuditOptions(searchParams: URLSearchParams): AdminAuditListOptions {
  const action = searchParams.get("action")?.trim() || undefined;
  const admin = readSearch(searchParams.get("admin"));
  const entityId = readSearch(searchParams.get("entityId"));
  const entityType = searchParams.get("entityType")?.trim() || undefined;
  if (action && action.length > 100) throw new HttpRequestError(400, "invalid_query", "action is too long");
  if (entityType && entityType.length > 50) throw new HttpRequestError(400, "invalid_query", "entityType is too long");
  return {
    ...readPageOptions(searchParams),
    action,
    admin,
    entityId,
    entityType,
    dateFrom: readDate(searchParams.get("dateFrom"), "dateFrom"),
    dateTo: readDate(searchParams.get("dateTo"), "dateTo"),
  };
}

function readPlayerId(value: string) {
  const playerId = decodePathSegment(value, "invalid_player_id", "Player ID is invalid");
  if (!UUID_PATTERN.test(playerId)) throw new HttpRequestError(400, "invalid_player_id", "Player ID is invalid");
  return playerId;
}

function readInstanceId(value: string) {
  const instanceId = decodePathSegment(value, "invalid_card_instance_id", "Card instance ID is invalid");
  if (!UUID_PATTERN.test(instanceId)) throw new HttpRequestError(400, "invalid_card_instance_id", "Card instance ID is invalid");
  return instanceId;
}

function decodePathSegment(value: string, code: string, message: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new HttpRequestError(400, code, message);
  }
}

function readCurrencyMutation(value: unknown) {
  if (!isRecord(value) || (value.currency !== "silver" && value.currency !== "gold") || !Number.isSafeInteger(value.delta) || Number(value.delta) === 0) {
    throw new HttpRequestError(400, "invalid_currency_change", "currency and a non-zero integer delta are required");
  }
  return { currency: value.currency as AdminCurrency, delta: Number(value.delta) };
}

function readLevelMutation(value: unknown) {
  if (!isRecord(value) || !Number.isSafeInteger(value.level)) {
    throw new HttpRequestError(400, "invalid_level", "level is required");
  }
  const level = Number(value.level);
  if (level < 1 || level > ADMIN_LIMITS.accountLevel) {
    throw new HttpRequestError(400, "invalid_level", `level must be between 1 and ${ADMIN_LIMITS.accountLevel}`);
  }
  return level;
}

function readCardGrant(value: unknown) {
  if (!isRecord(value) || typeof value.cardId !== "string" || !value.cardId.trim()) {
    throw new HttpRequestError(400, "invalid_card_grant", "cardId is required");
  }
  if (value.cardId.length > 100 || !Number.isSafeInteger(value.quantity) || !Number.isSafeInteger(value.level)) {
    throw new HttpRequestError(400, "invalid_card_grant", "quantity and level must be integers");
  }
  const quantity = Number(value.quantity);
  const level = Number(value.level);
  if (quantity < 1 || quantity > ADMIN_LIMITS.grantQuantity || level < 1 || level > ADMIN_LIMITS.cardLevel) {
    throw new HttpRequestError(400, "invalid_card_grant", "quantity or level is outside the allowed range");
  }
  return { cardId: value.cardId.trim(), quantity, level };
}

function sendAdminError(response: ServerResponse, error: unknown, headers: OutgoingHttpHeaders) {
  if (error instanceof HttpRequestError || error instanceof AdminDomainError) {
    sendJson(response, error.status, { error: { code: error.code, message: error.message } }, headers);
    return;
  }
  if (isAuthFailure(error)) {
    sendJson(response, 401, { error: { code: error.code, message: "Потрібна авторизація" } }, headers);
    return;
  }
  if (error instanceof AdminAccessDeniedError) {
    sendJson(response, 403, { error: { code: "admin_required", message: "Немає доступу до адмін-панелі" } }, headers);
    return;
  }
  if (error instanceof AdminPersistenceError) {
    console.error("Admin persistence request failed", error.cause);
    sendJson(response, 503, { error: { code: "admin_unavailable", message: "Адмін-сервіс тимчасово недоступний" } }, headers);
    return;
  }
  console.error("Unexpected admin request failure", error);
  sendJson(response, 500, { error: { code: "internal_error", message: "Неочікувана помилка сервера" } }, headers);
}

export async function handleAdminRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: AdminRouteDependencies,
) {
  const headers = dependencies.responseHeaders ?? {};
  try {
    const admin = await dependencies.auth.requireAdmin(request);
    const url = new URL(request.url ?? "/", "http://localhost");
    const pathname = url.pathname;

    if ((pathname === "/api/admin" || pathname === "/api/admin/session") && request.method === "GET") {
      sendJson(response, 200, { admin }, headers);
      return;
    }
    if (pathname === "/api/admin/dashboard" && request.method === "GET") {
      sendJson(response, 200, await dependencies.service.getDashboard(), headers);
      return;
    }
    if (pathname === "/api/admin/players" && request.method === "GET") {
      sendJson(response, 200, await dependencies.service.listPlayers(readPlayerListOptions(url.searchParams)), headers);
      return;
    }
    if (pathname === "/api/admin/cards" && request.method === "GET") {
      sendJson(response, 200, await dependencies.service.listCards(readCardListOptions(url.searchParams)), headers);
      return;
    }
    if (pathname === "/api/admin/audit" && request.method === "GET") {
      sendJson(response, 200, await dependencies.service.listAudit(readAuditOptions(url.searchParams)), headers);
      return;
    }

    const currencyMatch = pathname.match(/^\/api\/admin\/players\/([^/]+)\/currency$/);
    if (currencyMatch && request.method === "POST") {
      const body = readCurrencyMutation(await readJsonBody(request));
      sendJson(response, 200, await dependencies.service.adjustCurrency(admin, readPlayerId(currencyMatch[1]!), body.currency, body.delta), headers);
      return;
    }
    const levelMatch = pathname.match(/^\/api\/admin\/players\/([^/]+)\/level$/);
    if (levelMatch && request.method === "PATCH") {
      const level = readLevelMutation(await readJsonBody(request));
      sendJson(response, 200, await dependencies.service.changeLevel(admin, readPlayerId(levelMatch[1]!), level), headers);
      return;
    }
    const removeCardMatch = pathname.match(/^\/api\/admin\/players\/([^/]+)\/cards\/([^/]+)$/);
    if (removeCardMatch && request.method === "DELETE") {
      sendJson(response, 200, await dependencies.service.removeCard(
        admin,
        readPlayerId(removeCardMatch[1]!),
        readInstanceId(removeCardMatch[2]!),
      ), headers);
      return;
    }
    const grantCardMatch = pathname.match(/^\/api\/admin\/players\/([^/]+)\/cards$/);
    if (grantCardMatch && request.method === "POST") {
      const body = readCardGrant(await readJsonBody(request));
      sendJson(response, 200, await dependencies.service.grantCards(
        admin,
        readPlayerId(grantCardMatch[1]!),
        body.cardId,
        body.quantity,
        body.level,
      ), headers);
      return;
    }
    const playerMatch = pathname.match(/^\/api\/admin\/players\/([^/]+)$/);
    if (playerMatch && request.method === "GET") {
      const { page, limit } = readPageOptions(new URLSearchParams({
        page: url.searchParams.get("cardPage") ?? "1",
        limit: url.searchParams.get("cardLimit") ?? "25",
      }));
      sendJson(response, 200, await dependencies.service.getPlayer(readPlayerId(playerMatch[1]!), page, limit), headers);
      return;
    }

    sendJson(response, 404, { error: { code: "not_found", message: "Admin route not found" } }, headers);
  } catch (error) {
    sendAdminError(response, error, headers);
  }
}
