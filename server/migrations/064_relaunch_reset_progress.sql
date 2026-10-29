-- Cardastika release cutover. Keep identities, sessions, friendships,
-- referrals and guild membership. Full pre-relaunch database backup exists.
DO $$
DECLARE t text;
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
 FOREACH t IN ARRAY ARRAY['guild_witch_raid_result_participants','guild_witch_raid_results','guild_witch_raid_battles','guild_witch_raid_participants','guild_witch_raid_bosses','guild_witch_raids','guild_xp_contributions','guild_treasury_contributions','guild_cards','arena_match_players','arena_matches','arena_queue','arena_shop_purchases','duel_matchmaking_searches','duels','player_limited_card_redemptions','limited_card_events','player_mail','player_arena_cosmetics','player_battle_pass_claims','player_battle_pass_state','player_boosts','player_campaign_events','player_campaign_quest_progress','player_campaign_state','player_collection_completions','player_cosmetics','player_daily_task_claims','player_dungeon_runs','player_equipment_inventory','player_lariska_daily_claims','player_lariska_daily_options','player_lariska_daily_state','player_shop_chances','deck_slots','player_decks','player_card_discoveries','player_card_instances'] LOOP
   EXECUTE format('DELETE FROM public.%I',t);
 END LOOP;
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
END $$;
