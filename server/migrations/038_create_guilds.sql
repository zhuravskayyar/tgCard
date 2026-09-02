CREATE TABLE guilds (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
  emblem_id TEXT NOT NULL DEFAULT 'shield-1' CHECK (char_length(emblem_id) BETWEEN 1 AND 64),
  language TEXT NOT NULL DEFAULT 'uk' CHECK (language IN ('uk', 'ru', 'en', 'de', 'other')),
  recruitment_mode TEXT NOT NULL DEFAULT 'open' CHECK (recruitment_mode IN ('open', 'application', 'closed')),
  theme_element TEXT CHECK (theme_element IS NULL OR theme_element IN ('fire', 'water', 'air', 'earth')),
  level INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 20),
  experience BIGINT NOT NULL DEFAULT 0 CHECK (experience >= 0),
  min_player_level INTEGER NOT NULL DEFAULT 10 CHECK (min_player_level BETWEEN 10 AND 120),
  created_by UUID NOT NULL REFERENCES players(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX guilds_browse_idx
  ON guilds (recruitment_mode, level DESC, updated_at DESC, name_key);

CREATE TABLE guild_members (
  guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  player_id UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('leader', 'officer', 'veteran', 'member', 'newbie')),
  contributed_xp BIGINT NOT NULL DEFAULT 0 CHECK (contributed_xp >= 0),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX guild_members_guild_idx
  ON guild_members (guild_id, role, joined_at, player_id);

CREATE TABLE guild_xp_contributions (
  id UUID PRIMARY KEY,
  guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'duel_win', 'duel_loss', 'campaign_win', 'dungeon_complete',
    'arena_place_1', 'arena_place_2', 'arena_place_3', 'arena_place_4_6'
  )),
  source_id TEXT NOT NULL CHECK (char_length(source_id) BETWEEN 1 AND 160),
  xp INTEGER NOT NULL CHECK (xp > 0),
  contribution_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_id, activity_type, source_id)
);

CREATE INDEX guild_xp_contributions_daily_idx
  ON guild_xp_contributions (player_id, contribution_date, created_at DESC);

CREATE INDEX guild_xp_contributions_activity_idx
  ON guild_xp_contributions (guild_id, contribution_date, created_at DESC);

CREATE TABLE guild_applications (
  id UUID PRIMARY KEY,
  guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  message TEXT NOT NULL DEFAULT '' CHECK (char_length(message) <= 500),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  decided_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX guild_applications_one_pending_player_idx
  ON guild_applications (player_id)
  WHERE status = 'pending';

CREATE UNIQUE INDEX guild_applications_one_pending_guild_idx
  ON guild_applications (guild_id, player_id)
  WHERE status = 'pending';

CREATE INDEX guild_applications_pending_guild_idx
  ON guild_applications (guild_id, created_at)
  WHERE status = 'pending';

CREATE TABLE guild_cooldowns (
  id UUID PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  guild_id UUID REFERENCES guilds(id) ON DELETE CASCADE,
  cooldown_type TEXT NOT NULL CHECK (cooldown_type IN ('left', 'kicked', 'rejected')),
  available_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX guild_cooldowns_global_idx
  ON guild_cooldowns (player_id, cooldown_type)
  WHERE guild_id IS NULL;

CREATE UNIQUE INDEX guild_cooldowns_guild_idx
  ON guild_cooldowns (player_id, guild_id, cooldown_type)
  WHERE guild_id IS NOT NULL;

CREATE INDEX guild_cooldowns_lookup_idx
  ON guild_cooldowns (player_id, available_at);
