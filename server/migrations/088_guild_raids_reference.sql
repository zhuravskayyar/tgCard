-- Guild raids from the reference (docs/reference-elem-raids.md): guild levels up to 55,
-- dragon lairs, witch treasures, daily altar potions.

-- Guild levels go up to 55 (witch raids and the altar open at 34, war at 35).
ALTER TABLE guilds DROP CONSTRAINT IF EXISTS guilds_level_check;
ALTER TABLE guilds ADD CONSTRAINT guilds_level_check CHECK (level BETWEEN 1 AND 55);

-- Journal entries for raids and lair upgrades.
ALTER TABLE guild_activity_log DROP CONSTRAINT IF EXISTS guild_activity_log_event_type_check;
ALTER TABLE guild_activity_log ADD CONSTRAINT guild_activity_log_event_type_check CHECK (event_type IN (
  'guild_created', 'member_joined', 'member_left', 'member_kicked', 'role_changed',
  'application_accepted', 'application_rejected', 'xp_contributed', 'treasury_contributed',
  'announcement_updated', 'guild_card_upgraded',
  'dragon_raid_won', 'dragon_raid_lost', 'dragon_lair_upgraded', 'witch_raid_won'
));

-- Lair level per guild (1–20) and how many dragons the guild beat there.
CREATE TABLE guild_dragon_lairs (
  guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  lair_code TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 20),
  defeated_count INTEGER NOT NULL DEFAULT 0 CHECK (defeated_count >= 0),
  PRIMARY KEY (guild_id, lair_code)
);

-- One live raid per guild and lair; it resets right after a victory or a defeat.
CREATE TABLE guild_dragon_raids (
  id UUID PRIMARY KEY,
  guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  lair_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'active')),
  max_health BIGINT NOT NULL CHECK (max_health > 0),
  current_health BIGINT NOT NULL CHECK (current_health >= 0),
  started_at TIMESTAMPTZ,
  last_breath_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (guild_id, lair_code)
);

-- A player may be enrolled in only one dragon raid at a time.
CREATE TABLE guild_dragon_raid_participants (
  raid_id UUID NOT NULL REFERENCES guild_dragon_raids(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'enrolled' CHECK (status IN ('enrolled', 'active', 'defeated')),
  damage_total BIGINT NOT NULL DEFAULT 0 CHECK (damage_total >= 0),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (raid_id, player_id),
  UNIQUE (player_id)
);

CREATE TABLE guild_dragon_raid_battles (
  id UUID PRIMARY KEY,
  raid_id UUID NOT NULL REFERENCES guild_dragon_raids(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'won', 'lost')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  player_snapshot JSONB NOT NULL,
  player_hp BIGINT NOT NULL CHECK (player_hp >= 0),
  player_max_hp BIGINT NOT NULL CHECK (player_max_hp > 0),
  player_active_slots JSONB NOT NULL,
  player_reserve_queue JSONB NOT NULL,
  dragon_active_slots JSONB NOT NULL,
  dragon_reserve_queue JSONB NOT NULL,
  battle_log JSONB NOT NULL DEFAULT '[]'::jsonb,
  turn_number INTEGER NOT NULL DEFAULT 0,
  card_changes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  UNIQUE (raid_id, player_id)
);

-- Dragon slayer points belong to the guild where they were earned.
CREATE TABLE guild_dragon_slayer_points (
  guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  points BIGINT NOT NULL DEFAULT 0 CHECK (points >= 0),
  PRIMARY KEY (guild_id, player_id)
);

-- After a victory the dragon respawns for each participant; the timer follows them to a new guild.
CREATE TABLE player_dragon_respawns (
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  lair_code TEXT NOT NULL,
  available_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (player_id, lair_code)
);

CREATE TABLE guild_dragon_raid_results (
  id UUID PRIMARY KEY,
  guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  lair_code TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('won', 'lost')),
  leader_name TEXT,
  winner_player_id UUID REFERENCES players(id) ON DELETE SET NULL,
  winner_name TEXT,
  reward_card JSONB,
  mail_id UUID,
  participants JSONB NOT NULL DEFAULT '[]'::jsonb,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX guild_dragon_raid_results_lair_idx ON guild_dragon_raid_results (guild_id, lair_code, completed_at DESC);

-- Witches: healing happens at most once per threshold per raid level, shared by all participants.
ALTER TABLE guild_witch_raids ADD COLUMN IF NOT EXISTS heal_thresholds JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Witches: extra cards (the guild card) take part and count towards the player's HP.
ALTER TABLE guild_witch_raid_battles ADD COLUMN IF NOT EXISTS player_guild_card JSONB;

-- Witches: after each defeated pair one random participant may dig the treasure until the week ends.
CREATE TABLE guild_witch_treasures (
  id UUID PRIMARY KEY,
  guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  result_id UUID NOT NULL,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  week_key DATE NOT NULL,
  level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 25),
  status TEXT NOT NULL DEFAULT 'offered' CHECK (status IN ('offered', 'digging', 'claimed', 'declined', 'expired')),
  offered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dig_started_at TIMESTAMPTZ,
  dig_ends_at TIMESTAMPTZ,
  reward JSONB,
  mail_id UUID,
  resolved_at TIMESTAMPTZ,
  UNIQUE (result_id)
);
CREATE INDEX guild_witch_treasures_player_idx ON guild_witch_treasures (player_id, offered_at DESC);

