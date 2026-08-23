ALTER TABLE duel_matchmaking_searches
  ALTER COLUMN opponent_id DROP NOT NULL,
  ADD COLUMN opponent_kind TEXT NOT NULL DEFAULT 'real'
    CHECK (opponent_kind IN ('real', 'bot')),
  ADD COLUMN opponent_snapshot JSONB;

ALTER TABLE duel_matchmaking_searches
  ADD CONSTRAINT duel_search_opponent_source_check CHECK (
    (opponent_kind = 'real' AND opponent_id IS NOT NULL AND opponent_snapshot IS NULL)
    OR
    (opponent_kind = 'bot' AND opponent_id IS NULL AND opponent_snapshot IS NOT NULL)
  );

ALTER TABLE duels
  ALTER COLUMN opponent_id DROP NOT NULL,
  ADD COLUMN opponent_kind TEXT NOT NULL DEFAULT 'real'
    CHECK (opponent_kind IN ('real', 'bot'));

ALTER TABLE duels
  ADD CONSTRAINT duel_opponent_source_check CHECK (
    (opponent_kind = 'real' AND opponent_id IS NOT NULL)
    OR
    (opponent_kind = 'bot' AND opponent_id IS NULL)
  );
