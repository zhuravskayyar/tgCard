ALTER TABLE player_boosts DROP CONSTRAINT IF EXISTS player_boosts_boost_type_check;
ALTER TABLE player_boosts
  ADD CONSTRAINT player_boosts_boost_type_check
  CHECK (boost_type IN ('account_x2', 'currency_x2'));

ALTER TABLE player_boosts DROP CONSTRAINT IF EXISTS player_boosts_source_check;
ALTER TABLE player_boosts
  ADD CONSTRAINT player_boosts_source_check
  CHECK (source = 'campaign_referral' OR source LIKE 'battle_pass:%');
