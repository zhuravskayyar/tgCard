import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import {
  GUILD_CONFIG,
  type CreateGuildRequest,
  type GuildRaidActionRequest,
  type GuildLanguage,
  type GuildRecruitmentMode,
  type GuildRole,
  type UpdateGuildSettingsRequest,
} from "@cardastika/shared";
import { authenticateRoutePlayer, isAuthFailure, type RouteAuthDependencies } from "../auth/routeAuth.js";
import { HttpRequestError, readJsonBody, sendJson } from "../http/json.js";
import { GuildDomainError, GuildPersistenceError, GuildService } from "./guildService.js";
import { GuildForumService } from "./guildForumService.js";
import { GuildAltarDomainError, GuildAltarPersistenceError } from "./altarService.js";
import { GuildTreasuryDomainError, GuildTreasuryPersistenceError } from "./treasuryService.js";
import { GuildRaidDomainError, GuildRaidPersistenceError, GuildRaidService } from "./guildRaidService.js";

interface GuildRouteDependencies extends RouteAuthDependencies {
  forum: GuildForumService;
  guilds: GuildService;
  raids: GuildRaidService;
  responseHeaders?: OutgoingHttpHeaders;
}

const GUILD_LANGUAGES = new Set<GuildLanguage>(["uk", "ru", "en", "de", "other"]);
const RECRUITMENT_MODES = new Set<GuildRecruitmentMode>(["open", "application", "closed"]);
const GUILD_ROLES = new Set<GuildRole>(["leader", "officer", "veteran", "member", "newbie"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isCreateRequest(value: unknown): value is CreateGuildRequest {
  if (!isRecord(value) || typeof value.name !== "string") return false;
  if (value.description !== undefined && typeof value.description !== "string") return false;
  if (value.emblemId !== undefined && typeof value.emblemId !== "string") return false;
  if (value.language !== undefined && (typeof value.language !== "string" || !GUILD_LANGUAGES.has(value.language as GuildLanguage))) return false;
  if (value.minPlayerLevel !== undefined && !Number.isSafeInteger(value.minPlayerLevel)) return false;
  if (value.recruitmentMode !== undefined && (typeof value.recruitmentMode !== "string" || !RECRUITMENT_MODES.has(value.recruitmentMode as GuildRecruitmentMode))) return false;
  if (value.themeElement !== undefined && value.themeElement !== null && typeof value.themeElement !== "string") return false;
  return true;
}

function isSettingsRequest(value: unknown): value is UpdateGuildSettingsRequest {
  return isRecord(value) && (
    value.description === undefined || typeof value.description === "string"
  ) && (
    value.emblemId === undefined || typeof value.emblemId === "string"
  ) && (
    value.language === undefined || (typeof value.language === "string" && GUILD_LANGUAGES.has(value.language as GuildLanguage))
  ) && (
    value.minPlayerLevel === undefined || Number.isSafeInteger(value.minPlayerLevel)
  ) && (
    value.recruitmentMode === undefined || (typeof value.recruitmentMode === "string" && RECRUITMENT_MODES.has(value.recruitmentMode as GuildRecruitmentMode))
  ) && (
    value.themeElement === undefined || value.themeElement === null || typeof value.themeElement === "string"
  );
}

function isGuildCardRequest(value: unknown): value is { instanceId: string } {
  return isRecord(value) && typeof value.instanceId === "string" && value.instanceId.trim().length > 0;
}

function isRaidActionRequest(value: unknown): value is GuildRaidActionRequest {
  if (!isRecord(value)) return false;
  return Number.isSafeInteger(value.expectedVersion)
    && Number(value.expectedVersion) >= 1
    && (value.bossSlot === 1 || value.bossSlot === 2)
    && (value.slotIndex === 0 || value.slotIndex === 1 || value.slotIndex === 2);
}

function isAltarUpgradeRequest(value: unknown): value is { currency: "gold" | "silver" } {
  return isRecord(value) && (value.currency === "gold" || value.currency === "silver");
}

function isTreasuryCurrencyRequest(value: unknown): value is { currency: "gold" | "silver"; amount: number } {
  return isRecord(value)
    && (value.currency === "gold" || value.currency === "silver")
    && typeof value.amount === "number"
    && Number.isSafeInteger(value.amount)
    && value.amount > 0;
}

function isTreasuryCardsRequest(value: unknown): value is { fodderInstanceIds: string[] } {
  return isRecord(value)
    && Array.isArray(value.fodderInstanceIds)
    && value.fodderInstanceIds.length > 0
    && value.fodderInstanceIds.length <= 100
    && value.fodderInstanceIds.every((id): id is string => typeof id === "string" && id.length > 0)
    && new Set(value.fodderInstanceIds).size === value.fodderInstanceIds.length;
}

function readPathParts(pathname: string) {
  return pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
}

function readBoolean(value: string | null) {
  if (value === null) return undefined;
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  throw new HttpRequestError(400, "invalid_boolean_filter", "Boolean filters must be true or false");
}

function readOptionalInteger(value: string | null, name: string) {
  if (value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new HttpRequestError(400, `invalid_${name}`, `${name} must be an integer`);
  return parsed;
}

function readOptionalBoolean(value: unknown) {
  return value === undefined ? undefined : typeof value === "boolean" ? value : null;
}

function sendGuildError(response: ServerResponse, error: unknown, headers: OutgoingHttpHeaders) {
  if (error instanceof HttpRequestError) {
    sendJson(response, error.status, { error: { code: error.code, message: error.message } }, headers);
    return true;
  }
  if (isAuthFailure(error)) {
    sendJson(response, 401, { error: { code: error.code, message: "Telegram authentication failed" } }, headers);
    return true;
  }
  if (error instanceof GuildDomainError) {
    sendJson(response, error.status, { error: { code: error.code, message: error.message, ...(error.retryAt ? { retryAt: error.retryAt } : {}) } }, headers);
    return true;
  }
  if (error instanceof GuildAltarDomainError) {
    sendJson(response, error.status, { error: { code: error.code, message: error.message } }, headers);
    return true;
  }
  if (error instanceof GuildAltarPersistenceError) {
    console.error("Database unavailable during altar request", error);
    sendJson(response, 503, { error: { code: "database_unavailable", message: "Guild service is unavailable" } }, headers);
    return true;
  }
  if (error instanceof GuildTreasuryDomainError) {
    sendJson(response, error.status, { error: { code: error.code, message: error.message, ...(error.retryAt ? { retryAt: error.retryAt } : {}) } }, headers);
    return true;
  }
  if (error instanceof GuildTreasuryPersistenceError) {
    console.error("Database unavailable during guild treasury request", error);
    sendJson(response, 503, { error: { code: "database_unavailable", message: "Guild service is unavailable" } }, headers);
    return true;
  }
  if (error instanceof GuildRaidDomainError) {
    sendJson(response, error.status, { error: { code: error.code, message: error.message } }, headers);
    return true;
  }
  if (error instanceof GuildRaidPersistenceError) {
    console.error("Database unavailable during guild raid request", error);
    sendJson(response, 503, { error: { code: "database_unavailable", message: "Guild service is unavailable" } }, headers);
    return true;
  }
  if (error instanceof GuildPersistenceError) {
    console.error("Database unavailable during guild request", error);
    sendJson(response, 503, { error: { code: "database_unavailable", message: "Guild service is unavailable" } }, headers);
    return true;
  }
  return false;
}

export async function handleGuildRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: GuildRouteDependencies,
) {
  const headers = dependencies.responseHeaders ?? {};
  const url = new URL(request.url ?? "/api/guilds", "http://localhost");
  const guildPathPrefix = "/api/guilds";
  const parts = readPathParts(url.pathname.startsWith(guildPathPrefix) ? url.pathname.slice(guildPathPrefix.length) : url.pathname);

  try {
    const { player } = await authenticateRoutePlayer(request, dependencies);
    if (request.method === "GET" && parts.length === 1 && parts[0] === "mine") {
      sendJson(response, 200, await dependencies.guilds.mine(player.id), headers);
      return;
    }
    if (request.method === "GET" && parts.length === 0) {
      const language = url.searchParams.get("language");
      if (language !== null && !GUILD_LANGUAGES.has(language as GuildLanguage)) throw new HttpRequestError(400, "invalid_language_filter", "Language filter is invalid");
      sendJson(response, 200, await dependencies.guilds.list({
        hasSpace: readBoolean(url.searchParams.get("hasSpace")),
        language: language as GuildLanguage | undefined,
        minLevel: readOptionalInteger(url.searchParams.get("minLevel"), "min_level"),
        name: url.searchParams.get("name") ?? undefined,
        open: readBoolean(url.searchParams.get("open")),
        page: readOptionalInteger(url.searchParams.get("page"), "page"),
      }), headers);
      return;
    }
    if (request.method === "POST" && parts.length === 0) {
      const body = await readJsonBody(request);
      if (!isCreateRequest(body)) throw new HttpRequestError(400, "invalid_guild_create", "Guild name is required");
      sendJson(response, 201, await dependencies.guilds.create(player.id, body), headers);
      return;
    }
    if (parts.length === 3 && parts[0] === "applications" && parts[2] === "withdraw" && request.method === "DELETE") {
      sendJson(response, 200, await dependencies.guilds.withdrawApplication(player.id, parts[1]!), headers);
      return;
    }
    const guildId = parts[0];
    if (!guildId) throw new HttpRequestError(404, "guild_not_found", "Guild does not exist");
    if (parts.length === 2 && parts[1] === "forum" && request.method === "GET") {
      sendJson(response, 200, await dependencies.forum.index(player.id, guildId), headers);
      return;
    }
    if (parts.length === 4 && parts[1] === "forum" && parts[2] === "sections" && request.method === "GET") {
      sendJson(response, 200, await dependencies.forum.section(player.id, guildId, parts[3]!, readOptionalInteger(url.searchParams.get("page"), "page")), headers);
      return;
    }
    if (parts.length === 4 && parts[1] === "forum" && parts[2] === "topics" && request.method === "GET") {
      sendJson(response, 200, await dependencies.forum.topic(player.id, guildId, parts[3]!, readOptionalInteger(url.searchParams.get("page"), "page")), headers);
      return;
    }
    if (parts.length === 3 && parts[1] === "forum" && parts[2] === "topics" && request.method === "POST") {
      const body = await readJsonBody(request);
      if (!isRecord(body) || typeof body.sectionId !== "string" || typeof body.title !== "string" || typeof body.body !== "string") {
        throw new HttpRequestError(400, "invalid_forum_topic", "Forum section, title and body are required");
      }
      sendJson(response, 201, await dependencies.forum.createTopic(player.id, guildId, body.sectionId, body.title, body.body), headers);
      return;
    }
    if (parts.length === 5 && parts[1] === "forum" && parts[2] === "topics" && parts[4] === "posts" && request.method === "POST") {
      const body = await readJsonBody(request);
      if (!isRecord(body) || typeof body.body !== "string") throw new HttpRequestError(400, "invalid_forum_post", "Forum post body is required");
      sendJson(response, 201, await dependencies.forum.createPost(player.id, guildId, parts[3]!, body.body), headers);
      return;
    }
    if (parts.length === 5 && parts[1] === "forum" && parts[2] === "topics" && parts[4] === "read" && request.method === "POST") {
      sendJson(response, 200, await dependencies.forum.markRead(player.id, guildId, parts[3]!), headers);
      return;
    }
    if (request.method === "GET" && parts.length === 2 && parts[1] === "guild-card") {
      sendJson(response, 200, await dependencies.guilds.getGuildCard(player.id, guildId), headers);
      return;
    }
    if (request.method === "GET" && parts.length === 2 && parts[1] === "treasury") {
      sendJson(response, 200, await dependencies.guilds.getGuildTreasury(player.id, guildId), headers);
      return;
    }
    if (request.method === "GET" && parts.length === 3 && parts[1] === "treasury" && parts[2] === "card-candidates") {
      sendJson(response, 200, await dependencies.guilds.getGuildTreasuryCardCandidates(player.id, guildId), headers);
      return;
    }
    if (request.method === "POST" && parts.length === 3 && parts[1] === "treasury" && parts[2] === "donate") {
      const body = await readJsonBody(request);
      if (!isTreasuryCurrencyRequest(body)) throw new HttpRequestError(400, "invalid_treasury_donation", "Currency and a positive integer amount are required");
      sendJson(response, 200, await dependencies.guilds.donateGuildTreasuryCurrency(player.id, guildId, body.currency, body.amount), headers);
      return;
    }
    if (request.method === "POST" && parts.length === 3 && parts[1] === "treasury" && parts[2] === "card-elements") {
      const body = await readJsonBody(request);
      if (!isTreasuryCardsRequest(body)) throw new HttpRequestError(400, "invalid_treasury_cards", "At least one unique card instance is required");
      sendJson(response, 200, await dependencies.guilds.donateGuildCardElements(player.id, guildId, body.fodderInstanceIds), headers);
      return;
    }
    if (request.method === "GET" && parts.length === 2 && parts[1] === "raid") {
      sendJson(response, 200, await dependencies.raids.getActiveRaid(guildId, player.id), headers);
      return;
    }
    if (request.method === "POST" && parts.length === 3 && parts[1] === "raid" && parts[2] === "enroll") {
      sendJson(response, 200, await dependencies.raids.enroll(player.id, guildId), headers);
      return;
    }
    if (request.method === "DELETE" && parts.length === 3 && parts[1] === "raid" && parts[2] === "enroll") {
      sendJson(response, 200, await dependencies.raids.leave(player.id, guildId), headers);
      return;
    }
    if (request.method === "POST" && parts.length === 3 && parts[1] === "raid" && parts[2] === "start") {
      sendJson(response, 200, await dependencies.raids.startRaid(player.id, guildId), headers);
      return;
    }
    if (request.method === "POST" && parts.length === 3 && parts[1] === "raid" && parts[2] === "battle") {
      sendJson(response, 201, await dependencies.raids.startBattle(player.id, guildId), headers);
      return;
    }
    if (request.method === "POST" && parts.length === 5 && parts[1] === "raid" && parts[2] === "battle" && parts[4] === "action") {
      const body = await readJsonBody(request);
      if (!isRaidActionRequest(body)) throw new HttpRequestError(400, "invalid_raid_action", "bossSlot, slotIndex and expectedVersion are required");
      sendJson(response, 200, await dependencies.raids.action(player.id, guildId, parts[3]!, body), headers);
      return;
    }
    if (request.method === "GET" && parts.length === 3 && parts[1] === "guild-card" && parts[2] === "eligible") {
      sendJson(response, 200, await dependencies.guilds.getGuildCardCandidates(player.id, guildId), headers);
      return;
    }
    if (request.method === "POST" && parts.length === 3 && parts[1] === "altar" && parts[2] === "upgrade") {
      const body = await readJsonBody(request);
      if (!isAltarUpgradeRequest(body)) throw new HttpRequestError(400, "invalid_altar_upgrade", "Altar currency must be gold or silver");
      sendJson(response, 200, await dependencies.guilds.purchaseAltarUpgrade(player.id, guildId, body.currency), headers);
      return;
    }
    if (request.method === "PATCH" && parts.length === 2 && parts[1] === "guild-card") {
      const body = await readJsonBody(request);
      if (!isGuildCardRequest(body)) throw new HttpRequestError(400, "invalid_guild_card", "A card instance is required");
      sendJson(response, 200, await dependencies.guilds.setGuildCard(player.id, guildId, body.instanceId.trim()), headers);
      return;
    }
    if (parts.length === 4 && parts[1] === "forum" && parts[2] === "topics" && request.method === "PATCH") {
      const body = await readJsonBody(request);
      if (!isRecord(body)) throw new HttpRequestError(400, "invalid_forum_state", "Forum state is invalid");
      const pinned = readOptionalBoolean(body.pinned);
      const locked = readOptionalBoolean(body.locked);
      if (pinned === null || locked === null) throw new HttpRequestError(400, "invalid_forum_state", "Pinned and locked must be boolean");
      sendJson(response, 200, await dependencies.forum.setTopicState(player.id, guildId, parts[3]!, pinned, locked), headers);
      return;
    }
    if (request.method === "GET" && parts.length === 1) {
      sendJson(response, 200, await dependencies.guilds.getProfile(player.id, guildId), headers);
      return;
    }
    if (request.method === "PATCH" && parts.length === 2 && parts[1] === "announcement") {
      const body = await readJsonBody(request);
      if (!isRecord(body) || typeof body.body !== "string") throw new HttpRequestError(400, "invalid_announcement", "Announcement body is required");
      sendJson(response, 200, await dependencies.guilds.updateAnnouncement(player.id, guildId, body.body), headers);
      return;
    }
    if (request.method === "PATCH" && parts.length === 2 && parts[1] === "settings") {
      const body = await readJsonBody(request);
      if (!isSettingsRequest(body)) throw new HttpRequestError(400, "invalid_guild_settings", "Guild settings are invalid");
      sendJson(response, 200, await dependencies.guilds.updateSettings(player.id, guildId, body), headers);
      return;
    }
    if (request.method === "POST" && parts.length === 2 && parts[1] === "join") {
      sendJson(response, 200, await dependencies.guilds.join(player.id, guildId), headers);
      return;
    }
    if (request.method === "POST" && parts.length === 2 && parts[1] === "apply") {
      const body = await readJsonBody(request);
      if (!isRecord(body) || (body.message !== undefined && typeof body.message !== "string")) throw new HttpRequestError(400, "invalid_guild_application", "Application message is invalid");
      sendJson(response, 201, await dependencies.guilds.apply(player.id, guildId, typeof body.message === "string" ? body.message : ""), headers);
      return;
    }
    if (request.method === "GET" && parts.length === 2 && parts[1] === "applications") {
      sendJson(response, 200, await dependencies.guilds.applications(player.id, guildId), headers);
      return;
    }
    if (request.method === "POST" && parts.length === 4 && parts[1] === "applications" && (parts[3] === "accept" || parts[3] === "reject")) {
      sendJson(response, 200, await dependencies.guilds.decideApplication(player.id, guildId, parts[2]!, parts[3]), headers);
      return;
    }
    if (request.method === "PATCH" && parts.length === 4 && parts[1] === "members" && parts[3] === "role") {
      const body = await readJsonBody(request);
      if (!isRecord(body) || typeof body.role !== "string" || !GUILD_ROLES.has(body.role as GuildRole)) throw new HttpRequestError(400, "invalid_guild_role", "Guild role is invalid");
      sendJson(response, 200, await dependencies.guilds.changeRole(player.id, guildId, parts[2]!, body.role as GuildRole), headers);
      return;
    }
    if (request.method === "POST" && parts.length === 4 && parts[1] === "members" && parts[3] === "kick") {
      sendJson(response, 200, await dependencies.guilds.kick(player.id, guildId, parts[2]!), headers);
      return;
    }
    if (request.method === "POST" && parts.length === 2 && parts[1] === "transfer-leadership") {
      const body = await readJsonBody(request);
      if (!isRecord(body) || typeof body.playerId !== "string" || !body.playerId.trim()) throw new HttpRequestError(400, "invalid_leadership_transfer", "playerId is required");
      sendJson(response, 200, await dependencies.guilds.transferLeadership(player.id, guildId, body.playerId), headers);
      return;
    }
    if (request.method === "POST" && parts.length === 2 && parts[1] === "leave") {
      sendJson(response, 200, await dependencies.guilds.leave(player.id, guildId), headers);
      return;
    }
    if (request.method === "POST" && parts.length === 2 && parts[1] === "dissolve") {
      sendJson(response, 200, await dependencies.guilds.dissolve(player.id, guildId), headers);
      return;
    }
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, headers);
  } catch (error) {
    if (sendGuildError(response, error, headers)) return;
    console.error("Unexpected guild request failure", error);
    sendJson(response, 500, { error: { code: "internal_error", message: "Unexpected server failure" } }, headers);
  }
}

export const guildApiConfig = {
  maxMembers: GUILD_CONFIG.maxMembersByLevel[0],
  pageSize: GUILD_CONFIG.pageSize,
};
