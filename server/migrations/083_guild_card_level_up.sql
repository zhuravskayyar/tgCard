-- Guild Card level-ups (paid from the treasury) appear in the guild journal; a gold level
-- also gifts every member a magic source of that level (reference manual «Карта гильдии»).
ALTER TABLE guild_activity_log
  DROP CONSTRAINT IF EXISTS guild_activity_log_event_type_check;

ALTER TABLE guild_activity_log
  ADD CONSTRAINT guild_activity_log_event_type_check CHECK (event_type IN (
    'guild_created',
    'member_joined',
    'member_left',
    'member_kicked',
    'role_changed',
    'application_accepted',
    'application_rejected',
    'xp_contributed',
    'treasury_contributed',
    'announcement_updated',
    'guild_card_upgraded'
  ));
