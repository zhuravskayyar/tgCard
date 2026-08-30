ALTER TABLE players
  ALTER COLUMN account_xp TYPE BIGINT
    USING account_xp::bigint,
  ADD CONSTRAINT players_level_max_check CHECK (level BETWEEN 1 AND 120);

ALTER TABLE duels
  ADD COLUMN player_damage_total BIGINT NOT NULL DEFAULT 0
    CHECK (player_damage_total >= 0);
