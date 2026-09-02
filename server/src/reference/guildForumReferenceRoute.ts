import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import { sendJson } from "../http/json.js";
import {
  GuildForumReferenceUnavailableError,
  type GuildForumReferenceService,
  type ReferenceCrawlScope,
} from "./guildForumReferenceService.js";

interface GuildForumReferenceRouteDependencies {
  reference: Pick<GuildForumReferenceService, "get">;
  responseHeaders?: OutgoingHttpHeaders;
}

export async function handleGuildForumReference(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: GuildForumReferenceRouteDependencies,
) {
  const headers = dependencies.responseHeaders ?? {};
  if (request.method !== "GET") {
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, headers);
    return;
  }

  try {
    const url = new URL(request.url ?? "/api/reference/guild-forum", "http://localhost");
    const scope: ReferenceCrawlScope = url.searchParams.get("scope") === "full" ? "full" : "curated";
    const maxPages = readBoundedInteger(url.searchParams.get("maxPages"), 1, 1000);
    const maxDepth = readBoundedInteger(url.searchParams.get("maxDepth"), 0, 10);
    sendJson(response, 200, await dependencies.reference.get({ scope, ...(maxPages === null ? {} : { maxPages }), ...(maxDepth === null ? {} : { maxDepth }) }), headers);
  } catch (error) {
    if (error instanceof GuildForumReferenceUnavailableError) {
      sendJson(response, 503, { error: { code: "guild_forum_reference_unavailable", message: error.message } }, headers);
      return;
    }
    console.error("Unexpected guild/forum reference request failure", error);
    sendJson(response, 500, { error: { code: "internal_error", message: "Unexpected server failure" } }, headers);
  }
}

function readBoundedInteger(value: string | null, minimum: number, maximum: number) {
  if (value === null || !/^\d+$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}
