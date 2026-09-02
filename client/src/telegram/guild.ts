import type {
  CreateGuildRequest,
  GuildCardCandidatesResponse,
  GuildCardView,
  GuildAltarCurrency,
  GuildAltarUpgradeResponse,
  GuildListResponse,
  GuildMineResponse,
  GuildForumIndexResponse,
  GuildForumSectionResponse,
  GuildForumTopicResponse,
  GuildProfileResponse,
  GuildTreasuryCardCandidatesResponse,
  GuildTreasuryCurrency,
  GuildRaidActionRequest,
  GuildRaidView,
  GuildRole,
  UpdateGuildSettingsRequest,
} from "@cardastika/shared";
import { getApiEndpoint } from "../api/config";
import { getTelegramInitData, getPlayerAuthHeader } from "./index";

export class GuildApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly retryAt?: string,
  ) {
    super("Guild request failed");
    this.name = "GuildApiError";
  }
}

async function request<T>(path: string, options: { body?: unknown; method?: "DELETE" | "GET" | "PATCH" | "POST" } = {}) {
  const credential = getTelegramInitData();
  if (!credential) throw new GuildApiError(401, "authentication_required");
  const response = await fetch(getApiEndpoint(path), {
    method: options.method ?? "GET",
    headers: {
      Authorization: getPlayerAuthHeader(credential),
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { code?: unknown; retryAt?: unknown } } | null;
    const retryAt = typeof body?.error?.retryAt === "string" && Number.isFinite(Date.parse(body.error.retryAt)) ? body.error.retryAt : undefined;
    throw new GuildApiError(response.status, typeof body?.error?.code === "string" ? body.error.code : "guild_request_failed", retryAt);
  }
  return response.json() as Promise<T>;
}

export function loadGuildList(query = "") {
  return request<GuildListResponse>(`/api/guilds${query ? `?${query}` : ""}`);
}

export function loadMyGuild() {
  return request<GuildMineResponse>("/api/guilds/mine");
}

export function loadGuildProfile(guildId: string) {
  return request<GuildProfileResponse>(`/api/guilds/${encodeURIComponent(guildId)}`);
}

export function loadGuildCard(guildId: string) {
  return request<GuildCardView>(`/api/guilds/${encodeURIComponent(guildId)}/guild-card`);
}

export function loadGuildCardCandidates(guildId: string) {
  return request<GuildCardCandidatesResponse>(`/api/guilds/${encodeURIComponent(guildId)}/guild-card/eligible`);
}

export function loadGuildTreasuryCardCandidates(guildId: string) {
  return request<GuildTreasuryCardCandidatesResponse>(`/api/guilds/${encodeURIComponent(guildId)}/treasury/card-candidates`);
}

export function donateGuildTreasury(guildId: string, currency: GuildTreasuryCurrency, amount: number) {
  return request<GuildProfileResponse>(`/api/guilds/${encodeURIComponent(guildId)}/treasury/donate`, { method: "POST", body: { currency, amount } });
}

export function donateGuildCardElements(guildId: string, fodderInstanceIds: readonly string[]) {
  return request<GuildProfileResponse>(`/api/guilds/${encodeURIComponent(guildId)}/treasury/card-elements`, { method: "POST", body: { fodderInstanceIds } });
}

export function purchaseGuildAltarUpgrade(guildId: string, currency: GuildAltarCurrency) {
  return request<GuildAltarUpgradeResponse>(`/api/guilds/${encodeURIComponent(guildId)}/altar/upgrade`, { method: "POST", body: { currency } });
}

export function loadGuildRaid(guildId: string) {
  return request<GuildRaidView>(`/api/guilds/${encodeURIComponent(guildId)}/raid`);
}

export function enrollGuildRaid(guildId: string) {
  return request<GuildRaidView>(`/api/guilds/${encodeURIComponent(guildId)}/raid/enroll`, { method: "POST" });
}

export function leaveGuildRaid(guildId: string) {
  return request<GuildRaidView>(`/api/guilds/${encodeURIComponent(guildId)}/raid/enroll`, { method: "DELETE" });
}

export function startGuildRaid(guildId: string) {
  return request<GuildRaidView>(`/api/guilds/${encodeURIComponent(guildId)}/raid/start`, { method: "POST" });
}

export function startGuildRaidBattle(guildId: string) {
  return request<GuildRaidView>(`/api/guilds/${encodeURIComponent(guildId)}/raid/battle`, { method: "POST" });
}

export function submitGuildRaidAction(guildId: string, battleId: string, body: GuildRaidActionRequest) {
  return request<GuildRaidView>(`/api/guilds/${encodeURIComponent(guildId)}/raid/battle/${encodeURIComponent(battleId)}/action`, { method: "POST", body });
}

export function setGuildCard(guildId: string, instanceId: string) {
  return request<GuildProfileResponse>(`/api/guilds/${encodeURIComponent(guildId)}/guild-card`, { method: "PATCH", body: { instanceId } });
}

export function loadGuildForum(guildId: string) {
  return request<GuildForumIndexResponse>(`/api/guilds/${encodeURIComponent(guildId)}/forum`);
}

export function loadGuildForumSection(guildId: string, sectionId: string, page = 1) {
  return request<GuildForumSectionResponse>(`/api/guilds/${encodeURIComponent(guildId)}/forum/sections/${encodeURIComponent(sectionId)}?page=${page}`);
}

export function loadGuildForumTopic(guildId: string, topicId: string, page = 1) {
  return request<GuildForumTopicResponse>(`/api/guilds/${encodeURIComponent(guildId)}/forum/topics/${encodeURIComponent(topicId)}?page=${page}`);
}

export function createGuildForumTopic(guildId: string, sectionId: string, title: string, body: string) {
  return request<GuildForumTopicResponse>(`/api/guilds/${encodeURIComponent(guildId)}/forum/topics`, { method: "POST", body: { sectionId, title, body } });
}

export function createGuildForumPost(guildId: string, topicId: string, body: string) {
  return request<GuildForumTopicResponse>(`/api/guilds/${encodeURIComponent(guildId)}/forum/topics/${encodeURIComponent(topicId)}/posts`, { method: "POST", body: { body } });
}

export function updateGuildAnnouncement(guildId: string, body: string) {
  return request<GuildProfileResponse>(`/api/guilds/${encodeURIComponent(guildId)}/announcement`, { method: "PATCH", body: { body } });
}

export function createGuild(body: CreateGuildRequest) {
  return request<GuildProfileResponse>("/api/guilds", { method: "POST", body });
}

export function updateGuildSettings(guildId: string, body: UpdateGuildSettingsRequest) {
  return request<GuildProfileResponse>(`/api/guilds/${encodeURIComponent(guildId)}/settings`, { method: "PATCH", body });
}

export function joinGuild(guildId: string) {
  return request<GuildProfileResponse>(`/api/guilds/${encodeURIComponent(guildId)}/join`, { method: "POST" });
}

export function applyToGuild(guildId: string, message: string) {
  return request<GuildProfileResponse>(`/api/guilds/${encodeURIComponent(guildId)}/apply`, { method: "POST", body: { message } });
}

export function withdrawGuildApplication(applicationId: string) {
  return request<{ withdrawn: boolean }>(`/api/guilds/applications/${encodeURIComponent(applicationId)}/withdraw`, { method: "DELETE" });
}

export function decideGuildApplication(guildId: string, applicationId: string, decision: "accept" | "reject") {
  return request<GuildProfileResponse>(`/api/guilds/${encodeURIComponent(guildId)}/applications/${encodeURIComponent(applicationId)}/${decision}`, { method: "POST" });
}

export function changeGuildRole(guildId: string, playerId: string, role: GuildRole) {
  return request<GuildProfileResponse>(`/api/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(playerId)}/role`, { method: "PATCH", body: { role } });
}

export function kickGuildMember(guildId: string, playerId: string) {
  return request<GuildProfileResponse>(`/api/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(playerId)}/kick`, { method: "POST" });
}

export function leaveGuild(guildId: string) {
  return request<{ left: boolean }>(`/api/guilds/${encodeURIComponent(guildId)}/leave`, { method: "POST" });
}

export function transferGuildLeadership(guildId: string, playerId: string) {
  return request<GuildProfileResponse>(`/api/guilds/${encodeURIComponent(guildId)}/transfer-leadership`, { method: "POST", body: { playerId } });
}

export function dissolveGuild(guildId: string) {
  return request<{ dissolved: boolean }>(`/api/guilds/${encodeURIComponent(guildId)}/dissolve`, { method: "POST" });
}
