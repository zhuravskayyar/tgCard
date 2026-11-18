ALTER TABLE guilds
  ADD COLUMN war_rating INTEGER NOT NULL DEFAULT 1000 CHECK (war_rating >= 0);

CREATE TABLE guild_war_cycles (
  week_start DATE PRIMARY KEY,
  pairings_finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE guild_war_matches (
  id UUID PRIMARY KEY,
  week_start DATE NOT NULL REFERENCES guild_war_cycles(week_start) ON DELETE CASCADE,
  guild_a_id UUID REFERENCES guilds(id) ON DELETE SET NULL,
  guild_a_name TEXT NOT NULL,
  guild_a_level INTEGER NOT NULL CHECK (guild_a_level BETWEEN 1 AND 55),
  guild_a_rating INTEGER NOT NULL CHECK (guild_a_rating >= 0),
  guild_b_id UUID REFERENCES guilds(id) ON DELETE SET NULL,
  guild_b_name TEXT,
  guild_b_level INTEGER CHECK (guild_b_level IS NULL OR guild_b_level BETWEEN 1 AND 55),
  guild_b_rating INTEGER CHECK (guild_b_rating IS NULL OR guild_b_rating >= 0),
  mass_battle_wins_a INTEGER NOT NULL DEFAULT 0 CHECK (mass_battle_wins_a >= 0),
  mass_battle_wins_b INTEGER NOT NULL DEFAULT 0 CHECK (mass_battle_wins_b >= 0),
  damage_a BIGINT NOT NULL DEFAULT 0 CHECK (damage_a >= 0),
  damage_b BIGINT NOT NULL DEFAULT 0 CHECK (damage_b >= 0),
  winner_guild_id UUID REFERENCES guilds(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (week_start, guild_a_id),
  CHECK ((guild_b_name IS NULL AND guild_b_level IS NULL AND guild_b_rating IS NULL)
      OR (guild_b_name IS NOT NULL AND guild_b_level IS NOT NULL AND guild_b_rating IS NOT NULL)),
  CHECK (guild_a_id IS NULL OR guild_b_id IS NULL OR guild_a_id <> guild_b_id)
);

CREATE UNIQUE INDEX guild_war_matches_guild_b_idx
  ON guild_war_matches (week_start, guild_b_id)
  WHERE guild_b_id IS NOT NULL;

CREATE INDEX guild_war_matches_week_idx
  ON guild_war_matches (week_start, created_at);

CREATE TABLE guild_war_participants (
  week_start DATE NOT NULL REFERENCES guild_war_cycles(week_start) ON DELETE CASCADE,
  match_id UUID NOT NULL REFERENCES guild_war_matches(id) ON DELETE CASCADE,
  guild_id UUID REFERENCES guilds(id) ON DELETE SET NULL,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  player_level INTEGER NOT NULL CHECK (player_level >= 1),
  duel_rating INTEGER NOT NULL DEFAULT 0 CHECK (duel_rating >= 0),
  guild_role TEXT NOT NULL CHECK (guild_role IN ('leader', 'officer', 'veteran', 'member', 'newbie')),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (week_start, player_id)
);

CREATE INDEX guild_war_participants_match_idx
  ON guild_war_participants (match_id, guild_id, duel_rating DESC, player_name);
