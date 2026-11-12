-- Treasury gold follows the reference: a player may put in at most 5 gold a day (10 with
-- «Рідкісні змії»). The game's own top-up («Шулікові ватажки») is stored apart so the
-- daily limit counts only what the player paid.
ALTER TABLE guild_treasury_contributions
  ADD COLUMN IF NOT EXISTS game_bonus NUMERIC(30, 2) NOT NULL DEFAULT 0 CHECK (game_bonus >= 0);

CREATE INDEX IF NOT EXISTS guild_treasury_contributions_player_day_idx
  ON guild_treasury_contributions (player_id, contribution_type, created_at);

UPDATE collections
SET bonus_label = '+10 щоденного золота в дуелях; ліміт внеску золота в скарбницю 5 → 10 на день'
WHERE code = 'dragons2';
