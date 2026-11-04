-- Cardastika release cutover. Keep identities, sessions, friendships,
-- referrals and guild membership. Full pre-relaunch database backup exists.
DO $$
BEGIN
 IF (SELECT count(*) FROM cards) <> 9 OR (SELECT count(*) FROM collections) <> 0
    OR to_regclass('relaunch_archive.player_cards_20261029') IS NULL THEN
   RAISE EXCEPTION 'Relaunch preconditions not met';
 END IF;
 CREATE TABLE relaunch_archive.progress_at_reset_20261029 AS
 SELECT p.*,now() AS archived_at FROM players p;
 CREATE TABLE relaunch_archive.guilds_at_reset_20261029 AS
 SELECT g.*,now() AS archived_at FROM guilds g;
 UPDATE guilds SET active_guild_card_instance_id=NULL,level=1,experience=0,updated_at=now();
 UPDATE guild_members SET contributed_xp=0,updated_at=now();
 UPDATE guild_treasuries SET silver=0,gold=0,updated_at=now();
END $$;
DELETE FROM guild_witch_raid_result_participants;
DELETE FROM guild_witch_raid_results;
DELETE FROM guild_witch_raid_battles;
DELETE FROM guild_witch_raid_participants;
DELETE FROM guild_witch_raid_bosses;
DELETE FROM guild_witch_raids;
DELETE FROM guild_xp_contributions;
DELETE FROM guild_treasury_contributions;
DELETE FROM guild_cards;
DELETE FROM arena_match_players;
DELETE FROM arena_matches;
DELETE FROM arena_queue;
DELETE FROM arena_shop_purchases;
DELETE FROM duel_matchmaking_searches;
DELETE FROM duels;
DELETE FROM player_limited_card_redemptions;
DELETE FROM limited_card_events;
DELETE FROM player_mail;
DELETE FROM player_arena_cosmetics;
DELETE FROM player_battle_pass_claims;
DELETE FROM player_battle_pass_state;
DELETE FROM player_boosts;
DELETE FROM player_campaign_events;
DELETE FROM player_campaign_quest_progress;
DELETE FROM player_campaign_state;
DELETE FROM player_collection_completions;
DELETE FROM player_cosmetics;
DELETE FROM player_daily_task_claims;
DELETE FROM player_dungeon_runs;
DELETE FROM player_equipment_inventory;
DELETE FROM player_lariska_daily_claims;
DELETE FROM player_lariska_daily_options;
DELETE FROM player_lariska_daily_state;
DELETE FROM player_shop_chances;
DELETE FROM deck_slots;
DELETE FROM player_decks;
DELETE FROM player_card_discoveries;
DELETE FROM player_card_instances;
UPDATE players SET
  level=1,silver=0,gold=0,account_xp=0,duel_wins=0,duel_losses=0,
  duel_win_streak=0,duel_rating=0,duel_highest_league_index=0,
  card_shards=0,arena_rating=0,arena_league_index=0,arena_wins=0,
  arena_top3_count=0,arena_tokens=0,arena_gold_earned_today=0,
  arena_gold_day=CURRENT_DATE,rating=0,duel_gold_earned_today=0,
  duel_gold_day=CURRENT_DATE,duel_gold_level=1,
  equipped_nickname_skin=NULL,tutorial_eligible=TRUE,altar_level=1,
  equipment='{"equipped":{"head":null,"boots":null,"cloak":null,"relic":null,"amulet":null,"gloves":null,"shield":null,"voodoo":null,"weapon":null}}'::jsonb,
  updated_at=now();
