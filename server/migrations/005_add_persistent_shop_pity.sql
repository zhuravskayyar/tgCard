ALTER TABLE cards
  ADD COLUMN shop_eligible BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE player_shop_chances (
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  offer_id TEXT NOT NULL,
  target_rarity TEXT NOT NULL CHECK (
    target_rarity IN ('common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic')
  ),
  chance_basis_points INTEGER NOT NULL CHECK (
    chance_basis_points >= 0 AND chance_basis_points <= 10000
  ),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, offer_id, target_rarity)
);

CREATE INDEX player_shop_chances_offer_idx
  ON player_shop_chances (offer_id, target_rarity);
