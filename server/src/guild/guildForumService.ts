import type {
  GuildForumIndexResponse,
  GuildForumPostView,
  GuildForumSectionResponse,
  GuildForumSectionView,
  GuildForumTopicResponse,
  GuildForumTopicView,
  GuildRole,
} from "@cardastika/shared";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import { GuildDomainError } from "./guildService.js";
import { randomUUID } from "node:crypto";

type ForumClient = Pick<PoolClient, "query">;
const FORUM_PAGE_SIZE = 20;

interface SectionRow extends QueryResultRow {
  description: string;
  id: string;
  title: string;
  topic_count: string | number;
  unread_count: string | number;
  visibility: "public" | "private";
}

interface TopicRow extends QueryResultRow {
  author_name: string;
  id: string;
  last_post_at: string | Date;
  locked: boolean;
  pinned: boolean;
  reply_count: string | number;
  section_id: string;
  title: string;
  unread: boolean;
}

interface PostRow extends QueryResultRow {
  author_name: string;
  author_role: GuildRole | null;
  body: string;
  created_at: string | Date;
  edited_at: string | Date | null;
  id: string;
}

function toInt(value: string | number) {
  return typeof value === "number" ? value : Number(value);
}

function toIso(value: string | Date) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function pageValue(value: number | undefined) {
  return Math.max(1, Math.trunc(value ?? 1));
}

function sectionView(row: SectionRow): GuildForumSectionView {
  return {
    description: row.description,
    id: row.id,
    title: row.title,
    topicCount: toInt(row.topic_count),
    unreadCount: toInt(row.unread_count),
    visibility: row.visibility,
  };
}

function topicView(row: TopicRow): GuildForumTopicView {
  return {
    authorName: row.author_name,
    id: row.id,
    lastPostAt: toIso(row.last_post_at),
    locked: row.locked,
    pinned: row.pinned,
    replyCount: toInt(row.reply_count),
    sectionId: row.section_id,
    title: row.title,
    unread: Boolean(row.unread),
  };
}

export class GuildForumService {
  constructor(private readonly pool: Pick<Pool, "connect">) {}

  async index(viewerId: string, guildId: string): Promise<GuildForumIndexResponse> {
    const client = await this.pool.connect();
    try {
      await this.assertGuild(client, guildId);
      await this.ensureDefaultSections(client, guildId);
      const role = await this.memberRole(client, viewerId, guildId);
      const result = await client.query<SectionRow>(
        `SELECT s.id, s.title, s.description, s.visibility,
          COUNT(t.id)::int AS topic_count,
          COUNT(t.id) FILTER (WHERE EXISTS (
            SELECT 1 FROM guild_forum_reads r
            WHERE r.player_id = $2 AND r.topic_id = t.id AND r.read_at >= t.last_post_at
          ))::int AS read_count,
          COUNT(t.id)::int - COUNT(t.id) FILTER (WHERE EXISTS (
            SELECT 1 FROM guild_forum_reads r
            WHERE r.player_id = $2 AND r.topic_id = t.id AND r.read_at >= t.last_post_at
          ))::int AS unread_count
         FROM guild_forum_sections s
         LEFT JOIN guild_forum_topics t ON t.section_id = s.id
         WHERE s.guild_id = $1
         GROUP BY s.id ORDER BY s.sort_order, s.created_at`,
        [guildId, viewerId],
      );
      return {
        sections: result.rows.map((row) => {
          const view = sectionView(row);
          return !role && view.visibility === "private" ? { ...view, topicCount: 0, unreadCount: 0 } : view;
        }),
        viewer: { canModerate: role === "leader" || role === "officer", canPost: Boolean(role), isMember: Boolean(role) },
      };
    } finally {
      client.release();
    }
  }

