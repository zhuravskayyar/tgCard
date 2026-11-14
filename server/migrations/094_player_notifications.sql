-- Push notifications through the Telegram bot (docs/notifications.md).
-- A player without a row has every notification type enabled.
CREATE TABLE IF NOT EXISTS player_notification_settings (
  player_id UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  duel_ready BOOLEAN NOT NULL DEFAULT TRUE,
  mail BOOLEAN NOT NULL DEFAULT TRUE,
  guild BOOLEAN NOT NULL DEFAULT TRUE,
  announcements BOOLEAN NOT NULL DEFAULT TRUE,
  winback BOOLEAN NOT NULL DEFAULT TRUE,
  locale TEXT NOT NULL DEFAULT 'uk' CHECK (locale IN ('uk', 'en', 'de', 'ru')),
  -- Set when Telegram answers 403 (bot blocked or never started); cleared when the player saves settings.
  telegram_blocked_at TIMESTAMPTZ,
  -- Dedupe markers: what was already announced to this player.
  duel_notified_refill_at TIMESTAMPTZ,
  mail_notified_at TIMESTAMPTZ,
  guild_notified_at TIMESTAMPTZ,
  winback_notified_at TIMESTAMPTZ,
  announcement_notified_id BIGINT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Update announcements are inserted by hand (SQL) and delivered by the sweep.
CREATE TABLE IF NOT EXISTS notification_announcements (
  id BIGSERIAL PRIMARY KEY,
  body_uk TEXT NOT NULL CHECK (char_length(body_uk) BETWEEN 1 AND 1000),
  body_en TEXT,
  body_de TEXT,
  body_ru TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One sweep at a time. A lease row instead of an advisory lock: the Neon pooler does not keep sessions.
CREATE TABLE IF NOT EXISTS notification_sweep_lease (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  locked_until TIMESTAMPTZ NOT NULL DEFAULT '-infinity'
);
INSERT INTO notification_sweep_lease DEFAULT VALUES ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS players_duel_refill_at_idx
  ON players (duel_refill_at)
  WHERE duel_refill_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS player_mail_unclaimed_created_idx
  ON player_mail (created_at)
  WHERE claimed_at IS NULL;
