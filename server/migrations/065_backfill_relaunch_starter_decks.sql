-- Relaunch: immediately provision all existing accounts with 9 starter cards.
INSERT INTO player_card_instances (id,player_id,card_id,level,bonus_power)
SELECT md5('cardastika:starter:'||p.id::text||':'||c.id)::uuid,p.id,c.id,1,2
FROM players p CROSS JOIN cards c
WHERE c.id LIKE 'starter_v5_%'
AND NOT EXISTS (SELECT 1 FROM player_card_instances i WHERE i.player_id=p.id AND i.card_id=c.id)
ON CONFLICT (id) DO NOTHING;
INSERT INTO player_card_discoveries(player_id,card_id)
SELECT p.id,c.id FROM players p CROSS JOIN cards c
WHERE c.id LIKE 'starter_v5_%'
ON CONFLICT(player_id,card_id) DO NOTHING;
INSERT INTO player_decks(id,player_id)
SELECT gen_random_uuid(),p.id FROM players p
WHERE NOT EXISTS (SELECT 1 FROM player_decks d WHERE d.player_id=p.id);
INSERT INTO deck_slots(deck_id,slot,card_instance_id)
SELECT d.id,row_number() OVER(PARTITION BY i.player_id ORDER BY i.card_id)::smallint,i.id
FROM player_card_instances i JOIN player_decks d ON d.player_id=i.player_id
WHERE i.card_id LIKE 'starter_v5_%'
ON CONFLICT(deck_id,slot) DO NOTHING;
DO $$
BEGIN
 IF (SELECT count(*) FROM cards) <> 9 THEN RAISE EXCEPTION 'Expected exactly 9 active starter cards'; END IF;
 IF (SELECT count(*) FROM player_card_instances) <> (SELECT count(*) FROM players)*9
 OR (SELECT count(*) FROM deck_slots) <> (SELECT count(*) FROM players)*9 THEN
 RAISE EXCEPTION 'Starter card or deck bootstrap incomplete';
 END IF;
END $$;