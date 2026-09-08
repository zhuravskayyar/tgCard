ALTER TABLE collections
  ADD COLUMN buff_scope TEXT NOT NULL DEFAULT 'all_battles' CHECK (buff_scope IN (
    'all_battles',
    'duel',
    'arena',
    'campaign',
    'guild_raid',
    'absorption',
    'altar'
  ));
