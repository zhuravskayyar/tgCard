-- Guild XP follows the reference: every XP point a member earns in duels, campaign bosses and the
-- tournament also goes to the guild, with no daily cap. Campaign losses and tournament battles pay XP
-- too, so they become activity types. Arena and dungeon rows stay valid for older contributions.
ALTER TABLE guild_xp_contributions DROP CONSTRAINT IF EXISTS guild_xp_contributions_activity_type_check;
ALTER TABLE guild_xp_contributions ADD CONSTRAINT guild_xp_contributions_activity_type_check CHECK (activity_type IN (
  'duel_win', 'duel_loss', 'campaign_win', 'campaign_loss', 'tournament_battle', 'dungeon_complete',
  'arena_place_1', 'arena_place_2', 'arena_place_3', 'arena_place_4_6'
));

ALTER TABLE guild_activity_log DROP CONSTRAINT IF EXISTS guild_activity_log_activity_type_check;
ALTER TABLE guild_activity_log ADD CONSTRAINT guild_activity_log_activity_type_check CHECK (activity_type IS NULL OR activity_type IN (
  'duel_win', 'duel_loss', 'campaign_win', 'campaign_loss', 'tournament_battle', 'dungeon_complete',
  'arena_place_1', 'arena_place_2', 'arena_place_3', 'arena_place_4_6'
));
