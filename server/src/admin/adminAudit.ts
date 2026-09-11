import { randomUUID } from "node:crypto";
import type { AdminAuditAction, AdminIdentity } from "@cardastika/shared";
import type { PoolClient } from "pg";

export interface AdminAuditInput {
  action: AdminAuditAction;
  after?: unknown;
  before?: unknown;
  entityId: string;
  entityType: string;
  metadata?: unknown;
}

export async function recordAdminAudit(
  client: Pick<PoolClient, "query">,
  admin: AdminIdentity,
  input: AdminAuditInput,
) {
  await client.query(
    `
      INSERT INTO admin_audit_logs (
        id, admin_player_id, admin_telegram_user_id, action,
        entity_type, entity_id, before_state, after_state, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb)
    `,
    [
      randomUUID(),
      admin.playerId,
      admin.telegramUserId,
      input.action,
      input.entityType,
      input.entityId,
      input.before === undefined ? null : JSON.stringify(input.before),
      input.after === undefined ? null : JSON.stringify(input.after),
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}
