import type { PlayerMailAction, PlayerMailActionResponse, PlayerMailCardReward, PlayerMailClaimResponse, PlayerMailMessage, PlayerMailResponse } from "@cardastika/shared";
import { getApiEndpoint } from "../api/config";
import { getPlayerAuthHeader } from "./index";

export class MailApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super("Mail request failed");
    this.name = "MailApiError";
  }
}

function isNonNegativeInteger(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isMailCardReward(value: unknown): value is PlayerMailCardReward {
  if (!value || typeof value !== "object") return false;
  const card = value as Record<string, unknown>;
  return typeof card.cardId === "string"
    && typeof card.code === "string"
    && (card.artKey === null || typeof card.artKey === "string")
    && (card.displayName === null || typeof card.displayName === "string")
    && (card.element === "fire" || card.element === "water" || card.element === "air" || card.element === "earth")
    && isNonNegativeInteger(card.level)
    && Number(card.level) > 0;
}

function isMailMessage(value: unknown): value is PlayerMailMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return (
    typeof message.id === "string" &&
    (message.actionType === "none" || message.actionType === "nickname_change") &&
    (message.actionCompletedAt === null || typeof message.actionCompletedAt === "string") &&
    typeof message.subject === "string" &&
    typeof message.body === "string" &&
    typeof message.createdAt === "string" &&
    (message.claimedAt === null || typeof message.claimedAt === "string") &&
    isNonNegativeInteger(message.silver) &&
    isNonNegativeInteger(message.gold) &&
    (message.cardReward === null || isMailCardReward(message.cardReward))
  );
}

function parseInbox(value: unknown): PlayerMailResponse {
  if (!value || typeof value !== "object") throw new MailApiError(502, "invalid_response");
  const inbox = value as Partial<PlayerMailResponse>;
  const messages = inbox.messages;
  const unreadCount = inbox.unreadCount;
  if (!Array.isArray(messages) || !messages.every(isMailMessage) || !isNonNegativeInteger(unreadCount) || typeof unreadCount !== "number") {
    throw new MailApiError(502, "invalid_response");
  }
  return { messages, unreadCount };
}

function parseClaim(value: unknown): PlayerMailClaimResponse {
  if (!value || typeof value !== "object") throw new MailApiError(502, "invalid_response");
  const claim = value as Partial<PlayerMailClaimResponse>;
  if (
    typeof claim.messageId !== "string" ||
    typeof claim.claimed !== "boolean" ||
    typeof claim.claimedAt !== "string" ||
    !claim.updatedBalance ||
    !isNonNegativeInteger(claim.updatedBalance.silver) ||
    !isNonNegativeInteger(claim.updatedBalance.gold)
  ) {
    throw new MailApiError(502, "invalid_response");
  }
  return claim as PlayerMailClaimResponse;
}

async function parseError(response: Response): Promise<never> {
  let code = "mail_request_failed";
  try {
    const body = await response.json() as { error?: { code?: unknown } };
    if (typeof body.error?.code === "string") code = body.error.code;
  } catch {
    // Status still carries the authoritative failure when the body is malformed.
  }
  throw new MailApiError(response.status, code);
}

export async function loadPlayerMail(initData: string, signal: AbortSignal) {
  const response = await fetch(getApiEndpoint("/api/player/mail"), {
    headers: { Authorization: getPlayerAuthHeader(initData) },
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) return parseError(response);
  return parseInbox(await response.json());
}

export async function claimPlayerMail(initData: string, messageId: string, signal: AbortSignal) {
  const response = await fetch(getApiEndpoint(`/api/player/mail/${encodeURIComponent(messageId)}/claim`), {
    method: "POST",
    headers: { Authorization: getPlayerAuthHeader(initData) },
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) return parseError(response);
  return parseClaim(await response.json());
}

function parseAction(value: unknown): PlayerMailActionResponse {
  if (!value || typeof value !== "object") throw new MailApiError(502, "invalid_response");
  const action = value as Partial<PlayerMailActionResponse>;
  if (
    (action.action !== "change" && action.action !== "leave") ||
    typeof action.actionCompletedAt !== "string" ||
    typeof action.messageId !== "string"
  ) {
    throw new MailApiError(502, "invalid_response");
  }
  return action as PlayerMailActionResponse;
}

export async function resolvePlayerMailAction(initData: string, messageId: string, action: PlayerMailAction, signal: AbortSignal) {
  const response = await fetch(getApiEndpoint(`/api/player/mail/${encodeURIComponent(messageId)}/action`), {
    method: "POST",
    headers: { Authorization: getPlayerAuthHeader(initData), "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) return parseError(response);
  return parseAction(await response.json());
}
