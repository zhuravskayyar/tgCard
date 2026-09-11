CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX players_admin_name_search_idx
  ON players USING GIN (
    (
      COALESCE(username, '') || ' ' ||
      COALESCE(nickname, '') || ' ' ||
      first_name || ' ' ||
      COALESCE(last_name, '')
    ) gin_trgm_ops
  );

CREATE INDEX players_admin_created_at_idx
  ON players (created_at DESC, id);

CREATE INDEX players_admin_level_idx
  ON players (level, id);

CREATE INDEX players_admin_silver_idx
  ON players (silver, id);

CREATE INDEX players_admin_gold_idx
  ON players (gold, id);
