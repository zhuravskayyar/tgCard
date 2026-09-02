import {
  FORUM_REFERENCE_SOURCE_URL,
  GUILD_FORUM_REFERENCE_ORIGIN,
  GUILD_FORUM_REFERENCE_SOURCE_URL,
  GUILD_REFERENCE_SAMPLE_URL,
  parseForumIndexHtml,
  parseForumSectionHtml,
  parseForumTopicHtml,
  parseGuildAchievementsHtml,
  parseGuildForumIndexHtml,
  parseGuildForumSectionHtml,
  parseGuildMembersHtml,
  parseGuildProfileHtml,
  parseReferencePageHtml,
  WITCH_RAID_REFERENCE_TOPIC_URL,
  type ForumIndexPage,
  type ForumSectionPage,
  type ForumTopicPage,
  type GuildAchievementsPage,
  type GuildAchievementMode,
  type GuildForumIndexPage,
  type GuildMembersPage,
  type GuildProfilePage,
  type ReferenceLink,
  type ReferencePageDiscovery,
  type ReferencePageKind,
} from "@cardastika/game-core";
import { GUILD_CONFIG, GUILD_ROLE_LABELS } from "@cardastika/shared";

const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000;
const DEFAULT_MAX_PAGES = 250;
const DEFAULT_MAX_DEPTH = 6;
const REFERENCE_REQUEST_TIMEOUT_MS = 5_000;
const REFERENCE_CRAWL_CONCURRENCY = 4;
const FORUM_SECTION_IDS = [1, 2, 3, 4, 7, 8, 9] as const;
const GUILD_ID = 952;
const GUILD_ACHIEVEMENT_MODES = ["gwars", "garena", "graids", "ffights"] as const;
const REFERENCE_HEADERS = {
  Accept: "text/html",
  "User-Agent": "Cardastika-guild-forum-reference-parser/1.0",
};

export type ReferenceCrawlScope = "curated" | "full";

export interface ReferenceCrawlOptions {
  scope?: ReferenceCrawlScope;
  maxPages?: number;
  maxDepth?: number;
}

export interface ReferencePageSnapshot {
  sourceUrl: string;
  kind: ReferencePageKind;
  title: string;
  depth: number;
  textLength: number;
  textPreview: string;
  links: readonly ReferenceLink[];
  assetUrls: readonly string[];
  styleUrls: readonly string[];
}

export interface ReferenceCrawlFailure {
  url: string;
  status: number | null;
  message: string;
}

export interface ReferenceCrawlStatus {
  scope: ReferenceCrawlScope;
  maxPages: number;
  maxDepth: number;
  seedUrls: readonly string[];
  discoveredPages: number;
  fetchedPages: number;
  failedPages: readonly ReferenceCrawlFailure[];
  truncated: boolean;
}

export type ReferenceLogicStatus = "match" | "diverges" | "reference-only" | "unknown";

export interface ReferenceLogicObservation {
  key: string;
  area: string;
  referenceValue: string;
  cardastikaValue: string;
  status: ReferenceLogicStatus;
  evidence: readonly ReferenceLink[];
}

export interface ReferenceLogicReport {
  generatedAt: string;
  observations: readonly ReferenceLogicObservation[];
  unknowns: readonly string[];
}

export interface GuildForumReferenceSnapshot {
  sourceOrigin: string;
  sampleGuildId: number;
  collectedAt: string;
  scope: ReferenceCrawlScope;
  pages: readonly ReferencePageSnapshot[];
  crawl: ReferenceCrawlStatus;
  logic: ReferenceLogicReport;
  forum: {
    index: ForumIndexPage;
    sections: readonly ForumSectionPage[];
    guildsSection: ForumSectionPage;
    guildGuide: ForumTopicPage;
  };
  guild: {
    profile: GuildProfilePage;
    members: readonly GuildMembersPage[];
    achievements: readonly GuildAchievementsPage[];
    forum: GuildForumIndexPage;
    forumSection: ForumSectionPage;
  };
  assetUrls: readonly string[];
  notes: readonly string[];
}

