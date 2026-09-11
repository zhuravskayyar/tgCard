import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import type { AdminIdentity } from "@cardastika/shared";
import { PlayerRepository } from "../users/playerRepository.js";
import { AdminDomainError, AdminService } from "./adminService.js";

const databaseUrl = process.env.DATABASE_URL?.trim();

test("admin player mutations are validated, audited, and rolled back atomically", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const nonce = BigInt(Date.now()) * 100_000n + BigInt(process.pid);
  const adminPlayer = await players.findOrCreateFromTelegram({
    id: nonce.toString(), username: null, firstName: "Admin integration", lastName: null, photoUrl: null,
  });
  const targetPlayer = await players.findOrCreateFromTelegram({
    id: (nonce + 1n).toString(), username: null, firstName: "Target integration", lastName: null, photoUrl: null,
  });
  const admin: AdminIdentity = {
    displayName: "Admin integration",
    playerId: adminPlayer.id,
    telegramUserId: nonce.toString(),
  };
  const service = new AdminService(pool);

  try {
    const added = await service.adjustCurrency(admin, targetPlayer.id, "gold", 250);
    assert.equal(added.player.gold, 250);
    await assert.rejects(
      service.adjustCurrency(admin, targetPlayer.id, "gold", -251),
      (error) => error instanceof AdminDomainError && error.code === "invalid_balance",
    );

    const leveled = await service.changeLevel(admin, targetPlayer.id, 5);
    assert.equal(leveled.player.level, 5);

    const granted = await service.grantCards(admin, targetPlayer.id, "starter_01", 1, 10);
    assert.equal(granted.createdCards.length, 1);
    const grantedInstanceId = granted.createdCards[0]?.instanceId;
    assert.ok(grantedInstanceId);
    const removed = await service.removeCard(admin, targetPlayer.id, grantedInstanceId);
    assert.equal(removed.removedInstanceId, grantedInstanceId);

    await assert.rejects(
      service.grantCards(admin, targetPlayer.id, "missing-card", 1, 1),
      (error) => error instanceof AdminDomainError && error.code === "card_not_found",
    );
    await assert.rejects(
      service.adjustCurrency(admin, "00000000-0000-4000-8000-000000000099", "silver", 1),
      (error) => error instanceof AdminDomainError && error.code === "player_not_found",
    );

    const beforeRollback = await service.getPlayer(targetPlayer.id, 1, 25);
    assert.equal(beforeRollback.deck.length, 9);
    const deckCard = beforeRollback.deck[0];
    assert.ok(deckCard);
    await assert.rejects(
      service.removeCard(admin, targetPlayer.id, deckCard.instanceId),
      (error) => error instanceof AdminDomainError && error.code === "deck_would_be_invalid",
    );
    const afterRollback = await service.getPlayer(targetPlayer.id, 1, 25);
    assert.equal(afterRollback.deck.length, 9);
    assert.ok(afterRollback.cards.some(({ instanceId }) => instanceId === deckCard.instanceId));

    const actions = await pool.query<{ action: string }>(
      "SELECT action FROM admin_audit_logs WHERE admin_player_id = $1 AND entity_id = $2 ORDER BY created_at",
      [adminPlayer.id, targetPlayer.id],
    );
    assert.deepEqual(actions.rows.map(({ action }) => action), [
      "PLAYER_ADD_GOLD",
      "PLAYER_LEVEL_CHANGE",
      "PLAYER_ADD_CARD",
      "PLAYER_REMOVE_CARD",
    ]);
  } finally {
    await pool.query(
      "DELETE FROM admin_audit_logs WHERE admin_player_id = $1::uuid OR entity_id = ANY($2::text[])",
      [adminPlayer.id, [adminPlayer.id, targetPlayer.id]],
    );
    await pool.query("DELETE FROM players WHERE id IN ($1, $2)", [adminPlayer.id, targetPlayer.id]);
    await pool.end();
  }
});
