CREATE TABLE player_mail (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  silver BIGINT NOT NULL DEFAULT 0 CHECK (silver >= 0),
  gold BIGINT NOT NULL DEFAULT 0 CHECK (gold >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at TIMESTAMPTZ
);

CREATE INDEX player_mail_player_created_idx
  ON player_mail (player_id, created_at DESC);

CREATE INDEX player_mail_player_unread_idx
  ON player_mail (player_id, claimed_at)
  WHERE claimed_at IS NULL;

INSERT INTO player_mail (player_id, subject, body, silver, gold)
SELECT
  id,
  'Компенсація за технічні моменти',
  'Дякуємо, що грали з нами. Прийміть цей подарунок як компенсацію за технічні моменти.',
  2000,
  50
FROM players;
