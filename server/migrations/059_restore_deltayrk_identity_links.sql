DO $$
DECLARE
  canonical_player_id UUID;
  displaced_player_id UUID;
BEGIN
  SELECT id
  INTO canonical_player_id
  FROM players
  WHERE id = '9012424a-5304-4c84-bf1f-84f36f64d274'::UUID
  FOR UPDATE;

  IF canonical_player_id IS NULL THEN
    SELECT id
    INTO canonical_player_id
    FROM players
    WHERE LOWER(COALESCE(username, '')) = 'deltayrk'
       OR LOWER(COALESCE(nickname, '')) = 'deltayrk'
    ORDER BY level DESC, account_xp DESC, created_at ASC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF canonical_player_id IS NULL THEN
    RAISE EXCEPTION 'Cannot find the canonical deltayrk player profile';
  END IF;

  SELECT player_id
  INTO displaced_player_id
  FROM auth_identities
  WHERE provider = 'telegram'
    AND provider_user_id = '521834372'
  FOR UPDATE;

  IF displaced_player_id IS NOT NULL AND displaced_player_id <> canonical_player_id THEN
    UPDATE auth_identities AS source_identity
    SET player_id = canonical_player_id
    WHERE source_identity.player_id = displaced_player_id
      AND source_identity.provider = 'google'
      AND NOT EXISTS (
        SELECT 1
        FROM auth_identities AS canonical_identity
        WHERE canonical_identity.player_id = canonical_player_id
          AND canonical_identity.provider = 'google'
      );

    UPDATE player_sessions
    SET revoked_at = NOW()
    WHERE player_id = displaced_player_id
      AND revoked_at IS NULL;
  END IF;

  UPDATE players
  SET telegram_user_id = NULL,
      updated_at = NOW()
  WHERE id <> canonical_player_id
    AND telegram_user_id = 521834372;

  UPDATE players
  SET telegram_user_id = 521834372,
      updated_at = NOW()
  WHERE id = canonical_player_id;

  UPDATE auth_identities
  SET player_id = canonical_player_id
  WHERE provider = 'telegram'
    AND provider_user_id = '521834372';
END $$;
