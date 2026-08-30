import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { getPlayerCollectionModifiers } from "@cardastika/game-core";
import { Pool } from "pg";
import type { ValidatedTelegramUser } from "../auth/telegramInitData.js";
import { PlayerRepository } from "../users/playerRepository.js";
import { CollectionRepository } from "./collectionRepository.js";
import { COLLECTIONS } from "./collectionCatalog.js";
import { getCompletedCollectionBonuses, getCompletedCollectionModifiers, recordCardDiscovery } from "./discoveryService.js";

const databaseUrl = process.env.DATABASE_URL?.trim();

test("completed progress and bonus survive consuming four current instances", {
  skip: !databaseUrl,
}, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const telegramId = String(BigInt(Date.now()) * 10_000n + BigInt(process.pid));
  const user: ValidatedTelegramUser = {
    id: telegramId,
    username: null,
    firstName: "Collection permanence test",
    lastName: null,
    photoUrl: null,
  };
  const predators = COLLECTIONS[0]!;

  try {
    const player = await new PlayerRepository(pool).findOrCreateFromTelegram(user);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      let completionCount = 0;
      for (const card of predators.cards) {
        await client.query(
          `INSERT INTO player_card_instances (id, player_id, card_id, level, bonus_power)
           VALUES ($1, $2, $3, 1, 0)`,
          [randomUUID(), player.id, card.id],
        );
        const discovery = await recordCardDiscovery(client, player.id, card.id);
        if (discovery.collectionCompleted) completionCount += 1;
      }
      assert.equal(completionCount, 1);
      assert.deepEqual(await recordCardDiscovery(client, player.id, predators.cards[5]!.id), { newDiscovery: false });
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const repository = new CollectionRepository(pool);
    const before = await repository.detail(player.id, predators.id);
    assert.equal(before.collection.discoveredCards, 6);
    assert.equal(before.collection.completed, true);
    const collectionWithoutCover = COLLECTIONS.find(({ coverArtKey }) => coverArtKey === null);
    assert.ok(collectionWithoutCover);
    const fallbackCover = await repository.detail(player.id, collectionWithoutCover.id);
    assert.equal(fallbackCover.collection.coverArtKey, collectionWithoutCover.cards[0]?.artKey);
    assert.ok(before.cards.every(({ description }) => description.trim().length > 0));

    await pool.query(
      `DELETE FROM player_card_instances
       WHERE player_id = $1 AND card_id = ANY($2::text[])`,
      [player.id, predators.cards.slice(0, 4).map(({ id }) => id)],
    );
    const after = await repository.detail(player.id, predators.id);
    const modifiers = getPlayerCollectionModifiers(await getCompletedCollectionModifiers(pool, player.id));
    const bonuses = await getCompletedCollectionBonuses(pool, player.id);
    assert.equal(after.collection.discoveredCards, 6);
    assert.equal(after.collection.completed, true);
    assert.equal(modifiers.battleDamagePct, 3);
    assert.deepEqual(bonuses, [{
      bonus: predators.bonus,
      bonusLabel: predators.bonusLabel,
      collectionId: predators.id,
      collectionName: predators.displayName,
    }]);
    assert.deepEqual((await new PlayerRepository(pool).findSummaryById(player.id)).collectionBonuses, bonuses);
    assert.equal(after.cards.filter(({ ownedCopies }) => ownedCopies === 0).length, 4);

    const completionRows = await pool.query<{ count: string }>(
      "SELECT count(*) FROM player_collection_completions WHERE player_id = $1 AND collection_id = $2",
      [player.id, predators.id],
    );
    assert.equal(Number(completionRows.rows[0]?.count), 1);
  } finally {
    await pool.query("DELETE FROM players WHERE telegram_user_id = $1", [telegramId]);
    await pool.end();
  }
});
