export const GUILD_FORUM_REFERENCE_ORIGIN = "https://elem.mobi";
export const GUILD_REFERENCE_SAMPLE_URL = `${GUILD_FORUM_REFERENCE_ORIGIN}/guild/952/`;
export const FORUM_REFERENCE_SOURCE_URL = `${GUILD_FORUM_REFERENCE_ORIGIN}/forum/`;
export const GUILD_FORUM_REFERENCE_SOURCE_URL = `${GUILD_FORUM_REFERENCE_ORIGIN}/guildforum/952/`;
export const WITCH_RAID_REFERENCE_TOPIC_URL = `${GUILD_FORUM_REFERENCE_ORIGIN}/forum/3/224901/#15636768`;

export type ReferencePageKind =
  | "home"
  | "system"
  | "about"
  | "rules"
  | "forum-index"
  | "forum-section"
  | "forum-topic"
  | "guild-profile"
  | "guild-dashboard"
  | "guild-info"
  | "guild-card"
  | "guild-altar"
  | "guild-war"
  | "guild-arena"
  | "guild-raids"
  | "guild-treasury"
  | "guild-rewards"
  | "guild-journal"
  | "guild-notice"
  | "guild-chat"
  | "guild-alliance-chat"
  | "guild-members"
  | "guild-achievements"
  | "guild-forum-index"
  | "guild-forum-section"
  | "guild-forum-topic"
  | "other";

export interface ReferenceLink {
  label: string;
  url: string;
}

export interface ReferencePageDiscovery {
  sourceUrl: string;
  kind: ReferencePageKind;
  title: string;
  text: string;
  links: readonly ReferenceLink[];
  assetUrls: readonly string[];
  styleUrls: readonly string[];
}

export interface ForumCategory {
  id: number;
  title: string;
  description: string;
  url: string;
}

export type ForumTopicIcon = "important" | "important-read" | "read" | "unread" | "unknown";

export interface ForumTopicSummary {
  area: "forum" | "guild";
  sectionId: number;
  guildId?: number;
  topicId: number;
  title: string;
  url: string;
  pinned: boolean;
  icon: ForumTopicIcon;
}

export interface ForumIndexPage {
  sourceUrl: string;
  categories: readonly ForumCategory[];
  assetUrls: readonly string[];
}

export interface ForumSectionPage {
  sourceUrl: string;
  sectionId: number;
  title: string;
  currentPage: number;
  pageCount: number;
  topics: readonly ForumTopicSummary[];
  creationRule: string | null;
  moderators: readonly ReferenceLink[];
  assetUrls: readonly string[];
}

export interface ForumPost {
  postId: number;
  authorId: number | null;
  authorName: string;
  authorUrl: string | null;
  authorAvatarUrl: string | null;
  createdAt: string | null;
  replyUrl: string | null;
  bodyText: string;
  links: readonly ReferenceLink[];
  assetUrls: readonly string[];
}

export interface ForumTopicPage {
  sourceUrl: string;
  area: "forum" | "guild";
  sectionId: number;
  guildId?: number;
  topicId: number;
  sectionTitle: string;
  title: string;
  currentPage: number;
  pageCount: number;
  commentCount: number | null;
  posts: readonly ForumPost[];
  moderators: readonly ReferenceLink[];
  assetUrls: readonly string[];
}

export interface GuildProfilePage {
  sourceUrl: string;
  guildId: number;
  name: string;
  element: string | null;
  level: number | null;
  foundedAt: string | null;
  type: string | null;
  ally: ReferenceLink | null;
  memberCount: number | null;
  memberCapacity: number | null;
  combatRating: string | null;
  combatRank: number | null;
  combatExperienceRank: number | null;
  combatExperience: string | null;
  bonuses: readonly string[];
  sampleCardPower: number | null;
  sampleCardLevel: number | null;
  links: readonly ReferenceLink[];
  assetUrls: readonly string[];
}

export interface GuildMember {
  position: number;
  playerId: number;
  name: string;
  guildExperience: string | null;
  daysInGuild: number | null;
  rank: string | null;
  profileUrl: string;
}

export interface GuildMembersPage {
  sourceUrl: string;
  guildId: number;
  currentPage: number;
  pageCount: number;
  members: readonly GuildMember[];
  assetUrls: readonly string[];
}

export type GuildAchievementMode = "wars" | "arena" | "raids" | "fun-fights" | "unknown";

export interface GuildAchievementEntry {
  text: string;
  assetUrls: readonly string[];
}

export interface GuildAchievementsPage {
  sourceUrl: string;
  guildId: number;
  mode: GuildAchievementMode;
  title: string;
  entries: readonly GuildAchievementEntry[];
  raidTrophies: readonly { cardClass: string; count: number }[];
  raidStats: {
    maxSorceressLevel: number | null;
    defeatedSorceresses: number | null;
  };
  assetUrls: readonly string[];
}

