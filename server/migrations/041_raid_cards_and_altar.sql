ALTER TABLE cards
  ADD COLUMN source TEXT NOT NULL DEFAULT 'standard'
    CHECK (source IN ('standard', 'raid'));

ALTER TABLE collections
  ADD COLUMN source TEXT NOT NULL DEFAULT 'standard'
    CHECK (source IN ('standard', 'raid'));

ALTER TABLE players
  ADD COLUMN altar_level INTEGER NOT NULL DEFAULT 1
    CHECK (altar_level >= 1);

CREATE INDEX cards_source_idx ON cards (source, collection_id, code);
