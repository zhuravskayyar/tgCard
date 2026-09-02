ALTER TABLE guilds
  ADD COLUMN active_guild_card_instance_id UUID
    REFERENCES player_card_instances(id) ON DELETE SET NULL;

ALTER TABLE duels
  ADD COLUMN player_guild_card JSONB,
  ADD COLUMN enemy_guild_card JSONB;