  async section(viewerId: string, guildId: string, sectionId: string, requestedPage = 1): Promise<GuildForumSectionResponse> {
    const client = await this.pool.connect();
    try {
      const role = await this.memberRole(client, viewerId, guildId);
      const section = await this.loadSection(client, guildId, sectionId);
      this.assertReadable(section.visibility, role);
      const page = pageValue(requestedPage);
      const totalResult = await client.query<{ total: string }>("SELECT COUNT(*)::int AS total FROM guild_forum_topics WHERE section_id = $1", [sectionId]);
      const totalTopics = toInt(totalResult.rows[0]?.total ?? 0);
      const result = await client.query<TopicRow>(
        `SELECT t.id, t.section_id, t.title, t.pinned, t.locked, t.last_post_at,
          COALESCE(p.nickname, NULLIF(p.username, ''), p.first_name) AS author_name,
          GREATEST(COUNT(fp.id)::int - 1, 0) AS reply_count,
          NOT EXISTS (
            SELECT 1 FROM guild_forum_reads r
            WHERE r.player_id = $2 AND r.topic_id = t.id AND r.read_at >= t.last_post_at
          ) AS unread
         FROM guild_forum_topics t
         INNER JOIN players p ON p.id = t.author_id
         LEFT JOIN guild_forum_posts fp ON fp.topic_id = t.id
         WHERE t.section_id = $1
         GROUP BY t.id, p.id
         ORDER BY t.pinned DESC, t.last_post_at DESC, t.id DESC
         LIMIT $3 OFFSET $4`,
        [sectionId, viewerId, FORUM_PAGE_SIZE, (page - 1) * FORUM_PAGE_SIZE],
      );
      return {
        page,
        pageSize: FORUM_PAGE_SIZE,
        section: this.withViewerSection(section, role),
        topics: result.rows.map(topicView),
        totalPages: Math.max(1, Math.ceil(totalTopics / FORUM_PAGE_SIZE)),
        totalTopics,
        viewer: { canPost: Boolean(role) },
      };
    } finally {
      client.release();
    }
  }

  async topic(viewerId: string, guildId: string, topicId: string, requestedPage = 1): Promise<GuildForumTopicResponse> {
    const client = await this.pool.connect();
    try {
      const role = await this.memberRole(client, viewerId, guildId);
      const topicResult = await client.query<TopicRow & { section_visibility: "public" | "private" }>(
        `SELECT t.id, t.section_id, t.title, t.pinned, t.locked, t.last_post_at,
          s.visibility AS section_visibility,
          COALESCE(p.nickname, NULLIF(p.username, ''), p.first_name) AS author_name,
          GREATEST((SELECT COUNT(*)::int FROM guild_forum_posts fp WHERE fp.topic_id = t.id) - 1, 0) AS reply_count,
          NOT EXISTS (
            SELECT 1 FROM guild_forum_reads r
            WHERE r.player_id = $2 AND r.topic_id = t.id AND r.read_at >= t.last_post_at
          ) AS unread
         FROM guild_forum_topics t
         INNER JOIN guild_forum_sections s ON s.id = t.section_id AND s.guild_id = $1
         INNER JOIN players p ON p.id = t.author_id
         WHERE t.id = $3`,
        [guildId, viewerId, topicId],
      );
      const topic = topicResult.rows[0];
      if (!topic) throw new GuildDomainError("forum_topic_not_found", "Forum topic does not exist", 404);
      this.assertReadable(topic.section_visibility, role);
      await this.markReadWithClient(client, viewerId, topicId);
      const page = pageValue(requestedPage);
      const totalResult = await client.query<{ total: string }>("SELECT COUNT(*)::int AS total FROM guild_forum_posts WHERE topic_id = $1", [topicId]);
      const totalPosts = toInt(totalResult.rows[0]?.total ?? 0);
      const postsResult = await client.query<PostRow>(
        `SELECT fp.id, fp.body, fp.created_at, fp.edited_at,
          COALESCE(p.nickname, NULLIF(p.username, ''), p.first_name) AS author_name,
          gm.role AS author_role
         FROM guild_forum_posts fp
         INNER JOIN players p ON p.id = fp.author_id
         LEFT JOIN guild_forum_topics ft ON ft.id = fp.topic_id
         LEFT JOIN guild_members gm ON gm.guild_id = $1 AND gm.player_id = fp.author_id
         WHERE fp.topic_id = $2
         ORDER BY fp.created_at ASC, fp.id ASC
         LIMIT $3 OFFSET $4`,
        [guildId, topicId, FORUM_PAGE_SIZE, (page - 1) * FORUM_PAGE_SIZE],
      );
      return {
        page,
        pageSize: FORUM_PAGE_SIZE,
        posts: postsResult.rows.map((row): GuildForumPostView => ({
          authorName: row.author_name,
          authorRole: row.author_role,
          body: row.body,
          createdAt: toIso(row.created_at),
          editedAt: row.edited_at ? toIso(row.edited_at) : null,
          id: row.id,
        })),
        title: topic.title,
        topic: topicView(topic),
        totalPages: Math.max(1, Math.ceil(totalPosts / FORUM_PAGE_SIZE)),
        totalPosts,
        viewer: { canModerate: role === "leader" || role === "officer", canReply: Boolean(role) && !topic.locked },
      };
    } finally {
      client.release();
    }
  }

