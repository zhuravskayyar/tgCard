-- Finished records remain earned when a leaderboard entry expires or a deck changes.
CREATE TABLE player_achievement_high_water (
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  statistic TEXT NOT NULL,
  value BIGINT NOT NULL CHECK (value >= 0),
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, statistic)
);

-- Current-week victories still exist when this migration runs. Older weeks
-- were deleted by the raid reset and cannot be reconstructed.
INSERT INTO player_campaign_events (player_id, event_type, payload, occurred_at)
SELECT player_id, 'WITCH_BATTLE_WON', jsonb_build_object('battleId', id), COALESCE(finished_at, updated_at)
FROM guild_witch_raid_battles
WHERE status = 'won';
