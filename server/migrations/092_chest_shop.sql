-- Chest shop (reference manual /forum/3/228581/): 15 chests for silver, open 4 hours, one weekly opening.
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS chest_shop_open_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS chest_shop_next INTEGER NOT NULL DEFAULT 1 CHECK (chest_shop_next BETWEEN 1 AND 15),
  ADD COLUMN IF NOT EXISTS chest_shop_week DATE;

-- Every opened chest: the prize the player got, the source of the public feed (chests 8–15) and later achievements.
CREATE TABLE IF NOT EXISTS chest_shop_openings (
  id UUID PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  chest_number INTEGER NOT NULL CHECK (chest_number BETWEEN 1 AND 15),
  price INTEGER NOT NULL CHECK (price > 0),
  prize JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chest_shop_openings_feed_idx
  ON chest_shop_openings (created_at DESC)
  WHERE chest_number >= 8;
