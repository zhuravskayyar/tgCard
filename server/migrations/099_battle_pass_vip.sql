-- VIP track of «Алмазні нагороди» (docs/battle-pass.md): bought once per season for gold.
-- VIP rewards are claimed into player_battle_pass_claims with ids "<milestone>-vip".
ALTER TABLE player_battle_pass_state ADD COLUMN IF NOT EXISTS vip_purchased_at TIMESTAMPTZ;

-- Circles 2-5 grant ×3 and ×4 currency boosts. The newest list is migration 035's.
ALTER TABLE player_boosts DROP CONSTRAINT IF EXISTS player_boosts_boost_type_check;
ALTER TABLE player_boosts
  ADD CONSTRAINT player_boosts_boost_type_check
  CHECK (boost_type IN ('account_x2', 'currency_x2', 'currency_x3', 'currency_x4'));

-- Reference: a new boost while one is active adds its 24 hours to the remaining time (14 h left + 24 h = 38 h),
-- so a battle pass boost may last longer than 24 hours. Migration 011's unnamed check pinned it to exactly 24 h.
ALTER TABLE player_boosts DROP CONSTRAINT IF EXISTS player_boosts_check;
ALTER TABLE player_boosts DROP CONSTRAINT IF EXISTS player_boosts_duration_check;
ALTER TABLE player_boosts
  ADD CONSTRAINT player_boosts_duration_check
  CHECK (expires_at > starts_at AND (source NOT LIKE 'battle_pass:%' OR expires_at <= starts_at + INTERVAL '62 days')
    AND (source LIKE 'battle_pass:%' OR expires_at = starts_at + INTERVAL '24 hours'));
