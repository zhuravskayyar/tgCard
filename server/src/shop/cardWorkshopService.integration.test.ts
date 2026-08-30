import assert from "node:assert/strict";
import { Pool } from "pg";
import test from "node:test";
import type { ValidatedTelegramUser } from "../auth/telegramInitData.js";
import { PlayerRepository } from "../users/playerRepository.js";
import { CardWorkshopService, InsufficientCardShardsError } from "./cardWorkshopService.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
let sequence = 0n;

function createTelegramUser() {
  sequence += 1n;
  const id = String(BigInt(Date.now()) * 1_000_000n + BigInt(process.pid) * 100n + sequence);
  return {
    id,
    username: null,
    firstName: "Workshop test",
    lastName: null,
    photoUrl: null,
  } satisfies ValidatedTelegramUser;
}

test("card workshop spends server cost and increments duplicate quantity", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const player = await players.findOrCreateFromTelegram(createTelegramUser());
  const workshop = new CardWorkshopService(pool, () => new Date("2026-08-24T12:00:00Z"));
  try {
    const catalog = await workshop.getCatalog(player.id);
    const common = catalog.cards.find((card) => card.rarity === "common");
    assert.ok(common);
    await pool.query("UPDATE players SET card_shards = 200 WHERE id = $1", [player.id]);

    const first = await workshop.craft(player.id, common.cardId);
    const second = await workshop.craft(player.id, common.cardId);
    assert.equal(first.shardsSpent, 100);
    assert.equal(first.quantity, common.ownedQuantity + 1);
    assert.equal(second.quantity, common.ownedQuantity + 2);
    assert.equal(second.cardShards, 0);

    await pool.query("UPDATE players SET card_shards = 100 WHERE id = $1", [player.id]);
    const concurrent = await Promise.allSettled([
      workshop.craft(player.id, common.cardId),
      workshop.craft(player.id, common.cardId),
    ]);
    assert.equal(concurrent.filter((outcome) => outcome.status === "fulfilled").length, 1);
    assert.equal(concurrent.filter((outcome) => outcome.status === "rejected").length, 1);
    await assert.rejects(() => workshop.craft(player.id, common.cardId), InsufficientCardShardsError);
    const count = await pool.query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM player_card_instances WHERE player_id = $1 AND card_id = $2",
      [player.id, common.cardId],
    );
    assert.equal(Number(count.rows[0]?.count), common.ownedQuantity + 3);
  } finally {
    await pool.query("DELETE FROM players WHERE id = $1", [player.id]);
    await pool.end();
  }
});
