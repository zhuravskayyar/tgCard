import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import type { PlayerMailAction, PlayerMailActionResponse, PlayerMailClaimResponse, PlayerMailResponse } from "@cardastika/shared";
import { authenticateRoutePlayer, isAuthFailure, type RouteAuthDependencies } from "../auth/routeAuth.js";
import { HttpRequestError, readJsonBody, sendJson } from "../http/json.js";
import { PlayerPersistenceError } from "../users/playerRepository.js";
import { MailMessageNotFoundError, MailPersistenceError, type MailService } from "./mailService.js";

interface MailRouteDependencies extends RouteAuthDependencies {
  mail: Pick<MailService, "claim" | "getInbox" | "resolveAction">;
  responseHeaders?: OutgoingHttpHeaders;
}

async function authenticatePlayer(request: IncomingMessage, dependencies: MailRouteDependencies) {
  return (await authenticateRoutePlayer(request, dependencies)).player;
}

function sendMailError(response: ServerResponse, error: unknown, headers: OutgoingHttpHeaders) {
  if (error instanceof HttpRequestError) {
    sendJson(response, error.status, { error: { code: error.code, message: error.message } }, headers);
    return;
  }
  if (isAuthFailure(error)) {
    sendJson(response, 401, { error: { code: error.code, message: "Telegram authentication failed" } }, headers);
    return;
  }
  if (error instanceof MailMessageNotFoundError) {
    sendJson(response, 404, { error: { code: "mail_not_found", message: "Mail message does not exist" } }, headers);
    return;
  }
  if (error instanceof PlayerPersistenceError || error instanceof MailPersistenceError) {
    console.error("Database unavailable during mail request");
    sendJson(response, 503, { error: { code: "database_unavailable", message: "Mail service is unavailable" } }, headers);
    return;
  }
  console.error("Unexpected mail failure");
  sendJson(response, 500, { error: { code: "internal_error", message: "Unexpected server failure" } }, headers);
}

function readMailAction(body: unknown): PlayerMailAction {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpRequestError(400, "invalid_mail_action", "action is required");
  }
  const action = (body as { action?: unknown }).action;
  if (action !== "change" && action !== "leave") {
    throw new HttpRequestError(400, "invalid_mail_action", "action must be change or leave");
  }
  return action;
}

export async function handlePlayerMail(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: MailRouteDependencies,
) {
  const responseHeaders = dependencies.responseHeaders ?? {};
  if (request.method !== "GET") {
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, responseHeaders);
    return;
  }

  try {
    const player = await authenticatePlayer(request, dependencies);
    const result: PlayerMailResponse = await dependencies.mail.getInbox(player.id);
    sendJson(response, 200, result, responseHeaders);
  } catch (error) {
    sendMailError(response, error, responseHeaders);
  }
}

export async function handleMailClaim(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: MailRouteDependencies,
  messageId: string,
) {
  const responseHeaders = dependencies.responseHeaders ?? {};
  if (request.method !== "POST") {
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, responseHeaders);
    return;
  }

  try {
    const player = await authenticatePlayer(request, dependencies);
    const result: PlayerMailClaimResponse = await dependencies.mail.claim(player.id, messageId);
    sendJson(response, 200, result, responseHeaders);
  } catch (error) {
    sendMailError(response, error, responseHeaders);
  }
}

export async function handleMailAction(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: MailRouteDependencies,
  messageId: string,
) {
  const responseHeaders = dependencies.responseHeaders ?? {};
  if (request.method !== "POST") {
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, responseHeaders);
    return;
  }

  try {
    const player = await authenticatePlayer(request, dependencies);
    const action = readMailAction(await readJsonBody(request));
    const result: PlayerMailActionResponse = await dependencies.mail.resolveAction(player.id, messageId, action);
    sendJson(response, 200, result, responseHeaders);
  } catch (error) {
    sendMailError(response, error, responseHeaders);
  }
}