export interface GuildForumSection {
  guildId: number;
  forumId: number;
  title: string;
  url: string;
  access: string | null;
}

export interface GuildForumIndexPage {
  sourceUrl: string;
  guildId: number;
  sections: readonly GuildForumSection[];
  assetUrls: readonly string[];
}

interface AnchorRecord {
  attrs: string;
  href: string;
  text: string;
  html: string;
  start: number;
}

interface ElementSlice {
  start: number;
  end: number;
  inner: string;
  html: string;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeHtmlEntities(value: string) {
  const namedEntities: Readonly<Record<string, string>> = {
    amp: "&",
    apos: "'",
    gt: ">",
    nbsp: " ",
    quot: '"',
    lt: "<",
  };

  return value
    .replace(/&#(x[\da-f]+|\d+);/giu, (_, code: string) => {
      const radix = code.toLowerCase().startsWith("x") ? 16 : 10;
      const numericCode = Number.parseInt(code.replace(/^x/i, ""), radix);
      return Number.isFinite(numericCode) && numericCode <= 0x10ffff ? String.fromCodePoint(numericCode) : _;
    })
    .replace(/&([a-z]+);/gi, (entity, name: string) => namedEntities[name.toLowerCase()] ?? entity);
}

function attributeValue(attributes: string, name: string) {
  const match = attributes.match(new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  return match?.[2] === undefined ? null : decodeHtmlEntities(match[2]);
}

/** Converts the legacy reference markup into readable text without a DOM dependency. */
export function referenceHtmlToText(html: string) {
  return decodeHtmlEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
      .replace(/<style\b[\s\S]*?<\/style\s*>/gi, "")
      .replace(/<img\b([^>]*)>/gi, (_, attributes: string) => {
        const alt = attributeValue(attributes, "alt");
        return alt ? ` ${alt} ` : "";
      })
      .replace(/<(?:div|p|li|tr|h[1-6]|center)\b[^>]*>/gi, "\n")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/(?:div|p|li|tr|h[1-6]|center)\s*>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/\r/g, ""),
  )
    .split("\n")
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function inlineText(html: string) {
  return referenceHtmlToText(html).replace(/\s+/g, " ").trim();
}

function extractAnchors(html: string, sourceUrl: string) {
  const anchors: AnchorRecord[] = [];
  const pattern = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
  for (const match of html.matchAll(pattern)) {
    const attrs = match[1] ?? "";
    const rawHref = attributeValue(attrs, "href");
    if (!rawHref) continue;
    let url: URL;
    try {
      url = new URL(rawHref, sourceUrl);
    } catch {
      continue;
    }
    anchors.push({
      attrs,
      href: url.href,
      text: inlineText(match[2] ?? ""),
      html: match[0],
      start: match.index ?? 0,
    });
  }
  return anchors;
}

function extractAssetUrls(html: string, sourceUrl: string) {
  const urls: string[] = [];
  const add = (rawUrl: string | null) => {
    if (!rawUrl || rawUrl.startsWith("data:")) return;
    try {
      const url = new URL(rawUrl, sourceUrl).href;
      if (!urls.includes(url)) urls.push(url);
    } catch {
      // Ignore malformed legacy asset references.
    }
  };

  for (const match of html.matchAll(/<img\b([^>]*)>/gi)) add(attributeValue(match[1] ?? "", "src"));
  for (const match of html.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi)) add(decodeHtmlEntities(match[2] ?? ""));
  return urls;
}

function extractStylesheetUrls(html: string, sourceUrl: string) {
  const urls: string[] = [];
  for (const match of html.matchAll(/<link\b([^>]*)>/gi)) {
    const attributes = match[1] ?? "";
    const rel = attributeValue(attributes, "rel") ?? "";
    if (!/\bstylesheet\b/i.test(rel)) continue;
    const href = attributeValue(attributes, "href");
    if (!href || href.startsWith("data:")) continue;
    try {
      const url = new URL(href, sourceUrl).href;
      if (!urls.includes(url)) urls.push(url);
    } catch {
      // Ignore malformed legacy stylesheet references.
    }
  }
  return urls;
}

