import assert from "node:assert/strict";
import test from "node:test";
import { CHEST_SHOP_CHESTS } from "@cardastika/game-core";
import { Pool } from "pg";
import type { ValidatedTelegramUser } from "../auth/telegramInitData.js";
import { PlayerRepository } from "../users/playerRepository.js";
import { ChestShopError, ChestShopService } from "./chestShopService.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
let sequence = 0n;

function telegramUser(): ValidatedTelegramUser {
  sequence += 1n;
  return {
    id: String(BigInt(Date.now()) * 1_000_000n + BigInt(process.pid) * 100n + sequence),
    username: null,
    firstName: "Chest shop test",
    lastName: null,
    photoUrl: null,
  };
}

async function rejectsWith(promise: Promise<unknown>, code: ChestShopError["code"]) {
  await assert.rejects(promise, (error: unknown) => error instanceof ChestShopError && error.code === code);
}

test("chest shop: weekly opening, 15 chests in order for silver, every prize kind granted", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const playerIds: string[] = [];
  try {
    const player = await players.findOrCreateFromTelegram(telegramUser());
    playerIds.push(player.id);
    await players.completeTutorial(player.id);
    // Walks through all six prize kinds in turn.
    let roll = 0;
    const service = new ChestShopService(pool, { random: () => ((roll++ % 6) + 0.5) / 6 });
    const now = new Date("2031-07-02T10:00:00Z"); // a Wednesday

    const initial = await service.getShop(player.id, now);
    assert.equal(initial.status, "available");
    assert.equal(initial.possiblePrizes.length, 6);
    await rejectsWith(service.openChest(player.id, 1, now), "chest_shop_closed");

    const opened = await service.openShop(player.id, now);
    assert.equal(opened.status, "open");
    assert.equal(opened.chestNumber, 1);
    assert.equal(opened.price, 10_000);
    assert.equal(opened.openUntil, "2031-07-02T14:00:00.000Z");
    await rejectsWith(service.openShop(player.id, now), "chest_shop_unavailable");

    await pool.query("UPDATE players SET silver = 10000, gold = 0 WHERE id = $1", [player.id]);
    await rejectsWith(service.openChest(player.id, 2, now), "chest_shop_conflict");
    const first = await service.openChest(player.id, 1, now);
    assert.equal(first.prize.kind, "gold_small");
    assert.equal(first.prize.amount, 20);
    assert.deepEqual(first.player, { gold: 20, silver: 0 });
    assert.equal(first.shop.chestNumber, 2);
    await rejectsWith(service.openChest(player.id, 2, now), "not_enough_silver");

    await pool.query("UPDATE players SET silver = 20000000 WHERE id = $1", [player.id]);
    const kinds = new Set<string>([first.prize.kind]);
    for (let chestNumber = 2; chestNumber <= 15; chestNumber += 1) {
      const result = await service.openChest(player.id, chestNumber, now);
      kinds.add(result.prize.kind);
    }
    assert.deepEqual([...kinds].sort(), ["card", "diamonds", "equipment", "gold_large", "gold_small", "source"]);
    const after = await service.getShop(player.id, now);
    // The 15th chest closes the shop and this week's opening is used.
    assert.equal(after.status, "closed");
    assert.equal(after.chestNumber, 1);
    const silver = await pool.query<{ silver: string }>("SELECT silver FROM players WHERE id = $1", [player.id]);
    const spent = CHEST_SHOP_CHESTS.slice(1).reduce((sum, { price }) => sum + price, 0);
    assert.equal(Number(silver.rows[0]!.silver), 20_000_000 - spent);
    const openings = await pool.query("SELECT 1 FROM chest_shop_openings WHERE player_id = $1", [player.id]);
    assert.equal(openings.rowCount, 15);
    assert.ok(after.feed.some((entry) => entry.chestNumber === 15));

    // Next Monday the weekly opening is back; an expired shop restarts from chest 1.
    const nextMonday = new Date("2031-07-07T00:05:00Z");
    assert.equal((await service.getShop(player.id, nextMonday)).status, "available");
    await pool.query("UPDATE players SET chest_shop_open_until = $2, chest_shop_next = 6 WHERE id = $1", [player.id, new Date("2031-07-07T00:01:00Z")]);
    const expired = await service.getShop(player.id, nextMonday);
    assert.equal(expired.chestNumber, 1);
    assert.equal((await service.openShop(player.id, nextMonday)).chestNumber, 1);
  } finally {
    if (playerIds.length) await pool.query("DELETE FROM players WHERE id = ANY($1::uuid[])", [playerIds]);
    await pool.end();
  }
});
