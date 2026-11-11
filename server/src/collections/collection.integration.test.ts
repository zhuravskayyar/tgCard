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
    assert.equal(before.collection.discoveredCards, predators.cards.length);
    assert.equal(before.collection.completed, true);
    const collectionWithoutCover = COLLECTIONS.find(({ coverArtKey }) => coverArtKey === null);
    assert.ok(collectionWithoutCover);
    const fallbackCover = await repository.detail(player.id, collectionWithoutCover.id);
    assert.equal(fallbackCover.collection.coverArtKey, collectionWithoutCover.cards[0]?.artKey ?? collectionWithoutCover.cards[0]?.code);
    assert.ok(before.cards.every(({ description }) => description.trim().length > 0));

    await pool.query(
      `DELETE FROM player_card_instances
       WHERE player_id = $1 AND card_id = ANY($2::text[])`,
      [player.id, predators.cards.slice(0, 4).map(({ id }) => id)],
    );
    const after = await repository.detail(player.id, predators.id);
    const modifiers = getPlayerCollectionModifiers(await getCompletedCollectionModifiers(pool, player.id));
    const bonuses = await getCompletedCollectionBonuses(pool, player.id);
    assert.equal(after.collection.discoveredCards, predators.cards.length);
    assert.equal(after.collection.completed, true);
    assert.equal(modifiers.silverRewardPct, 0);
    assert.deepEqual(bonuses, [{
      bonus: { ...predators.bonus, scope: predators.bonus.scope ?? "all_battles" },
      bonusLabel: predators.bonusLabel,
      collectionId: predators.id,
      collectionName: predators.displayName,
    }]);
    assert.deepEqual((await new PlayerRepository(pool).findSummaryById(player.id)).collectionBonuses, bonuses);
    assert.equal(after.cards.filter(({ ownedCopies }) => ownedCopies === 0).length, 4);

    const preview = await repository.previewCard(player.id, predators.cards[0]!.id);
    assert.deepEqual(preview.card, after.cards.find(({ id }) => id === predators.cards[0]!.id));
    assert.equal(preview.card.discovered, true);
    assert.equal(preview.card.ownedCopies, 0);
    const memberships = COLLECTIONS.filter(({ cards }) => cards.some(({ id }) => id === preview.card.id));
    assert.deepEqual(preview.collections.map(({ id }) => id).sort(), memberships.map(({ id }) => id).sort());
    assert.ok(preview.collections.some(({ id, completed, bonusLabel }) => id === predators.id && completed && bonusLabel === predators.bonusLabel));

    const ownedPreview = await repository.previewCard(player.id, predators.cards[4]!.id);
    assert.equal(ownedPreview.card.ownedCopies, 1);
    assert.ok(ownedPreview.card.strongestInstanceId);

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

test("shop preview reads an undiscovered card without collection membership without discovering it", {
  skip: !databaseUrl,
}, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const telegramId = String(BigInt(Date.now()) * 10_000n + BigInt(process.pid) + 2n);
  const cardId = `test_shop_preview_${randomUUID()}`;
  try {
    const player = await new PlayerRepository(pool).findOrCreateFromTelegram({
      id: telegramId, username: null, firstName: "Shop preview test", lastName: null, photoUrl: null,
    });
    await pool.query(
      `INSERT INTO cards (id, code, display_name, description, element)
       VALUES ($1, $1, 'Undiscovered shop card', 'Preview description', 'water')`,
      [cardId],
    );
    const preview = await new CollectionRepository(pool).previewCard(player.id, cardId);
    assert.equal(preview.card.id, cardId);
    assert.equal(preview.card.description, "Preview description");
    assert.equal(preview.card.discovered, false);
    assert.equal(preview.card.ownedCopies, 0);
    assert.equal(preview.card.strongestInstanceId, null);
    assert.equal(preview.card.collectionId, null);
    assert.deepEqual(preview.collections, []);
    const discoveries = await pool.query(
      "SELECT card_id FROM player_card_discoveries WHERE player_id = $1 AND card_id = $2", [player.id, cardId],
    );
    assert.equal(discoveries.rowCount, 0);
  } finally {
    await pool.query("DELETE FROM players WHERE telegram_user_id = $1", [telegramId]);
    await pool.query("DELETE FROM cards WHERE id = $1", [cardId]);
    await pool.end();
  }
});

test("a four-card collection completes after its fourth discovery", {
  skip: !databaseUrl,
}, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const telegramId = String(BigInt(Date.now()) * 10_000n + BigInt(process.pid) + 1n);
  const user: ValidatedTelegramUser = {
    id: telegramId,
    username: null,
    firstName: "Four-card collection test",
    lastName: null,
    photoUrl: null,
  };
  // This small collection is a fixture: active collections now all contain ten cards.
  const fixtureCode = `test_four_${Date.now()}`;
  const elementalSpirits = { id: `collection_${fixtureCode}`, cards: Array.from({ length: 4 }, (_, index) => ({ id: `${fixtureCode}_${index}` })) };
  await pool.query(
    "INSERT INTO collections (id, code, display_name, buff_type, buff_value, buff_scope, bonus_label, position) VALUES ($1, $2, 'Test collection', 'none', 0, 'all_battles', '', 999)",
    [elementalSpirits.id, fixtureCode],
  );
  for (const card of elementalSpirits.cards) await pool.query(
    "INSERT INTO cards (id, code, display_name, element, collection_id) VALUES ($1, $1, 'Test collection card', 'fire', $2)",
    [card.id, elementalSpirits.id],
  );
  for (const [index, card] of elementalSpirits.cards.entries()) await pool.query(
    "INSERT INTO collection_cards (collection_id, card_id, position) VALUES ($1, $2, $3)",
    [elementalSpirits.id, card.id, index + 1],
  );

  try {
    const player = await new PlayerRepository(pool).findOrCreateFromTelegram(user);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      let completionCount = 0;
      for (const card of elementalSpirits.cards) {
        const discovery = await recordCardDiscovery(client, player.id, card.id);
        if (discovery.collectionCompleted) completionCount += 1;
      }
      await client.query("COMMIT");
      assert.equal(completionCount, 1);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const detail = await new CollectionRepository(pool).detail(player.id, elementalSpirits.id);
    assert.equal(detail.collection.totalCards, 4);
    assert.equal(detail.collection.discoveredCards, 4);
    assert.equal(detail.collection.completed, true);
    assert.deepEqual(getPlayerCollectionModifiers(await getCompletedCollectionModifiers(pool, player.id)), {
      altarGoldLevels: 0,
      absorptionEfficiencyPct: 0,
      battleDamagePct: 0,
      battleHpPct: 0,
      deckPowerPct: 0,
      duelCooldownMinutes: 0,
      duelGoldLimitBonus: 0,
      duelGoldSharePct: 0,
      elementDamagePct: { fire: 0, water: 0, air: 0, earth: 0 },
      experienceRewardPct: 0,
      silverRewardPct: 0,
    });
  } finally {
    await pool.query("DELETE FROM players WHERE telegram_user_id = $1", [telegramId]);
    await pool.query("DELETE FROM cards WHERE collection_id = $1", [elementalSpirits.id]);
    await pool.query("DELETE FROM collections WHERE id = $1", [elementalSpirits.id]);
    await pool.end();
  }
});
