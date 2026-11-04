CREATE TABLE tournament_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 240),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX tournament_chat_messages_created_at_idx
  ON tournament_chat_messages (created_at DESC, id DESC);

CREATE INDEX tournament_chat_messages_player_created_at_idx
  ON tournament_chat_messages (player_id, created_at DESC);
