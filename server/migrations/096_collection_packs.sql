-- «Колекції тижня»: two collection packs rotate in the shop every ISO week (docs/collection-packs.md).
-- Only the full-collection offer has a limit; the counter is keyed by collection and the Monday of the week.
CREATE TABLE IF NOT EXISTS player_collection_pack_purchases (
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  -- collections.code; the packs are configured in server code, not in a table.
  collection_code TEXT NOT NULL,
  -- Monday 00:00 UTC of the rotation week.
  week_start DATE NOT NULL,
  purchase_count INTEGER NOT NULL CHECK (purchase_count > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, collection_code, week_start)
);