export class GuildForumReferenceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuildForumReferenceUnavailableError";
  }
}

type ReferenceFetcher = (input: string, init?: RequestInit) => Promise<Response>;

interface FetchedReferencePage {
  parsed: ReferencePageDiscovery;
  html: string;
  depth: number;
}

interface CrawlResult {
  pages: Map<string, FetchedReferencePage>;
  status: ReferenceCrawlStatus;
}

function curatedPageUrls() {
  return [
    FORUM_REFERENCE_SOURCE_URL,
    ...FORUM_SECTION_IDS.map((id) => `${FORUM_REFERENCE_SOURCE_URL}${id}/`),
    `${FORUM_REFERENCE_SOURCE_URL}7/151400/`,
    GUILD_REFERENCE_SAMPLE_URL,
    `${GUILD_REFERENCE_SAMPLE_URL}info/`,
    `${GUILD_REFERENCE_SAMPLE_URL}members/`,
    `${GUILD_REFERENCE_SAMPLE_URL}members/page_2/`,
    ...GUILD_ACHIEVEMENT_MODES.map((mode) => `${GUILD_REFERENCE_SAMPLE_URL}achievements/${mode}/`),
    WITCH_RAID_REFERENCE_TOPIC_URL,
    GUILD_FORUM_REFERENCE_SOURCE_URL,
    `${GUILD_FORUM_REFERENCE_SOURCE_URL}95201/`,
  ];
}

function fullSeedUrls() {
  return [
    `${GUILD_FORUM_REFERENCE_ORIGIN}/`,
    `${GUILD_FORUM_REFERENCE_ORIGIN}/about/`,
    `${GUILD_FORUM_REFERENCE_ORIGIN}/rules/`,
    GUILD_REFERENCE_SAMPLE_URL,
    GUILD_FORUM_REFERENCE_SOURCE_URL,
    ...curatedPageUrls(),
  ].filter((url, index, urls) => urls.indexOf(url) === index);
}

function normalizeCrawlOptions(options: ReferenceCrawlOptions = {}) {
  const scope: ReferenceCrawlScope = options.scope === "full" ? "full" : "curated";
  const maxPages = Number.isSafeInteger(options.maxPages) ? Math.max(1, Math.min(1000, options.maxPages!)) : DEFAULT_MAX_PAGES;
  const maxDepth = Number.isSafeInteger(options.maxDepth) ? Math.max(0, Math.min(10, options.maxDepth!)) : DEFAULT_MAX_DEPTH;
  return { scope, maxPages, maxDepth };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown fetch failure";
}

async function crawlReference(
  fetcher: ReferenceFetcher,
  options: ReferenceCrawlOptions,
  signal?: AbortSignal,
): Promise<CrawlResult> {
  const normalized = normalizeCrawlOptions(options);
  const seedUrls = normalized.scope === "full" ? fullSeedUrls() : curatedPageUrls();
  const queue = seedUrls.map((url) => ({ url, depth: 0 }));
  const queued = new Set(seedUrls);
  const pages = new Map<string, FetchedReferencePage>();
  const failedPages: ReferenceCrawlFailure[] = [];
  let claimedPages = 0;

  const worker = async () => {
    while (true) {
      const current = queue.shift();
      if (!current || claimedPages >= normalized.maxPages) return;
      claimedPages += 1;
      try {
        const timeout = AbortSignal.timeout(REFERENCE_REQUEST_TIMEOUT_MS);
        const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
        const response = await fetcher(current.url, { headers: REFERENCE_HEADERS, signal: requestSignal });
        if (!response.ok) {
          failedPages.push({ url: current.url, status: response.status, message: `HTTP ${response.status}` });
          continue;
        }
        const html = await response.text();
        const parsed = parseReferencePageHtml(html, current.url);
        pages.set(current.url, { parsed, html, depth: current.depth });
        if (normalized.scope !== "full" || current.depth >= normalized.maxDepth) continue;
        for (const link of parsed.links) {
          if (queued.has(link.url) || pages.has(link.url)) continue;
          queued.add(link.url);
          queue.push({ url: link.url, depth: current.depth + 1 });
        }
      } catch (error) {
        if (signal?.aborted) throw error;
        failedPages.push({ url: current.url, status: null, message: errorMessage(error) });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(REFERENCE_CRAWL_CONCURRENCY, normalized.maxPages) }, () => worker()));

  return {
    pages,
    status: {
      scope: normalized.scope,
      maxPages: normalized.maxPages,
      maxDepth: normalized.maxDepth,
      seedUrls,
      discoveredPages: queued.size,
      fetchedPages: pages.size,
      failedPages,
      truncated: queue.length > 0 || claimedPages >= normalized.maxPages,
    },
  };
}

