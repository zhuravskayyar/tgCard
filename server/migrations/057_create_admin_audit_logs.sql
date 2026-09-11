CREATE TABLE admin_audit_logs (
  id UUID PRIMARY KEY,
  admin_player_id UUID REFERENCES players(id) ON DELETE SET NULL,
  admin_telegram_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_state JSONB,
  after_state JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX admin_audit_logs_created_at_idx
  ON admin_audit_logs (created_at DESC);

CREATE INDEX admin_audit_logs_admin_created_at_idx
  ON admin_audit_logs (admin_player_id, created_at DESC);

CREATE INDEX admin_audit_logs_action_created_at_idx
  ON admin_audit_logs (action, created_at DESC);

CREATE INDEX admin_audit_logs_entity_created_at_idx
  ON admin_audit_logs (entity_type, entity_id, created_at DESC);