  async createTopic(viewerId: string, guildId: string, sectionId: string, title: string, body: string) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const role = await this.memberRole(client, viewerId, guildId);
      if (!role) throw new GuildDomainError("guild_permission_denied", "Only guild members can post", 403);
      const section = await this.loadSection(client, guildId, sectionId);
      this.assertReadable(section.visibility, role);
      const cleanTitle = title.normalize("NFKC").trim();
      const cleanBody = body.normalize("NFKC").trim();
      if (cleanTitle.length < 3 || cleanTitle.length > 80) throw new GuildDomainError("forum_title_invalid", "Topic title must be 3–80 characters", 400);
      if (!cleanBody || cleanBody.length > 4000) throw new GuildDomainError("forum_body_invalid", "Post must be 1–4000 characters", 400);
      const topicId = randomUUID();
      await client.query("INSERT INTO guild_forum_topics (id, section_id, author_id, title) VALUES ($1, $2, $3, $4)", [topicId, sectionId, viewerId, cleanTitle]);
      await client.query("INSERT INTO guild_forum_posts (id, topic_id, author_id, body) VALUES ($1, $2, $3, $4)", [randomUUID(), topicId, viewerId, cleanBody]);
      await this.markReadWithClient(client, viewerId, topicId);
      await client.query("COMMIT");
      return this.topic(viewerId, guildId, topicId);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof GuildDomainError) throw error;
      throw error;
    } finally {
      client.release();
    }
  }

  async createPost(viewerId: string, guildId: string, topicId: string, body: string) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const role = await this.memberRole(client, viewerId, guildId);
      if (!role) throw new GuildDomainError("guild_permission_denied", "Only guild members can post", 403);
      const topicResult = await client.query<{ id: string; locked: boolean }>(
        `SELECT t.id, t.locked FROM guild_forum_topics t
         INNER JOIN guild_forum_sections s ON s.id = t.section_id AND s.guild_id = $1
         WHERE t.id = $2 FOR UPDATE`,
        [guildId, topicId],
      );
      const topic = topicResult.rows[0];
      if (!topic) throw new GuildDomainError("forum_topic_not_found", "Forum topic does not exist", 404);
      if (topic.locked) throw new GuildDomainError("forum_topic_locked", "This topic is locked", 409);
      const cleanBody = body.normalize("NFKC").trim();
      if (!cleanBody || cleanBody.length > 4000) throw new GuildDomainError("forum_body_invalid", "Post must be 1–4000 characters", 400);
      await client.query("INSERT INTO guild_forum_posts (id, topic_id, author_id, body) VALUES ($1, $2, $3, $4)", [randomUUID(), topicId, viewerId, cleanBody]);
      await client.query("UPDATE guild_forum_topics SET last_post_at = NOW() WHERE id = $1", [topicId]);
      await this.markReadWithClient(client, viewerId, topicId);
      await client.query("COMMIT");
      return this.topic(viewerId, guildId, topicId);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof GuildDomainError) throw error;
      throw error;
    } finally {
      client.release();
    }
  }

  async markRead(viewerId: string, guildId: string, topicId: string) {
    const client = await this.pool.connect();
    try {
      const role = await this.memberRole(client, viewerId, guildId);
      const result = await client.query<{ visibility: "public" | "private" }>(
        `SELECT s.visibility FROM guild_forum_topics t INNER JOIN guild_forum_sections s ON s.id = t.section_id AND s.guild_id = $1 WHERE t.id = $2`,
        [guildId, topicId],
      );
      const row = result.rows[0];
      if (!row) throw new GuildDomainError("forum_topic_not_found", "Forum topic does not exist", 404);
      this.assertReadable(row.visibility, role);
      await this.markReadWithClient(client, viewerId, topicId);
      return { read: true };
    } finally {
      client.release();
    }
  }

  async setTopicState(viewerId: string, guildId: string, topicId: string, pinned?: boolean, locked?: boolean) {
    const client = await this.pool.connect();
    try {
      const role = await this.memberRole(client, viewerId, guildId);
      if (role !== "leader" && role !== "officer") throw new GuildDomainError("guild_permission_denied", "Only officers can moderate the forum", 403);
      if (pinned === undefined && locked === undefined) throw new GuildDomainError("forum_state_empty", "Forum state is empty", 400);
      const values: unknown[] = [topicId, guildId];
      const assignments: string[] = [];
      if (pinned !== undefined) { values.push(pinned); assignments.push(`pinned = $${values.length}`); }
      if (locked !== undefined) { values.push(locked); assignments.push(`locked = $${values.length}`); }
      const result = await client.query<{ id: string }>(
        `UPDATE guild_forum_topics t SET ${assignments.join(", ")}
         FROM guild_forum_sections s
         WHERE t.id = $1 AND s.id = t.section_id AND s.guild_id = $2 RETURNING t.id`,
        values,
      );
      if (result.rowCount !== 1) throw new GuildDomainError("forum_topic_not_found", "Forum topic does not exist", 404);
      return this.topic(viewerId, guildId, topicId);
    } finally {
      client.release();
    }
  }

  private async assertGuild(client: ForumClient, guildId: string) {
    const result = await client.query("SELECT id FROM guilds WHERE id = $1", [guildId]);
    if (result.rowCount !== 1) throw new GuildDomainError("guild_not_found", "Guild does not exist", 404);
  }

  private async memberRole(client: ForumClient, playerId: string, guildId: string): Promise<GuildRole | null> {
    const result = await client.query<{ role: GuildRole }>("SELECT role FROM guild_members WHERE player_id = $1 AND guild_id = $2", [playerId, guildId]);
    return result.rows[0]?.role ?? null;
  }

  private async loadSection(client: ForumClient, guildId: string, sectionId: string) {
    const result = await client.query<SectionRow>(
      `SELECT s.id, s.title, s.description, s.visibility,
        COUNT(t.id)::int AS topic_count, 0::int AS unread_count
       FROM guild_forum_sections s LEFT JOIN guild_forum_topics t ON t.section_id = s.id
       WHERE s.guild_id = $1 AND s.id = $2 GROUP BY s.id`,
      [guildId, sectionId],
    );
    const row = result.rows[0];
    if (!row) throw new GuildDomainError("forum_section_not_found", "Forum section does not exist", 404);
    return row;
  }

  private withViewerSection(section: SectionRow, role: GuildRole | null) {
    const view = sectionView(section);
    return !role && view.visibility === "private" ? { ...view, topicCount: 0, unreadCount: 0 } : view;
  }

  private assertReadable(visibility: "public" | "private", role: GuildRole | null) {
    if (visibility === "private" && !role) throw new GuildDomainError("forum_private", "This forum is available to guild members only", 403);
  }

  private async ensureDefaultSections(client: ForumClient, guildId: string) {
    await client.query(
      `INSERT INTO guild_forum_sections (id, guild_id, slug, title, description, visibility, sort_order)
       VALUES ($1, $2, 'welcome', 'Гостьова зала', 'Новини та знайомство. Видно всім мандрівникам.', 'public', 10),
              ($3, $2, 'inner', 'Внутрішня зала', 'Тактика, плани та розмови учасників.', 'private', 20)
       ON CONFLICT (guild_id, slug) DO NOTHING`,
      [randomUUID(), guildId, randomUUID()],
    );
  }

  private async markReadWithClient(client: ForumClient, playerId: string, topicId: string) {
    await client.query(
      `INSERT INTO guild_forum_reads (player_id, topic_id, read_at) VALUES ($1, $2, NOW())
       ON CONFLICT (player_id, topic_id) DO UPDATE SET read_at = NOW()`,
      [playerId, topicId],
    );
  }
}