function emptyForumIndex(sourceUrl: string): ForumIndexPage {
  return { sourceUrl, categories: [], assetUrls: [] };
}

function emptyForumSection(sourceUrl: string, sectionId: number): ForumSectionPage {
  return { sourceUrl, sectionId, title: "", currentPage: 1, pageCount: 1, topics: [], creationRule: null, moderators: [], assetUrls: [] };
}

function emptyForumTopic(sourceUrl: string, sectionId: number, topicId: number, area: "forum" | "guild", guildId?: number): ForumTopicPage {
  return {
    sourceUrl,
    area,
    sectionId,
    ...(guildId === undefined ? {} : { guildId }),
    topicId,
    sectionTitle: "",
    title: "",
    currentPage: 1,
    pageCount: 1,
    commentCount: null,
    posts: [],
    moderators: [],
    assetUrls: [],
  };
}

function emptyGuildProfile(sourceUrl: string): GuildProfilePage {
  return {
    sourceUrl,
    guildId: GUILD_ID,
    name: "",
    element: null,
    level: null,
    foundedAt: null,
    type: null,
    ally: null,
    memberCount: null,
    memberCapacity: null,
    combatRating: null,
    combatRank: null,
    combatExperienceRank: null,
    combatExperience: null,
    bonuses: [],
    sampleCardPower: null,
    sampleCardLevel: null,
    links: [],
    assetUrls: [],
  };
}

function emptyGuildMembers(sourceUrl: string): GuildMembersPage {
  return { sourceUrl, guildId: GUILD_ID, currentPage: 1, pageCount: 1, members: [], assetUrls: [] };
}

function emptyGuildAchievements(sourceUrl: string): GuildAchievementsPage {
  return {
    sourceUrl,
    guildId: GUILD_ID,
    mode: "unknown",
    title: "",
    entries: [],
    raidTrophies: [],
    raidStats: { maxSorceressLevel: null, defeatedSorceresses: null },
    assetUrls: [],
  };
}

function emptyGuildForum(sourceUrl: string): GuildForumIndexPage {
  return { sourceUrl, guildId: GUILD_ID, sections: [], assetUrls: [] };
}

function parseOr<T>(pages: Map<string, FetchedReferencePage>, url: string, fallback: T, parser: (html: string, sourceUrl: string) => T) {
  const page = pages.get(url);
  if (!page) return fallback;
  try {
    return parser(page.html, url);
  } catch {
    return fallback;
  }
}

function collectAssets(snapshot: GuildForumReferenceSnapshot) {
  const urls: string[] = [];
  const add = (values: readonly string[]) => {
    for (const value of values) if (!urls.includes(value)) urls.push(value);
  };
  for (const page of snapshot.pages) add(page.assetUrls);
  add(snapshot.forum.index.assetUrls);
  for (const section of snapshot.forum.sections) add(section.assetUrls);
  add(snapshot.forum.guildsSection.assetUrls);
  add(snapshot.forum.guildGuide.assetUrls);
  add(snapshot.guild.profile.assetUrls);
  for (const page of snapshot.guild.members) add(page.assetUrls);
  for (const page of snapshot.guild.achievements) add(page.assetUrls);
  add(snapshot.guild.forum.assetUrls);
  add(snapshot.guild.forumSection.assetUrls);
  return urls;
}

