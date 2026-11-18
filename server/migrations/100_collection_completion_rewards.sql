ALTER TABLE player_collection_completions
  ADD COLUMN IF NOT EXISTS reward_awarded_at TIMESTAMPTZ;

-- Historic completions have no completion season, so backfill their diamonds
-- into the current UTC Battle Pass season. The temporary table keeps the
-- silver and diamond updates based on exactly the same idempotent set.
CREATE TEMPORARY TABLE collection_completion_reward_backfill ON COMMIT DROP AS
WITH awarded AS (
  UPDATE player_collection_completions
  SET reward_awarded_at = NOW()
  WHERE reward_awarded_at IS NULL
  RETURNING player_id
)
SELECT player_id, COUNT(*)::INTEGER AS reward_count
FROM awarded
GROUP BY player_id;

UPDATE players
SET silver = silver + backfill.reward_count::BIGINT * 1000,
    updated_at = NOW()
FROM collection_completion_reward_backfill backfill
WHERE players.id = backfill.player_id;

INSERT INTO player_battle_pass_state (player_id, season_id, diamonds)
SELECT player_id, TO_CHAR(DATE_TRUNC('month', NOW() AT TIME ZONE 'UTC'), 'YYYY-MM'), reward_count
FROM collection_completion_reward_backfill
ON CONFLICT (player_id, season_id)
DO UPDATE SET diamonds = player_battle_pass_state.diamonds + EXCLUDED.diamonds, updated_at = NOW();
