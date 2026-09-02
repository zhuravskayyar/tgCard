ALTER TABLE guild_witch_raids
  ADD COLUMN week_key DATE NOT NULL DEFAULT date_trunc('week', CURRENT_DATE)::date,
  ADD COLUMN started_at TIMESTAMPTZ,
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE guild_witch_raid_bosses
  ADD COLUMN max_health INTEGER NOT NULL DEFAULT 450000 CHECK (max_health > 0),
  ADD COLUMN current_health INTEGER NOT NULL DEFAULT 450000 CHECK (current_health >= 0),
  ADD COLUMN witch_deck JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE guild_witch_raid_participants (
  raid_id UUID NOT NULL REFERENCES guild_witch_raids(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'enrolled' CHECK (status IN ('enrolled', 'active', 'defeated', 'finished')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (raid_id, player_id)
);

CREATE INDEX guild_witch_raid_participants_leader_idx
  ON guild_witch_raid_participants (raid_id, status, last_activity_at);

CREATE TABLE guild_witch_raid_battles (
  id UUID PRIMARY KEY,
  raid_id UUID NOT NULL REFERENCES guild_witch_raids(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  raid_level INTEGER NOT NULL CHECK (raid_level BETWEEN 1 AND 25),
  status TEXT NOT NULL CHECK (status IN ('active', 'won', 'lost')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  player_snapshot JSONB NOT NULL,
  player_hp INTEGER NOT NULL CHECK (player_hp >= 0),
  player_max_hp INTEGER NOT NULL CHECK (player_max_hp > 0),
  player_active_slots JSONB NOT NULL,
  player_reserve_queue JSONB NOT NULL,
  witch_active_slots JSONB NOT NULL,
  witch_reserve_queues JSONB NOT NULL,
  target_boss_slot SMALLINT NOT NULL DEFAULT 1 CHECK (target_boss_slot IN (1, 2)),
  battle_log JSONB NOT NULL DEFAULT '[]'::jsonb,
  turn_number INTEGER NOT NULL DEFAULT 0 CHECK (turn_number >= 0),
  card_changes INTEGER NOT NULL DEFAULT 0 CHECK (card_changes >= 0),
  heal_thresholds JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_curse_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX guild_witch_raid_one_active_battle_idx
  ON guild_witch_raid_battles (raid_id, player_id)
  WHERE status = 'active';

CREATE INDEX guild_witch_raid_battles_player_idx
  ON guild_witch_raid_battles (raid_id, player_id, created_at DESC);