function assertReferencePagesAreUseful(snapshot: GuildForumReferenceSnapshot) {
  if (snapshot.scope === "curated" && (snapshot.forum.index.categories.length === 0 || !snapshot.guild.profile.name)) {
    throw new GuildForumReferenceUnavailableError(
      "Reference source returned a non-authenticated or unsupported page instead of guild/forum data",
    );
  }
  const hasUsefulPublicPage = snapshot.pages.some((page) =>
    ["about", "rules"].includes(page.kind)
    && page.textLength > 80
    && !/слишком\s+много\s+запрос|сервер\s+перегружен|осталось\s+около/iu.test(page.textPreview),
  );
  if (snapshot.scope === "full" && !hasUsefulPublicPage) {
    throw new GuildForumReferenceUnavailableError(
      "Reference source returned no useful public about/rules pages for the full crawl (the site may be rate-limiting requests)",
    );
  }
}

function evidenceFor(pages: readonly ReferencePageSnapshot[], predicate: (page: ReferencePageSnapshot) => boolean) {
  return pages
    .filter(predicate)
    .slice(0, 5)
    .map((page) => ({ label: page.title || page.kind, url: page.sourceUrl }));
}

interface LogicRule {
  key: string;
  area: string;
  match: (page: ReferencePageSnapshot) => boolean;
  referenceValue: string;
  cardastikaValue: string;
  status: Exclude<ReferenceLogicStatus, "unknown">;
}

function textRule(pattern: RegExp, rule: Omit<LogicRule, "match">): LogicRule {
  return { ...rule, match: (page) => pattern.test(page.textPreview) };
}

