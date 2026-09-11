import type {
  AdminAuditResponse,
  AdminCardGrantResponse,
  AdminCardRemoveResponse,
  AdminCardsResponse,
  AdminCurrency,
  AdminDashboardResponse,
  AdminPlayerDetailResponse,
  AdminPlayerMutationResponse,
  AdminPlayersResponse,
  AdminSessionResponse,
} from "@cardastika/shared";
import { getApiEndpoint } from "../api/config";
import { getPlayerAuthHeader, getTelegramInitData } from "../telegram";

export class AdminApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

type QueryValue = boolean | number | string | null | undefined;

function withQuery(path: string, query?: Record<string, QueryValue>) {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const suffix = params.toString();
  return suffix ? `${path}?${suffix}` : path;
}

async function adminRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const credential = getTelegramInitData();
  if (!credential) throw new AdminApiError(401, "authentication_required", "Потрібна авторизація");
  const response = await fetch(getApiEndpoint(path), {
    ...options,
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      Authorization: getPlayerAuthHeader(credential),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
  if (!response.ok) {
    throw new AdminApiError(
      response.status,
      payload?.error?.code ?? "admin_request_failed",
      payload?.error?.message ?? "Не вдалося виконати запит",
    );
  }
  return payload as T;
}

export function loadAdminSession(signal?: AbortSignal) {
  return adminRequest<AdminSessionResponse>("/api/admin/session", { signal });
}

export function loadAdminDashboard(signal?: AbortSignal) {
  return adminRequest<AdminDashboardResponse>("/api/admin/dashboard", { signal });
}

export function loadAdminPlayers(query: Record<string, QueryValue>, signal?: AbortSignal) {
  return adminRequest<AdminPlayersResponse>(withQuery("/api/admin/players", query), { signal });
}

export function loadAdminPlayer(playerId: string, cardPage: number, signal?: AbortSignal) {
  return adminRequest<AdminPlayerDetailResponse>(withQuery(`/api/admin/players/${encodeURIComponent(playerId)}`, {
    cardPage,
    cardLimit: 25,
  }), { signal });
}

export function changeAdminPlayerCurrency(playerId: string, currency: AdminCurrency, delta: number) {
  return adminRequest<AdminPlayerMutationResponse>(`/api/admin/players/${encodeURIComponent(playerId)}/currency`, {
    method: "POST",
    body: JSON.stringify({ currency, delta }),
  });
}

export function changeAdminPlayerLevel(playerId: string, level: number) {
  return adminRequest<AdminPlayerMutationResponse>(`/api/admin/players/${encodeURIComponent(playerId)}/level`, {
    method: "PATCH",
    body: JSON.stringify({ level }),
  });
}

export function grantAdminPlayerCards(playerId: string, cardId: string, quantity: number, level: number) {
  return adminRequest<AdminCardGrantResponse>(`/api/admin/players/${encodeURIComponent(playerId)}/cards`, {
    method: "POST",
    body: JSON.stringify({ cardId, quantity, level }),
  });
}

export function removeAdminPlayerCard(playerId: string, instanceId: string) {
  return adminRequest<AdminCardRemoveResponse>(
    `/api/admin/players/${encodeURIComponent(playerId)}/cards/${encodeURIComponent(instanceId)}`,
    { method: "DELETE" },
  );
}

export function loadAdminCards(query: Record<string, QueryValue>, signal?: AbortSignal) {
  return adminRequest<AdminCardsResponse>(withQuery("/api/admin/cards", query), { signal });
}

export function loadAdminAudit(query: Record<string, QueryValue>, signal?: AbortSignal) {
  return adminRequest<AdminAuditResponse>(withQuery("/api/admin/audit", query), { signal });
}
