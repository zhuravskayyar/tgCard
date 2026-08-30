ALTER TABLE players
  ADD COLUMN IF NOT EXISTS equipment JSONB NOT NULL DEFAULT '{"equipped":{"head":"equipment_head_fire","cloak":"equipment_cloak_fire","gloves":"equipment_gloves_fire","boots":"equipment_boots_fire","weapon":"equipment_weapon_dawnblade","shield":"equipment_shield_basalt","amulet":"equipment_amulet_phoenix","relic":"equipment_relic_world-tree"}}'::jsonb;