function parseNumber(value: string | null | undefined) {
  if (!value) return null;
  const match = value.replace(/\u00a0/g, " ").match(/-?\d[\d\s.,]*/);
  if (!match) return null;
  const parsed = Number.parseInt(match[0].replace(/[\s.,]/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function pageNumber(sourceUrl: string) {
  const match = new URL(sourceUrl).pathname.match(/page_(\d+)/i);
  return parseNumber(match?.[1]) ?? 1;
}

function pageCount(html: string) {
  const match = inlineText(html).match(/\bиз\s+(\d+)\b/i);
  if (match?.[1]) return parseNumber(match[1]) ?? 1;
  const pages = [...html.matchAll(/\/page_(\d+)\b/gi)].map((entry) => parseNumber(entry[1])).filter((value): value is number => value !== null);
  return pages.length ? Math.max(...pages, 1) : 1;
}

function parsePath(sourceUrl: string, pattern: RegExp) {
  return new URL(sourceUrl).pathname.match(pattern);
}

function parseModerators(html: string, sourceUrl: string) {
  const markerIndex = html.indexOf("Модераторы");
  if (markerIndex < 0) return [];
  const records = extractAnchors(html.slice(markerIndex, markerIndex + 2500), sourceUrl);
  const moderators: ReferenceLink[] = [];
  for (const record of records) {
    if (!/\/user\/\d+\/?$/i.test(new URL(record.href).pathname)) continue;
    if (!moderators.some((moderator) => moderator.url === record.href)) moderators.push({ label: record.text, url: record.href });
  }
  return moderators;
}

function findElementByClass(html: string, className: string, fromIndex = 0): ElementSlice | null {
  const token = escapeRegExp(className);
  const startPattern = new RegExp(`<div\\b(?=[^>]*\\bclass\\s*=\\s*["'][^"']*\\b${token}\\b[^"']*["'])[^>]*>`, "gi");
  startPattern.lastIndex = fromIndex;
  const startMatch = startPattern.exec(html);
  if (!startMatch || startMatch.index === undefined) return null;
  const start = startMatch.index;
  const openingEnd = start + startMatch[0].length;
  const tagPattern = /<\/?div\b[^>]*>/gi;
  tagPattern.lastIndex = openingEnd;
  let depth = 1;
  let closingStart = html.length;
  let closingEnd = html.length;
  let tagMatch: RegExpExecArray | null;
  while ((tagMatch = tagPattern.exec(html)) !== null) {
    const tag = tagMatch[0];
    const absoluteStart = tagMatch.index;
    if (/^<\//.test(tag)) depth -= 1;
    else if (!/\/\s*>$/.test(tag)) depth += 1;
    if (depth === 0) {
      closingStart = absoluteStart;
      closingEnd = absoluteStart + tag.length;
      break;
    }
  }
  return { start, end: closingEnd, inner: html.slice(openingEnd, closingStart), html: html.slice(start, closingEnd) };
}

function findElementsByClass(html: string, className: string) {
  const elements: ElementSlice[] = [];
  let fromIndex = 0;
  while (true) {
    const element = findElementByClass(html, className, fromIndex);
    if (!element) return elements;
    elements.push(element);
    fromIndex = Math.max(element.end, element.start + 1);
  }
}

function relevantLinks(html: string, sourceUrl: string) {
  const allowed = /\/(?:guild(?:forum)?|forum|user|collections|ratings)\//i;
  return extractAnchors(html, sourceUrl)
    .filter((record) => allowed.test(new URL(record.href).pathname))
    .filter((record, index, records) => records.findIndex((candidate) => candidate.href === record.href && candidate.text === record.text) === index)
    .map((record) => ({ label: record.text, url: record.href }));
}

function normalizedReferenceUrl(rawUrl: string, sourceUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl, sourceUrl);
  } catch {
    return null;
  }
  const origin = new URL(GUILD_FORUM_REFERENCE_ORIGIN);
  if (url.protocol !== origin.protocol || url.hostname !== origin.hostname || url.port !== origin.port) return null;
  url.hash = "";
  return url.href;
}

export function classifyReferencePageUrl(sourceUrl: string): ReferencePageKind {
  const path = new URL(sourceUrl).pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return "home";
  if (/^\/about(?:\/.*)?$/i.test(path)) return "about";
  if (/^\/rules(?:\/.*)?$/i.test(path)) return "rules";
  if (/^\/forum\/?$/i.test(path)) return "forum-index";
  if (/^\/forum\/\d+\/page_\d+$/i.test(path) || /^\/forum\/\d+$/i.test(path)) return "forum-section";
  if (/^\/forum\/\d+\/\d+(?:\/page_\d+)?$/i.test(path)) return "forum-topic";
  if (/^\/guild\/\d+\/?$/i.test(path)) return "guild-profile";
  if (/^\/guild\/\d+\/info\/?$/i.test(path)) return "guild-info";
  if (/^\/guild\/\d+\/members(?:\/page_\d+)?\/?$/i.test(path)) return "guild-members";
  if (/^\/guild\/\d+\/achievements\/[^/]+\/?$/i.test(path)) return "guild-achievements";
  if (/^\/guildforum\/\d+\/?$/i.test(path)) return "guild-forum-index";
  if (/^\/guildforum\/\d+\/\d+(?:\/page_\d+)?\/?$/i.test(path)) return "guild-forum-section";
  if (/^\/guildforum\/\d+\/\d+\/\d+(?:\/page_\d+)?\/?$/i.test(path)) return "guild-forum-topic";
  if (/^\/guild\/?$/i.test(path)) return "guild-dashboard";
  if (/^\/guild\/info\/?$/i.test(path)) return "guild-info";
  if (/^\/guild\/card\/?$/i.test(path)) return "guild-card";
  if (/^\/guild\/altar\/?$/i.test(path)) return "guild-altar";
  if (/^\/guild\/war\/?$/i.test(path)) return "guild-war";
  if (/^\/guild\/arena\/?$/i.test(path)) return "guild-arena";
  if (/^\/guild\/graids\/?$/i.test(path)) return "guild-raids";
  if (/^\/guild\/treasury\/?$/i.test(path)) return "guild-treasury";
  if (/^\/guild\/rewards\/?$/i.test(path)) return "guild-rewards";
  if (/^\/guild\/journal\/?$/i.test(path)) return "guild-journal";
  if (/^\/guild\/notice\/?$/i.test(path)) return "guild-notice";
  if (/^\/guild\/chat\/?$/i.test(path)) return "guild-chat";
  if (/^\/guild\/alliance\/chat\/?$/i.test(path)) return "guild-alliance-chat";
  if (/^\/guild\/members(?:\/page_\d+)?\/?$/i.test(path)) return "guild-members";
  if (/^\/guild\/achievements(?:\/[^/]+)?\/?$/i.test(path)) return "guild-achievements";
  if (/^\/(?:profile|deck|shop|duel|dungeon|arena|equipment|collections|daily|diamondrewards|tournament|urfin|chat|news|msgs|records|settings|forge|online|goblincard)(?:\/.*)?$/i.test(path)) return "system";
  if (/^\/ratings(?:\/.*)?$/i.test(path)) return "system";
  return "other";
}

/** Extracts only same-origin reference pages suitable for a bounded read-only crawl. */
export function extractReferencePageLinks(html: string, sourceUrl: string) {
  const links: ReferenceLink[] = [];
  for (const anchor of extractAnchors(html, sourceUrl)) {
    const url = normalizedReferenceUrl(anchor.href, sourceUrl);
    if (!url || classifyReferencePageUrl(url) === "other") continue;
    if (isReferenceMutationUrl(url)) continue;
    if (links.some((link) => link.url === url)) continue;
    links.push({ label: anchor.text, url });
  }
  return links;
}

function isReferenceMutationUrl(sourceUrl: string) {
  const path = new URL(sourceUrl).pathname.replace(/\/+$/, "") || "/";
  return /^\/(?:api|auth|exit|login|register|user|notif)(?:\/|$)/i.test(path)
    || /^\/chat\/replyto\//i.test(path)
    || /^\/forum\/\d+\/\d+\/page_\d+\/replyto\//i.test(path)
    || /^\/guild\/(?:accept|decline)\//i.test(path)
    || /^\/guild\/notice\/close\//i.test(path)
    || /^\/(?:daily\/reward|diamondrewards\/buyvip)(?:\/|$)/i.test(path);
}

export function parseReferencePageHtml(html: string, sourceUrl: string): ReferencePageDiscovery {
  const title = inlineText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] ?? "");
  return {
    sourceUrl,
    kind: classifyReferencePageUrl(sourceUrl),
    title,
    text: referenceHtmlToText(html),
    links: extractReferencePageLinks(html, sourceUrl),
    assetUrls: extractAssetUrls(html, sourceUrl),
    styleUrls: extractStylesheetUrls(html, sourceUrl),
  };
}

