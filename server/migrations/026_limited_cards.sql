ALTER TABLE cards
  ADD COLUMN limited BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE limited_card_events (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE RESTRICT,
  promo_code TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  CHECK (ends_at > starts_at)
);

CREATE UNIQUE INDEX limited_card_events_promo_code_idx
  ON limited_card_events (promo_code);

CREATE TABLE player_limited_card_redemptions (
  event_id TEXT NOT NULL REFERENCES limited_card_events(id) ON DELETE RESTRICT,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, player_id)
);

CREATE INDEX player_limited_card_redemptions_player_id_idx
  ON player_limited_card_redemptions (player_id, event_id);
