CREATE TABLE player_decks (
  id UUID PRIMARY KEY,
  player_id UUID NOT NULL UNIQUE REFERENCES players(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE deck_slots (
  deck_id UUID NOT NULL REFERENCES player_decks(id) ON DELETE CASCADE,
  slot SMALLINT NOT NULL CHECK (slot BETWEEN 1 AND 9),
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE RESTRICT,
  PRIMARY KEY (deck_id, slot)
);

CREATE INDEX deck_slots_card_id_idx ON deck_slots(card_id);
