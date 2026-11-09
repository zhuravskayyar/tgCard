-- Arena Tokens and the Arena shop are removed: arena pays rating, league silver and daily tasks only.
DROP TABLE IF EXISTS arena_shop_purchases;
DROP TABLE IF EXISTS player_arena_cosmetics;
ALTER TABLE players DROP COLUMN IF EXISTS arena_tokens;
