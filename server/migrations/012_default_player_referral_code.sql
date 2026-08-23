ALTER TABLE players
  ALTER COLUMN referral_code SET DEFAULT LOWER(
    SUBSTRING(REPLACE(gen_random_uuid()::text, '-', '') FROM 1 FOR 12)
  );
