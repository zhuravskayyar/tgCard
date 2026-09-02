CREATE TABLE guild_witch_raids (
  id UUID PRIMARY KEY,
  guild_id UUID NOT NULL UNIQUE REFERENCES guilds(id) ON DELETE CASCADE,
  level INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 25),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'active')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE guild_witch_raid_bosses (
  raid_id UUID NOT NULL REFERENCES guild_witch_raids(id) ON DELETE CASCADE,
  slot SMALLINT NOT NULL CHECK (slot IN (1, 2)),
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE RESTRICT,
  PRIMARY KEY (raid_id, slot),
  UNIQUE (raid_id, card_id)
);

CREATE INDEX guild_witch_raid_bosses_card_idx
  ON guild_witch_raid_bosses(card_id);