function parseTopicIcon(anchorHtml: string): ForumTopicIcon {
  const src = attributeValue(anchorHtml.match(/<img\b([^>]*)>/i)?.[1] ?? "", "src") ?? "";
  if (src.includes("important-read")) return "important-read";
  if (src.includes("important")) return "important";
  if (src.includes("topic-read")) return "read";
  if (src.includes("forum-topic")) return "unread";
  return "unknown";
}

function parseTopicSummaries(html: string, sourceUrl: string, area: "forum" | "guild") {
  const topics: ForumTopicSummary[] = [];
  for (const anchor of extractAnchors(html, sourceUrl)) {
    const path = new URL(anchor.href).pathname;
    const match = area === "forum"
      ? path.match(/^\/forum\/(\d+)\/(\d+)(?:\/page_\d+)?\/?$/i)
      : path.match(/^\/guildforum\/(\d+)\/(\d+)\/(\d+)(?:\/page_\d+)?\/?$/i);
    if (!match) continue;
    const sectionId = area === "forum" ? parseNumber(match[1]) : parseNumber(match[2]);
    const topicId = area === "forum" ? parseNumber(match[2]) : parseNumber(match[3]);
    const guildId = area === "guild" ? parseNumber(match[1]) : null;
    if (sectionId === null || topicId === null || (area === "guild" && guildId === null)) continue;
    const titleMatch = anchor.html.match(/<span\b[^>]*\bclass\s*=\s*["'][^"']*\bl_ttl\b[^"']*["'][^>]*>([\s\S]*?)<\/span\s*>/i);
    const title = inlineText(titleMatch?.[1] ?? anchor.html);
    if (!title || topics.some((topic) => topic.url === anchor.href)) continue;
    const icon = parseTopicIcon(anchor.html);
    topics.push({
      area,
      sectionId,
      ...(guildId === null ? {} : { guildId }),
      topicId,
      title,
      url: anchor.href,
      pinned: icon === "important" || icon === "important-read" || title.startsWith("📌"),
      icon,
    });
  }
  return topics;
}

function parseTitleFromClass(html: string, className: string) {
  const element = findElementByClass(html, className);
  return element ? inlineText(element.inner) : "";
}

export function parseForumIndexHtml(html: string, sourceUrl = FORUM_REFERENCE_SOURCE_URL): ForumIndexPage {
  const categories: ForumCategory[] = [];
  const pattern = /<div class=["'][^"']*\bl_ttl\b[^"']*["'][^>]*>\s*<a\b([^>]*)>([\s\S]*?)<\/a\s*>\s*<div\b[^>]*class=["'][^"']*\bsmall\b[^"']*["'][^>]*>([\s\S]*?)<\/div\s*>\s*<\/div\s*>/gi;
  for (const match of html.matchAll(pattern)) {
    const href = attributeValue(match[1] ?? "", "href");
    if (!href) continue;
    let url: URL;
    try {
      url = new URL(href, sourceUrl);
    } catch {
      continue;
    }
    const id = parsePath(url.href, /^\/forum\/(\d+)\/?$/i)?.[1];
    const title = inlineText(match[2] ?? "");
    if (!id || !title || categories.some((category) => category.id === Number(id))) continue;
    categories.push({ id: Number(id), title, description: inlineText(match[3] ?? ""), url: url.href });
  }
  return { sourceUrl, categories, assetUrls: extractAssetUrls(html, sourceUrl) };
}

export function parseForumSectionHtml(html: string, sourceUrl: string): ForumSectionPage {
  const id = parsePath(sourceUrl, /^\/forum\/(\d+)(?:\/page_\d+)?\/?$/i)?.[1];
  if (!id) throw new Error("Forum section id is missing");
  const sectionId = Number(id);
  const sectionAnchor = extractAnchors(html, sourceUrl).find((anchor) => new URL(anchor.href).pathname === `/forum/${sectionId}/`);
  const text = inlineText(html);
  const creationRule = referenceHtmlToText(html).split("\n").find((line) => line.startsWith("Создавать новые темы могут")) ?? null;
  return {
    sourceUrl,
    sectionId,
    title: sectionAnchor?.text ?? "",
    currentPage: pageNumber(sourceUrl),
    pageCount: pageCount(html),
    topics: parseTopicSummaries(html, sourceUrl, "forum"),
    creationRule,
    moderators: parseModerators(html, sourceUrl),
    assetUrls: extractAssetUrls(html, sourceUrl),
  };
}

function parsePostBody(blockHtml: string, sourceUrl: string) {
  const body = findElementByClass(blockHtml, "ml8 c_da pt3 clip small");
  return body ?? { start: 0, end: 0, inner: "", html: "" };
}

function parsePosts(html: string, sourceUrl: string) {
  const postWrappers = findElementsByClass(html, "t");
  const posts: ForumPost[] = [];
  for (const wrapper of postWrappers) {
    const postId = parseNumber(wrapper.html.match(/<a\b[^>]*\bid\s*=\s*["'](\d+)["']/i)?.[1]);
    if (postId === null) continue;
    const anchors = extractAnchors(wrapper.html, sourceUrl);
    const author = anchors.find((anchor) => /^\/user\/\d+\/?$/i.test(new URL(anchor.href).pathname));
    const authorId = parseNumber(author ? new URL(author.href).pathname.match(/^\/user\/(\d+)/i)?.[1] : null);
    const body = parsePostBody(wrapper.html, sourceUrl);
    const headerHtml = author ? wrapper.html.slice(author.start + author.html.length, body.start || wrapper.html.length) : wrapper.html;
    const createdAt = inlineText(headerHtml).match(/(?:\d{1,2}\s+\p{L}+(?:\s+\d{2,4})?\s+\d{1,2}:\d{2}|\d{1,2}\s+\p{L}+\s+\d{2,4}|\d{1,2}:\d{2})/iu)?.[0] ?? null;
    const reply = anchors.find((anchor) => /\/replyto\//i.test(new URL(anchor.href).pathname));
    const bodyLinks = extractAnchors(body.inner, sourceUrl)
      .filter((anchor) => anchor.text || !anchor.href.includes("/replyto/"))
      .map((anchor) => ({ label: anchor.text, url: anchor.href }));
    const bodyAssets = extractAssetUrls(body.inner, sourceUrl);
    const headerAssets = extractAssetUrls(headerHtml, sourceUrl);
    const avatar = headerAssets.find((asset) => /\/avatars\//i.test(asset)) ?? headerAssets.find((asset) => /\/cards\//i.test(asset)) ?? null;
    posts.push({
      postId,
      authorId,
      authorName: author?.text ?? "",
      authorUrl: author?.href ?? null,
      authorAvatarUrl: avatar,
      createdAt,
      replyUrl: reply?.href ?? null,
      bodyText: referenceHtmlToText(body.inner),
      links: bodyLinks,
      assetUrls: [...new Set([...bodyAssets, ...headerAssets.filter((asset) => /\/(?:avatars|cards)\//i.test(asset))])],
    });
  }
  return posts;
}

export function parseForumTopicHtml(html: string, sourceUrl: string): ForumTopicPage {
  const path = new URL(sourceUrl).pathname;
  const match = path.match(/^\/forum\/(\d+)\/(\d+)(?:\/page_\d+)?\/?$/i);
  if (!match) throw new Error("Forum topic path is invalid");
  const sectionId = Number(match[1]);
  const topicId = Number(match[2]);
  const sectionAnchor = extractAnchors(html, sourceUrl).find((anchor) => new URL(anchor.href).pathname === `/forum/${sectionId}/`);
  const title = parseTitleFromClass(html, "medium pt2");
  const comments = inlineText(html).match(/Комментариев:\s*([\d\s]+)/iu);
  return {
    sourceUrl,
    area: "forum",
    sectionId,
    topicId,
    sectionTitle: sectionAnchor?.text ?? "",
    title,
    currentPage: pageNumber(sourceUrl),
    pageCount: pageCount(html),
    commentCount: parseNumber(comments?.[1]),
    posts: parsePosts(html, sourceUrl),
    moderators: parseModerators(html, sourceUrl),
    assetUrls: extractAssetUrls(html, sourceUrl),
  };
}

export function parseGuildProfileHtml(html: string, sourceUrl = GUILD_REFERENCE_SAMPLE_URL): GuildProfilePage {
  const guildId = parsePath(sourceUrl, /^\/guild\/(\d+)(?:\/info)?\/?$/i)?.[1];
  if (!guildId) throw new Error("Guild id is missing");
  const pageText = inlineText(html);
  const heading = findElementByClass(html, "fttl blue");
  const headingName = heading ? inlineText(findElementByClass(heading.inner, "rt")?.inner ?? heading.inner) : "";
  const fallbackName = findElementsByClass(html, "c_fe").map((element) => inlineText(element.inner)).find((value) => value && !/^\d/.test(value));
  const name = headingName && headingName !== "Информация о гильдии" ? headingName : fallbackName ?? headingName;
  const infoLink = extractAnchors(html, sourceUrl).find((anchor) => new URL(anchor.href).pathname === `/guild/${guildId}/info/`);
  const level = pageText.match(/(\d+)\s+уровень/iu)?.[1];
  const memberCapacity = pageText.match(/(\d+)\s*\/\s*(\d+)\s*Состав/iu);
  const foundedAt = pageText.match(/Основана\s+(\d{2})·(\d{2})·(\d{4})/iu);
  const allyAnchor = extractAnchors(html, sourceUrl).find((anchor) => {
    const index = html.indexOf(anchor.html);
    return index >= 0 && /Союзник/.test(inlineText(html.slice(Math.max(0, index - 250), index)));
  });
  const combatRating = pageText.match(/Боевой рейтинг:\s*([^\s(]+)/iu)?.[1] ?? null;
  const combatRank = parseNumber(pageText.match(/Боевой рейтинг:[^\n(]*\(№\s*(\d+)\)/iu)?.[1]);
  const combatExperienceRank = parseNumber(pageText.match(/Рейтинг по боевому опыту:\s*№\s*(\d+)/iu)?.[1]);
  const combatExperience = pageText.match(/Боевой опыт:\s*([\d.,]+\s*[TGMK]?)/iu)?.[1]?.replace(/\s+/g, " ") ?? null;
  const bonusesMatch = pageText.match(/Бонусы:\s*([+-]\d+%)\s*([+-]\d+%)/iu);
  const cardPower = parseNumber(html.match(/<span\b[^>]*\bclass\s*=\s*["'][^"']*\bstat\b[^"']*["'][^>]*>([\d\s]+)/i)?.[1]);
  const cardLevel = parseNumber(pageText.match(/(\d+)\s*ур\./iu)?.[1]);
  const relevant = relevantLinks(html, sourceUrl);
  return {
    sourceUrl,
    guildId: Number(guildId),
    name,
    element: html.match(/class=["'][^"']*\bbplace\s+([a-z]+)\b/i)?.[1] ?? html.match(/class=["'][^"']*\bce-([a-z]+)\b/i)?.[1] ?? null,
    level: parseNumber(level),
    foundedAt: foundedAt ? `${foundedAt[3]}-${foundedAt[2]}-${foundedAt[1]}` : null,
    type: pageText.match(/\b(топ-гильдия|обычная гильдия)\b/iu)?.[1] ?? null,
    ally: allyAnchor ? { label: allyAnchor.text, url: allyAnchor.href } : null,
    memberCount: memberCapacity ? parseNumber(memberCapacity[1]) : null,
    memberCapacity: memberCapacity ? parseNumber(memberCapacity[2]) : null,
    combatRating,
    combatRank,
    combatExperienceRank,
    combatExperience,
    bonuses: bonusesMatch ? [bonusesMatch[1]!, bonusesMatch[2]!] : [],
    sampleCardPower: cardPower,
    sampleCardLevel: cardLevel,
    links: relevant.filter((link) => /\/(?:guild|guildforum|ratings)\//i.test(new URL(link.url).pathname)),
    assetUrls: extractAssetUrls(html, sourceUrl),
  };
}

export function parseGuildMembersHtml(html: string, sourceUrl: string): GuildMembersPage {
  const match = parsePath(sourceUrl, /^\/guild\/(\d+)\/members(?:\/page_\d+)?\/?$/i);
  if (!match?.[1]) throw new Error("Guild member path is invalid");
  const guildId = Number(match[1]);
  const members: GuildMember[] = [];
  for (const anchor of extractAnchors(html, sourceUrl)) {
    if (!/^\/user\/\d+\/?$/i.test(new URL(anchor.href).pathname) || !/\bbl\b[^>]*\btdn\b/i.test(anchor.attrs)) continue;
    const position = parseNumber(anchor.html.match(/w20px[^>]*>(\d+)</i)?.[1]);
    const name = inlineText(anchor.html.match(/<span\b[^>]*\bclass\s*=\s*["'][^"']*\bc_66\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? "");
    const experience = inlineText(anchor.html.match(/<span\b[^>]*\bclass\s*=\s*["'][^"']*\bc_99\s+fr\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? "");
    const days = parseNumber(anchor.html.match(/<span\b[^>]*\bclass\s*=\s*["'][^"']*\bfr\s+c_99\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]);
    const rankMatches = [...anchor.html.matchAll(/<span\b[^>]*\bclass\s*=\s*["'][^"']*\bc_99\b[^"']*["'][^>]*>([^<]+)<\/span>/gi)].map((entry) => inlineText(entry[1] ?? "")).filter(Boolean);
    const playerId = parseNumber(new URL(anchor.href).pathname.match(/^\/user\/(\d+)/i)?.[1]);
    if (position === null || playerId === null || !name) continue;
    members.push({
      position,
      playerId,
      name,
      guildExperience: experience || null,
      daysInGuild: days,
      rank: rankMatches.at(-1) ?? null,
      profileUrl: anchor.href,
    });
  }
  return {
    sourceUrl,
    guildId,
    currentPage: pageNumber(sourceUrl),
    pageCount: pageCount(html),
    members,
    assetUrls: extractAssetUrls(html, sourceUrl),
  };
}

function achievementMode(sourceUrl: string): GuildAchievementMode {
  const path = new URL(sourceUrl).pathname;
  if (path.endsWith("/gwars/")) return "wars";
  if (path.endsWith("/garena/")) return "arena";
  if (path.endsWith("/graids/")) return "raids";
  if (path.endsWith("/ffights/")) return "fun-fights";
  return "unknown";
}

export function parseGuildAchievementsHtml(html: string, sourceUrl: string): GuildAchievementsPage {
  const guildId = parsePath(sourceUrl, /^\/guild\/(\d+)\/achievements\//i)?.[1];
  if (!guildId) throw new Error("Guild achievement path is invalid");
  const entries: GuildAchievementEntry[] = [];
  for (const match of html.matchAll(/<div\b[^>]*class=["']cntr\s+small\s+c_99\s+mt20["'][^>]*>([\s\S]*?)<\/div\s*>/gi)) {
    const inner = match[1] ?? "";
    entries.push({ text: referenceHtmlToText(inner), assetUrls: extractAssetUrls(inner, sourceUrl) });
  }
  const raidTrophies: { cardClass: string; count: number }[] = [];
  for (const match of html.matchAll(/<div\b[^>]*class=["'][^"']*\bpix\s+([^"']*\braid_trophy\b[^"']*)["'][^>]*>[\s\S]*?<\/div\s*>\s*<\/span\s*>\s*<br\s*\/?>\s*([\d\s]+)\s*шт\.?/gi)) {
    const count = parseNumber(match[2]);
    if (count !== null) raidTrophies.push({ cardClass: match[1]!.trim(), count });
  }
  const text = inlineText(html);
  const title = parseTitleFromClass(html, "fttl green") || (text.match(/Достижения гильдии/)?.[0] ?? "Достижения гильдии");
  return {
    sourceUrl,
    guildId: Number(guildId),
    mode: achievementMode(sourceUrl),
    title,
    entries,
    raidTrophies,
    raidStats: {
      maxSorceressLevel: parseNumber(text.match(/Максимальный уровень\s*побежденных колдуний:\s*(\d+)/iu)?.[1]),
      defeatedSorceresses: parseNumber(text.match(/Всего побеждено колдуний:\s*(\d+)/iu)?.[1]),
    },
    assetUrls: extractAssetUrls(html, sourceUrl),
  };
}

export function parseGuildForumIndexHtml(html: string, sourceUrl = GUILD_FORUM_REFERENCE_SOURCE_URL): GuildForumIndexPage {
  const guildId = parsePath(sourceUrl, /^\/guildforum\/(\d+)\/?$/i)?.[1];
  if (!guildId) throw new Error("Guild forum id is missing");
  const sections: GuildForumSection[] = [];
  for (const anchor of extractAnchors(html, sourceUrl)) {
    const match = new URL(anchor.href).pathname.match(/^\/guildforum\/(\d+)\/(\d+)\/?$/i);
    if (!match || Number(match[1]) !== Number(guildId) || sections.some((section) => section.forumId === Number(match[2]))) continue;
    const index = html.indexOf(anchor.html);
    const nearbyText = inlineText(html.slice(index, index + 800));
    sections.push({
      guildId: Number(guildId),
      forumId: Number(match[2]),
      title: anchor.text,
      url: anchor.href,
      access: nearbyText.match(/Доступен[^\n»]*/iu)?.[0] ?? (inlineText(html).includes("Доступен всем") ? "Доступен всем" : null),
    });
  }
  return { sourceUrl, guildId: Number(guildId), sections, assetUrls: extractAssetUrls(html, sourceUrl) };
}

export function parseGuildForumSectionHtml(html: string, sourceUrl: string): ForumSectionPage {
  const match = parsePath(sourceUrl, /^\/guildforum\/(\d+)\/(\d+)(?:\/page_\d+)?\/?$/i);
  if (!match?.[1] || !match[2]) throw new Error("Guild forum section path is invalid");
  const guildId = Number(match[1]);
  const sectionId = Number(match[2]);
  const text = inlineText(html);
  const title = text.match(/Форум\s+»\s+([^»\n]+)/iu)?.[1]?.trim() ?? "";
  const creationRule = referenceHtmlToText(html).split("\n").find((line) => line.startsWith("Создавать новые темы могут")) ?? null;
  return {
    sourceUrl,
    sectionId,
    title,
    currentPage: pageNumber(sourceUrl),
    pageCount: pageCount(html),
    topics: parseTopicSummaries(html, sourceUrl, "guild").map((topic) => ({ ...topic, guildId })),
    creationRule,
    moderators: parseModerators(html, sourceUrl),
    assetUrls: extractAssetUrls(html, sourceUrl),
  };
}

export function parseGuildForumTopicHtml(html: string, sourceUrl: string): ForumTopicPage {
  const match = new URL(sourceUrl).pathname.match(/^\/guildforum\/(\d+)\/(\d+)\/(\d+)(?:\/page_\d+)?\/?$/i);
  if (!match) throw new Error("Guild forum topic path is invalid");
  const guildId = Number(match[1]);
  const sectionId = Number(match[2]);
  const topicId = Number(match[3]);
  const text = inlineText(html);
  const sectionTitle = text.match(/Форум\s+»\s+([^»\n]+)/iu)?.[1]?.trim() ?? "";
  const title = parseTitleFromClass(html, "medium pt2");
  const comments = text.match(/Комментариев:\s*([\d\s]+)/iu);
  return {
    sourceUrl,
    area: "guild",
    sectionId,
    guildId,
    topicId,
    sectionTitle,
    title,
    currentPage: pageNumber(sourceUrl),
    pageCount: pageCount(html),
    commentCount: parseNumber(comments?.[1]),
    posts: parsePosts(html, sourceUrl),
    moderators: parseModerators(html, sourceUrl),
    assetUrls: extractAssetUrls(html, sourceUrl),
  };
}
