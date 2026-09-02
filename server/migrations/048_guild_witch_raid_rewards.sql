ALTER TABLE guild_witch_raid_participants
  ADD COLUMN damage_total BIGINT NOT NULL DEFAULT 0
    CHECK (damage_total >= 0);

CREATE TABLE guild_witch_raid_results (
  id UUID PRIMARY KEY,
  raid_id UUID NOT NULL REFERENCES guild_witch_raids(id) ON DELETE CASCADE,
  raid_level INTEGER NOT NULL CHECK (raid_level BETWEEN 1 AND 25),
  week_key DATE NOT NULL,
  participant_count INTEGER NOT NULL CHECK (participant_count > 0),
  total_damage BIGINT NOT NULL CHECK (total_damage >= 0),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX guild_witch_raid_results_latest_idx
  ON guild_witch_raid_results (raid_id, week_key, completed_at DESC);

CREATE TABLE guild_witch_raid_result_participants (
  result_id UUID NOT NULL REFERENCES guild_witch_raid_results(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  photo_url TEXT,
  joined_at TIMESTAMPTZ NOT NULL,
  placement INTEGER NOT NULL CHECK (placement > 0),
  damage BIGINT NOT NULL CHECK (damage >= 0),
  reward JSONB NOT NULL,
  PRIMARY KEY (result_id, player_id),
  UNIQUE (result_id, placement)
);

CREATE INDEX guild_witch_raid_result_participants_order_idx
  ON guild_witch_raid_result_participants (result_id, placement);
