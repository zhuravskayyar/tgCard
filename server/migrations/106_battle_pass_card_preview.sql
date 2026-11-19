-- «Алмазні нагороди» (docs/battle-pass.md): the final card of a circle is chosen when the circle is first
-- shown and stays the same until it is claimed, so the player sees it in advance. The level is computed
-- at claim time from the deck, as before.
CREATE TABLE IF NOT EXISTS player_battle_pass_card_previews (
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  season_id TEXT NOT NULL,
  circle INTEGER NOT NULL CHECK (circle >= 1),
  card_id TEXT NOT NULL REFERENCES cards(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, season_id, circle)
);

-- With VIP bought, the final card of a circle comes in the VIP frame.
ALTER TABLE player_card_instances ADD COLUMN IF NOT EXISTS vip_frame BOOLEAN NOT NULL DEFAULT FALSE;