ALTER TABLE guild_witch_raid_results ADD COLUMN IF NOT EXISTS treasure_player_id UUID REFERENCES players(id) ON DELETE SET NULL;
ALTER TABLE guild_witch_raid_results ADD COLUMN IF NOT EXISTS treasure_player_name TEXT;

-- Mail can carry a card with a fixed bonus (witch treasure card: +1820).
ALTER TABLE player_mail ADD COLUMN IF NOT EXISTS card_bonus_power INTEGER CHECK (card_bonus_power IS NULL OR card_bonus_power >= 0);

-- Altar potions last until the end of the UTC day.
CREATE TABLE player_altar_potions (
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  potion_day DATE NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('gold', 'silver')),
  hp_pct NUMERIC(6, 2) NOT NULL CHECK (hp_pct >= 0),
  bought_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, potion_day, currency)
);

-- Raid chats (reference: each dragon lair and the witch raid have their own chat).
CREATE TABLE guild_raid_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (char_length(channel) BETWEEN 1 AND 32),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 240),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX guild_raid_chat_messages_channel_idx ON guild_raid_chat_messages (guild_id, channel, created_at DESC, id DESC);
CREATE INDEX guild_raid_chat_messages_player_idx ON guild_raid_chat_messages (player_id, created_at DESC);

-- Dragon raid victories pay XP that also goes to the guild.
ALTER TABLE guild_xp_contributions DROP CONSTRAINT IF EXISTS guild_xp_contributions_activity_type_check;
ALTER TABLE guild_xp_contributions ADD CONSTRAINT guild_xp_contributions_activity_type_check CHECK (activity_type IN (
  'duel_win', 'duel_loss', 'campaign_win', 'campaign_loss', 'tournament_battle', 'dragon_raid', 'dungeon_complete',
  'arena_place_1', 'arena_place_2', 'arena_place_3', 'arena_place_4_6'
));
ALTER TABLE guild_activity_log DROP CONSTRAINT IF EXISTS guild_activity_log_activity_type_check;
ALTER TABLE guild_activity_log ADD CONSTRAINT guild_activity_log_activity_type_check CHECK (activity_type IS NULL OR activity_type IN (
  'duel_win', 'duel_loss', 'campaign_win', 'campaign_loss', 'tournament_battle', 'dragon_raid', 'dungeon_complete',
  'arena_place_1', 'arena_place_2', 'arena_place_3', 'arena_place_4_6'
));