function buildLogicReport(pages: readonly ReferencePageSnapshot[], generatedAt: string): ReferenceLogicReport {
  const rules: LogicRule[] = [
    textRule(/с\s+10(?:-го)?\s+уровня|10\s+уровня/iu, {
      key: "guild_unlock_level",
      area: "guilds",
      referenceValue: "Вступление/создание доступно с 10 уровня",
      cardastikaValue: `Вступление/создание доступно с ${GUILD_CONFIG.unlockLevel} уровня`,
      status: "match",
    }),
    textRule(/(?:создани[ея]|основани[ея])[\s\S]{0,140}(?:золот|серебр)/iu, {
      key: "guild_creation_cost",
      area: "guilds",
      referenceValue: "Стоимость создания обнаружена в публичном тексте; значение нужно подтвердить",
      cardastikaValue: `${GUILD_CONFIG.creationCostSilver} серебра`,
      status: "diverges",
    }),
    textRule(/(?:до|максимум)\s+\d+\s+(?:участник|член)/iu, {
      key: "guild_member_capacity",
      area: "guilds",
      referenceValue: "Ограничение состава обнаружено; точное значение извлечь из совпадения",
      cardastikaValue: `${GUILD_CONFIG.maxMembersByLevel[0]} учасників на старті`,
      status: "diverges",
    }),
    textRule(/гильд[\s\S]{0,180}(?:стих|элемент)[\s\S]{0,180}принадлеж|гильд[\s\S]{0,180}принадлеж[\s\S]{0,180}(?:стих|элемент)|(?:стих|элемент)[\s\S]{0,180}принадлеж[\s\S]{0,180}гильд/iu, {
      key: "guild_element_affiliation",
      area: "guilds",
      referenceValue: "Гильдия имеет обязательную стихийную принадлежность",
      cardastikaValue: "themeElement необязателен и декоративен, без боевого бонуса",
      status: "diverges",
    }),
    textRule(/(?:уровень|развитие)[\s\S]{0,100}(?:опыт|опыта)[\s\S]{0,100}дуэл|(?:опыт|опыта)[\s\S]{0,100}дуэл[\s\S]{0,100}(?:уровень|развитие)/iu, {
      key: "guild_xp_source",
      area: "guilds",
      referenceValue: "Опыт гильдии связан с дуэлями",
      cardastikaValue: "Завершенные активности: дуэль, кампания, подземелье, арена; дневной cap 300",
      status: "diverges",
    }),
    textRule(/бонус[\s\S]{0,100}(?:серебр|опыт)|(?:серебр|опыт)[\s\S]{0,100}бонус/iu, {
      key: "guild_level_bonuses",
      area: "guilds",
      referenceValue: "Уровень гильдии дает бонусы к серебру и опыту",
      cardastikaValue: "В MVP боевых/экономических бонусов нет",
      status: "diverges",
    }),
    textRule(/казн/iu, {
      key: "guild_treasury",
      area: "guilds",
      referenceValue: "У гильдии есть казна для общих расходов",
      cardastikaValue: "Казна не входит в MVP",
      status: "reference-only",
    }),
    textRule(/магистр[\s\S]*маршал[\s\S]*архимаг[\s\S]*(?:боев|боевой)\s+маг[\s\S]*адепт[\s\S]*неофит/iu, {
      key: "guild_role_ladder",
      area: "guilds",
      referenceValue: "Магистр → маршалы → архимаги → боевые маги → адепты → неофиты",
      cardastikaValue: Object.values(GUILD_ROLE_LABELS).join(" → "),
      status: "diverges",
    }),
    {
      key: "guild_forum",
      area: "guild-forum",
      match: (page) => page.kind === "guild-forum-index" || page.kind === "guild-forum-section" || page.kind === "guild-forum-topic",
      referenceValue: "У гильдии есть отдельный форум с разделами и темами",
      cardastikaValue: "Форум отложен после MVP",
      status: "reference-only",
    },
    {
      key: "guild_card",
      area: "guild-card",
      match: (page) => page.kind === "guild-card" || /карта\s+гильдии/iu.test(page.textPreview),
      referenceValue: "Есть отдельная карта гильдии: сила, верность, усиление и ограничение на поглощение",
      cardastikaValue: "Гильдийная карта и ее боевые модификаторы не входят в MVP",
      status: "reference-only",
    },
    {
      key: "guild_treasury_system",
      area: "guild-treasury",
      match: (page) => page.kind === "guild-treasury",
      referenceValue: "Есть казна, взносы и статистика пополнений",
      cardastikaValue: "Казна и взносы не входят в MVP",
      status: "reference-only",
    },
    {
      key: "guild_altar",
      area: "guild-altar",
      match: (page) => page.kind === "guild-altar" || /алтарь\s+гильдии/iu.test(page.textPreview),
      referenceValue: "Алтарь дает временные усиления для войн/турниров; доступна одна выбранная опция",
      cardastikaValue: "Гильдийные усиления не входят в MVP",
      status: "reference-only",
    },
    {
      key: "guild_war_system",
      area: "guild-wars",
      match: (page) => page.kind === "guild-war" || /войн[\s\S]{0,80}гильди|гильди[\s\S]{0,80}войн/iu.test(page.textPreview),
      referenceValue: "Война идет по дням: дуэли добывают ключи, затем проходят массовые сражения",
      cardastikaValue: "Войны гильдий не входят в MVP",
      status: "reference-only",
    },
    {
      key: "guild_arena_system",
      area: "guild-arena",
      match: (page) => page.kind === "guild-arena" || /арен[\s\S]{0,80}гильди|гильди[\s\S]{0,80}арен/iu.test(page.textPreview),
      referenceValue: "Гильдийная арена формирует союзы/пятерки и начисляет рейтинговые очки",
      cardastikaValue: "Арена гильдий не входит в MVP",
      status: "reference-only",
    },
    {
      key: "guild_raids_system",
      area: "guild-raids",
      match: (page) => page.kind === "guild-raids" || /рейд[\s\S]{0,80}(?:гильди|дракон)|дракон[\s\S]{0,80}рейд/iu.test(page.textPreview),
      referenceValue: "Є окремі рейди гільдії на драконів і відьом",
      cardastikaValue: "Рейды не входят в MVP",
      status: "reference-only",
    },
    {
      key: "guild_rewards_system",
      area: "guild-rewards",
      match: (page) => page.kind === "guild-rewards" || /награды\s+гильдии/iu.test(page.textPreview),
      referenceValue: "Есть общие и личные награды за вклад/активность гильдии",
      cardastikaValue: "Гильдийные награды не входят в MVP",
      status: "reference-only",
    },
    {
      key: "guild_journal",
      area: "guild-journal",
      match: (page) => page.kind === "guild-journal" || /летопись\s+гильдии/iu.test(page.textPreview),
      referenceValue: "Есть журнал событий гильдии с фильтрами по типу события",
      cardastikaValue: "Журнал событий не входит в MVP",
      status: "reference-only",
    },
    {
      key: "guild_chat",
      area: "guild-chat",
      match: (page) => page.kind === "guild-chat" || page.kind === "guild-alliance-chat",
      referenceValue: "Есть чат гильдии и отдельный чат союза с постраничной историей",
      cardastikaValue: "Гильдийний чат не входить у MVP; форум запланований окремо",
      status: "reference-only",
    },
    // Wars are represented by the richer guild_war_system observation above.
    // Raids are represented by the richer guild_raids_system observation above.
    // Guild arena and alliances are represented by the richer guild_arena_system observation above.
    textRule(/(?:три|3)\s+дополнительн(?:ые|ых)\s+карт|дополнительн(?:ые|ых)\s+карт[\s\S]{0,100}(?:гильд|союз)/iu, {
      key: "guild_extra_cards",
      area: "battle-system",
      referenceValue: "К боевой колоде добавляются дополнительные гильдийные/союзные карты",
      cardastikaValue: "В MVP нет гильдийных боевых бонусов и дополнительных карт",
      status: "diverges",
    }),
    textRule(/правил[\s\S]{0,80}(?:запрещ|нельзя)|запрещ[\s\S]{0,80}(?:бот|мульт|оскорб)/iu, {
      key: "reference_community_rules",
      area: "rules",
      referenceValue: "Есть отдельные правила сообщества и модерации",
      cardastikaValue: "Нужен отдельный policy/moderation документ, не часть Guild MVP",
      status: "reference-only",
    }),
  ];

  const observations: ReferenceLogicObservation[] = [];
  const unknowns: string[] = [];
  for (const rule of rules) {
    const evidence = evidenceFor(pages, rule.match);
    if (evidence.length === 0) {
      unknowns.push(rule.key);
      observations.push({
        key: rule.key,
        area: rule.area,
        referenceValue: "Не найдено в загруженных публичных страницах",
        cardastikaValue: rule.cardastikaValue,
        status: "unknown",
        evidence: [],
      });
      continue;
    }
    observations.push({ ...rule, evidence });
  }
  return { generatedAt, observations, unknowns };
}

