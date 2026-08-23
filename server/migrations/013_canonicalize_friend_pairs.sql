ALTER TABLE player_friends
  ADD CONSTRAINT player_friends_canonical_pair CHECK (player_a_id < player_b_id);
