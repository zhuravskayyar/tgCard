ALTER TABLE guild_war_matches ADD COLUMN settled_at TIMESTAMPTZ;

ALTER TABLE guild_war_participants
  ADD COLUMN deck_power BIGINT NOT NULL DEFAULT 0 CHECK (deck_power >= 0);

CREATE TABLE guild_war_key_attempts (
  id UUID PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES guild_war_matches(id) ON DELETE CASCADE,
  key_day INTEGER NOT NULL CHECK (key_day IN (1, 3)),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  target_id UUID REFERENCES players(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('active', 'won', 'lost')),
  player_fighter JSONB,
  target_fighter JSONB,
  xp BIGINT NOT NULL DEFAULT 0 CHECK (xp >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (match_id, key_day, player_id, target_id),
  CHECK (
    (target_id IS NULL AND status = 'won' AND player_fighter IS NULL AND target_fighter IS NULL)
    OR (target_id <> player_id AND player_fighter IS NOT NULL AND target_fighter IS NOT NULL)
  )
);

CREATE UNIQUE INDEX guild_war_key_attempts_active_idx
  ON guild_war_key_attempts (match_id, key_day, player_id)
  WHERE status = 'active';

CREATE INDEX guild_war_key_attempts_target_idx
  ON guild_war_key_attempts (match_id, key_day, target_id, status);

CREATE TABLE guild_war_battle_fighters (
  match_id UUID NOT NULL REFERENCES guild_war_matches(id) ON DELETE CASCADE,
  battle_number INTEGER NOT NULL CHECK (battle_number BETWEEN 1 AND 8),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  location_id INTEGER NOT NULL CHECK (location_id BETWEEN 0 AND 5),
  fighter JSONB NOT NULL,
  earned_xp BIGINT CHECK (earned_xp >= 0),
  PRIMARY KEY (match_id, battle_number, player_id)
);

CREATE TABLE guild_war_battle_results (
  match_id UUID NOT NULL REFERENCES guild_war_matches(id) ON DELETE CASCADE,
  battle_number INTEGER NOT NULL CHECK (battle_number BETWEEN 1 AND 8),
  winner_guild_id UUID REFERENCES guilds(id) ON DELETE SET NULL,
  PRIMARY KEY (match_id, battle_number)
);

CREATE TABLE guild_war_magic_crystals (
  player_id UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity = 1)
);
