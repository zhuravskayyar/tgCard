CREATE TABLE guild_treasuries (
  guild_id UUID PRIMARY KEY REFERENCES guilds(id) ON DELETE CASCADE,
  silver BIGINT NOT NULL DEFAULT 0 CHECK (silver >= 0),
  gold BIGINT NOT NULL DEFAULT 0 CHECK (gold >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO guild_treasuries (guild_id)
SELECT id FROM guilds
ON CONFLICT (guild_id) DO NOTHING;

CREATE TABLE guild_cards (
  id UUID PRIMARY KEY,
  guild_id UUID NOT NULL UNIQUE REFERENCES guilds(id) ON DELETE CASCADE,
  source_player_card_instance_id UUID,
  selected_by_player_id UUID REFERENCES players(id) ON DELETE SET NULL,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE RESTRICT,
  level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 180),
  bonus_power INTEGER NOT NULL CHECK (bonus_power >= 0),
  level_progress_elements NUMERIC(30, 2) NOT NULL DEFAULT 0 CHECK (level_progress_elements >= 0),
  stored_elements NUMERIC(30, 2) NOT NULL DEFAULT 0 CHECK (stored_elements >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO guild_cards (
  id, guild_id, source_player_card_instance_id, selected_by_player_id, card_id,
  level, bonus_power, level_progress_elements, stored_elements, created_at, updated_at
)
SELECT
  pci.id, g.id, pci.id, leader.player_id, pci.card_id,
  pci.level, pci.bonus_power, pci.level_progress_elements, pci.stored_elements,
  pci.created_at, NOW()
FROM guilds g
INNER JOIN guild_members leader ON leader.guild_id = g.id AND leader.role = 'leader'
INNER JOIN player_card_instances pci
  ON pci.id = g.active_guild_card_instance_id
  AND pci.player_id = leader.player_id
ON CONFLICT (guild_id) DO NOTHING;

CREATE TABLE guild_treasury_contributions (
  id UUID PRIMARY KEY,
  guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  contribution_type TEXT NOT NULL CHECK (contribution_type IN ('gold', 'silver', 'card_elements')),
  amount NUMERIC(30, 2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    contribution_type = 'card_elements'
    OR amount = TRUNC(amount)
  )
);

CREATE INDEX guild_treasury_contributions_member_idx
  ON guild_treasury_contributions (guild_id, player_id, contribution_type, created_at DESC);

CREATE INDEX guild_treasury_contributions_guild_idx
  ON guild_treasury_contributions (guild_id, created_at DESC);