function snapshotPage(page: FetchedReferencePage): ReferencePageSnapshot {
  return {
    sourceUrl: page.parsed.sourceUrl,
    kind: page.parsed.kind,
    title: page.parsed.title,
    depth: page.depth,
    textLength: page.parsed.text.length,
    textPreview: page.parsed.text.slice(0, 12_000),
    links: page.parsed.links,
    assetUrls: page.parsed.assetUrls,
    styleUrls: page.parsed.styleUrls,
  };
}

function buildSnapshot(crawl: CrawlResult, now: number): GuildForumReferenceSnapshot {
  const profileUrl = GUILD_REFERENCE_SAMPLE_URL;
  const profileInfoUrl = `${GUILD_REFERENCE_SAMPLE_URL}info/`;
  const membersUrls = [
    `${GUILD_REFERENCE_SAMPLE_URL}members/`,
    `${GUILD_REFERENCE_SAMPLE_URL}members/page_2/`,
  ];
  const achievementPages = GUILD_ACHIEVEMENT_MODES.map((mode) => {
    const url = `${GUILD_REFERENCE_SAMPLE_URL}achievements/${mode}/`;
    const parsed = parseOr(crawl.pages, url, emptyGuildAchievements(url), parseGuildAchievementsHtml);
    return parsed.mode === "unknown" ? { ...parsed, mode: mode as GuildAchievementMode } : parsed;
  });
  const pageSnapshots = [...crawl.pages.values()].map(snapshotPage);
  const collectedAt = new Date(now).toISOString();
  const snapshot: GuildForumReferenceSnapshot = {
    sourceOrigin: GUILD_FORUM_REFERENCE_ORIGIN,
    sampleGuildId: GUILD_ID,
    collectedAt,
    scope: crawl.status.scope,
    pages: pageSnapshots,
    crawl: crawl.status,
    logic: buildLogicReport(pageSnapshots, collectedAt),
    forum: {
      index: parseOr(crawl.pages, FORUM_REFERENCE_SOURCE_URL, emptyForumIndex(FORUM_REFERENCE_SOURCE_URL), parseForumIndexHtml),
      sections: FORUM_SECTION_IDS.map((id) => {
        const url = `${FORUM_REFERENCE_SOURCE_URL}${id}/`;
        return parseOr(crawl.pages, url, emptyForumSection(url, id), parseForumSectionHtml);
      }),
      guildsSection: parseOr(crawl.pages, `${FORUM_REFERENCE_SOURCE_URL}7/`, emptyForumSection(`${FORUM_REFERENCE_SOURCE_URL}7/`, 7), parseForumSectionHtml),
      guildGuide: parseOr(crawl.pages, `${FORUM_REFERENCE_SOURCE_URL}7/151400/`, emptyForumTopic(`${FORUM_REFERENCE_SOURCE_URL}7/151400/`, 7, 151400, "forum"), parseForumTopicHtml),
    },
    guild: {
      profile: parseOr(crawl.pages, profileInfoUrl, parseOr(crawl.pages, profileUrl, emptyGuildProfile(profileInfoUrl), parseGuildProfileHtml), parseGuildProfileHtml),
      members: membersUrls.map((url) => parseOr(crawl.pages, url, emptyGuildMembers(url), parseGuildMembersHtml)),
      achievements: achievementPages,
      forum: parseOr(crawl.pages, GUILD_FORUM_REFERENCE_SOURCE_URL, emptyGuildForum(GUILD_FORUM_REFERENCE_SOURCE_URL), parseGuildForumIndexHtml),
      forumSection: parseOr(crawl.pages, `${GUILD_FORUM_REFERENCE_SOURCE_URL}95201/`, emptyForumSection(`${GUILD_FORUM_REFERENCE_SOURCE_URL}95201/`, 95201), parseGuildForumSectionHtml),
    },
    assetUrls: [],
    notes: [
      "The reference pages are public examples and are not a source of authority for Cardastika player state.",
      "The full scope is a bounded, read-only same-origin crawl. User profiles, external links and mutation endpoints are intentionally excluded.",
      "The sample guild is public guild 952; private guild rooms and mutation flows require an authenticated member context.",
      "Forum content is a live snapshot and may change; implementation should persist Cardastika-owned posts separately.",
      "Unknown observations mean the statement was not found in fetched public HTML; they are not proof that the reference lacks the rule.",
    ],
  };
  snapshot.assetUrls = collectAssets(snapshot);
  return snapshot;
}

export class GuildForumReferenceService {
  private readonly cached = new Map<string, { expiresAt: number; snapshot: GuildForumReferenceSnapshot }>();

  constructor(
    private readonly fetcher: ReferenceFetcher = fetch,
    private readonly now: () => number = Date.now,
    private readonly cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  ) {}

  async get(options: ReferenceCrawlOptions = {}, signal?: AbortSignal) {
    const normalized = normalizeCrawlOptions(options);
    const cacheKey = `${normalized.scope}:${normalized.maxPages}:${normalized.maxDepth}`;
    const cached = this.cached.get(cacheKey);
    if (cached && cached.expiresAt > this.now()) return cached.snapshot;

    try {
      const snapshot = buildSnapshot(await crawlReference(this.fetcher, normalized, signal), this.now());
      assertReferencePagesAreUseful(snapshot);
      this.cached.set(cacheKey, { expiresAt: this.now() + this.cacheTtlMs, snapshot });
      return snapshot;
    } catch (error) {
      if (error instanceof GuildForumReferenceUnavailableError) throw error;
      throw new GuildForumReferenceUnavailableError("Guild and forum reference could not be parsed");
    }
  }

  clearCache() {
    this.cached.clear();
  }
}
