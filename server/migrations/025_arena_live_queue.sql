-- A match is now shared by every live player who joined the same registration
-- window. The mapping keeps the match row authoritative while allowing every
-- participant to authenticate against and read the same battle state.
CREATE TABLE arena_match_players (
  match_id UUID NOT NULL REFERENCES arena_matches(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (match_id, player_id)
);

CREATE INDEX arena_match_players_player_idx
  ON arena_match_players (player_id, match_id);

INSERT INTO arena_match_players (match_id, player_id)
SELECT id, player_id
FROM arena_matches
ON CONFLICT DO NOTHING;
