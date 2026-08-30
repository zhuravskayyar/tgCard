ALTER TABLE players
  ADD COLUMN IF NOT EXISTS nickname TEXT;

ALTER TABLE players
  ADD CONSTRAINT players_nickname_length_check
  CHECK (nickname IS NULL OR char_length(nickname) BETWEEN 1 AND 10);

UPDATE players
SET nickname = LEFT(COALESCE(NULLIF(BTRIM(username), ''), first_name), 10)
WHERE nickname IS NULL;

ALTER TABLE player_mail
  ADD COLUMN IF NOT EXISTS action_type TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS action_completed_at TIMESTAMPTZ;

ALTER TABLE player_mail
  ADD CONSTRAINT player_mail_action_type_check
  CHECK (action_type IN ('none', 'nickname_change'));

CREATE UNIQUE INDEX IF NOT EXISTS player_mail_nickname_action_idx
  ON player_mail (player_id, action_type)
  WHERE action_type = 'nickname_change';

INSERT INTO player_mail (player_id, subject, body, silver, gold, action_type)
SELECT
  players.id,
  'Зміни свій нік',
  'Встанови власний ігровий нік до 10 символів. Обери «Змінити», щоб задати його, або «Залишити», щоб зберегти поточне ім’я.',
  0,
  0,
  'nickname_change'
FROM players
WHERE NOT EXISTS (
  SELECT 1
  FROM player_mail
  WHERE player_mail.player_id = players.id
    AND player_mail.action_type = 'nickname_change'
);
