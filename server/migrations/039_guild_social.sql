CREATE TABLE guild_announcements (
  id UUID PRIMARY KEY,
  guild_id UUID NOT NULL UNIQUE REFERENCES guilds(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES players(id),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 280),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE guild_activity_log (
  id UUID PRIMARY KEY,
  guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'guild_created', 'member_joined', 'member_left', 'member_kicked',
    'role_changed', 'application_accepted', 'application_rejected',
    'xp_contributed', 'announcement_updated'
  )),
  actor_id UUID REFERENCES players(id) ON DELETE SET NULL,
  target_id UUID REFERENCES players(id) ON DELETE SET NULL,
  activity_type TEXT CHECK (activity_type IS NULL OR activity_type IN (
    'duel_win', 'duel_loss', 'campaign_win', 'dungeon_complete',
    'arena_place_1', 'arena_place_2', 'arena_place_3', 'arena_place_4_6'
  )),
  amount INTEGER CHECK (amount IS NULL OR amount >= 0),
  detail TEXT NOT NULL DEFAULT '' CHECK (char_length(detail) <= 280),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX guild_activity_log_recent_idx
  ON guild_activity_log (guild_id, created_at DESC);

CREATE TABLE guild_forum_sections (
  id UUID PRIMARY KEY,
  guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9-]{2,40}$'),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 2 AND 80),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 240),
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('public', 'private')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (guild_id, slug)
);

CREATE INDEX guild_forum_sections_order_idx
  ON guild_forum_sections (guild_id, sort_order, created_at);

CREATE TABLE guild_forum_topics (
  id UUID PRIMARY KEY,
  section_id UUID NOT NULL REFERENCES guild_forum_sections(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES players(id),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 80),
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  locked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_post_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX guild_forum_topics_section_idx
  ON guild_forum_topics (section_id, pinned DESC, last_post_at DESC);

CREATE TABLE guild_forum_posts (
  id UUID PRIMARY KEY,
  topic_id UUID NOT NULL REFERENCES guild_forum_topics(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES players(id),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at TIMESTAMPTZ
);

CREATE INDEX guild_forum_posts_topic_idx
  ON guild_forum_posts (topic_id, created_at, id);

CREATE TABLE guild_forum_reads (
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES guild_forum_topics(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, topic_id)
);
