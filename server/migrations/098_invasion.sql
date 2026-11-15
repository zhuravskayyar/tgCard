-- «Навала Шуліки»: a server-wide chain of 24 bosses (docs/invasion.md, docs/reference-elem-invasion.md).
-- Events are created lazily by the first request after the previous invasion ends.
CREATE TABLE IF NOT EXISTS invasion_events (
  number INTEGER PRIMARY KEY,
  starts_at TIMESTAMPTZ NOT NULL,
  current_boss INTEGER NOT NULL DEFAULT 1 CHECK (current_boss BETWEEN 1 AND 24),
  boss_health BIGINT NOT NULL CHECK (boss_health >= 0),
  -- The current boss cannot be attacked before this moment (pause after a kill, or before the start).
  boss_appears_at TIMESTAMPTZ NOT NULL,
  -- Frozen DuelCardSnapshot[] of the boss, rolled when the boss is born.
  boss_deck JSONB NOT NULL,
  finished_at TIMESTAMPTZ
);

-- Damage and attack counters of one player on one boss.
CREATE TABLE IF NOT EXISTS invasion_participants (
  invasion_number INTEGER NOT NULL REFERENCES invasion_events(number) ON DELETE CASCADE,
  boss_number INTEGER NOT NULL CHECK (boss_number BETWEEN 1 AND 24),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  damage BIGINT NOT NULL DEFAULT 0 CHECK (damage >= 0),
  super_strikes INTEGER NOT NULL DEFAULT 0 CHECK (super_strikes >= 0),
  attacks INTEGER NOT NULL DEFAULT 0 CHECK (attacks >= 0),
  last_attack_at TIMESTAMPTZ,
  last_xp BIGINT NOT NULL DEFAULT 0,
  last_silver BIGINT NOT NULL DEFAULT 0,
  -- Set when the player has been shown the «boss defeated» summary.
  defeat_seen_at TIMESTAMPTZ,
  PRIMARY KEY (invasion_number, boss_number, player_id)
);
CREATE INDEX IF NOT EXISTS invasion_participants_ranking_idx
  ON invasion_participants (invasion_number, boss_number, damage DESC);
CREATE INDEX IF NOT EXISTS invasion_participants_player_idx
  ON invasion_participants (player_id, invasion_number);

-- A manual fight; state is the frozen game-core battle plus the player's modifiers and deck power.
CREATE TABLE IF NOT EXISTS invasion_battles (
  id UUID PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  invasion_number INTEGER NOT NULL REFERENCES invasion_events(number) ON DELETE CASCADE,
  boss_number INTEGER NOT NULL CHECK (boss_number BETWEEN 1 AND 24),
  state JSONB NOT NULL,
  log JSONB NOT NULL DEFAULT '[]'::jsonb,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  finished BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS invasion_battles_one_open_idx
  ON invasion_battles (player_id) WHERE finished = FALSE;

-- Cards for a dead boss; the instance is created when the player next opens the page.
CREATE TABLE IF NOT EXISTS invasion_prizes (
  id UUID PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  invasion_number INTEGER NOT NULL REFERENCES invasion_events(number) ON DELETE CASCADE,
  boss_number INTEGER NOT NULL CHECK (boss_number BETWEEN 1 AND 24),
  kind TEXT NOT NULL CHECK (kind IN ('first_place', 'damage', 'super_strike')),
  card_id TEXT NOT NULL,
  level INTEGER NOT NULL CHECK (level > 0),
  -- NULL means the standard random bonus.
  bonus_power INTEGER,
  instance_id UUID,
  seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS invasion_prizes_pending_idx ON invasion_prizes (player_id) WHERE seen_at IS NULL;
CREATE INDEX IF NOT EXISTS invasion_prizes_kind_idx ON invasion_prizes (player_id, kind);

-- Diamonds for «Алмазні нагороди»: the part counted toward the daily norm, per UTC day.
CREATE TABLE IF NOT EXISTS invasion_daily_diamonds (
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  norm_diamonds INTEGER NOT NULL DEFAULT 0 CHECK (norm_diamonds >= 0),
  PRIMARY KEY (player_id, day)
);

-- «Дозвіл на полювання»: owned permits (no grant path yet) and their activation on one boss of one invasion.
CREATE TABLE IF NOT EXISTS player_invasion_items (
  player_id UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  hunting_permits INTEGER NOT NULL DEFAULT 0 CHECK (hunting_permits >= 0)
);
CREATE TABLE IF NOT EXISTS invasion_permit_activations (
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  invasion_number INTEGER NOT NULL REFERENCES invasion_events(number) ON DELETE CASCADE,
  boss_number INTEGER NOT NULL CHECK (boss_number BETWEEN 1 AND 24),
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, invasion_number, boss_number)
);

-- Guild XP for invasion attacks. The newest constraint list is migration 088's (it already has 'dragon_raid').
ALTER TABLE guild_xp_contributions DROP CONSTRAINT IF EXISTS guild_xp_contributions_activity_type_check;
ALTER TABLE guild_xp_contributions ADD CONSTRAINT guild_xp_contributions_activity_type_check CHECK (activity_type IN (
  'duel_win', 'duel_loss', 'campaign_win', 'campaign_loss', 'tournament_battle', 'dragon_raid', 'invasion_attack', 'dungeon_complete',
  'arena_place_1', 'arena_place_2', 'arena_place_3', 'arena_place_4_6'
));
ALTER TABLE guild_activity_log DROP CONSTRAINT IF EXISTS guild_activity_log_activity_type_check;
ALTER TABLE guild_activity_log ADD CONSTRAINT guild_activity_log_activity_type_check CHECK (activity_type IS NULL OR activity_type IN (
  'duel_win', 'duel_loss', 'campaign_win', 'campaign_loss', 'tournament_battle', 'dragon_raid', 'invasion_attack', 'dungeon_complete',
  'arena_place_1', 'arena_place_2', 'arena_place_3', 'arena_place_4_6'
));
