import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import type { ValidatedTelegramUser } from "../auth/telegramInitData.js";
import { PlayerRepository } from "../users/playerRepository.js";
import { HolidayLimitReachedError, HolidayNotActiveError, HolidayShopService } from "./holidayShopService.js";
import { InsufficientShopFundsError, ShopPersistenceError } from "./shopService.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
let sequence = 0n;

function createTelegramUser(): ValidatedTelegramUser {
  sequence += 1n;
  return {
    id: String(BigInt(Date.now()) * 1_000_000n + BigInt(process.pid) * 100n + sequence),
    username: null,
    firstName: "Holiday shop test",
    lastName: null,
    photoUrl: null,
  };
}

const firstRandom = { nextInt: () => 0 };
// July has no seeded holiday, so the fixture holiday is the only one running.
const duringHoliday = () => new Date("2031-07-03T12:00:00Z");
const afterHoliday = () => new Date("2031-07-06T00:00:00Z");

async function createFixture(pool: Pool) {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const collectionCode = `test_holiday_${suffix}`;
  const collectionId = `collection_${collectionCode}`;
  const holidayId = `test_holiday_${suffix}`;
  const bundleId = `test_holiday_bundle_${suffix}`;
  const cardIds = [0, 1, 2].map((index) => `test_holiday_card_${suffix}_${index}`);
  await pool.query(
    "INSERT INTO collections (id, code, display_name, buff_type, buff_value, buff_scope, bonus_label, position) VALUES ($1, $2, 'Святкова тестова', 'none', 0, 'all_battles', '', 999)",
    [collectionId, collectionCode],
  );
  for (const [index, cardId] of cardIds.entries()) {
    await pool.query(
      "INSERT INTO cards (id, code, display_name, art_key, element, collection_id) VALUES ($1, $2, 'Holiday test card', NULL, 'fire', $3)",
      [cardId, cardId.replaceAll("_", "-"), collectionId],
    );
    await pool.query("INSERT INTO collection_cards (collection_id, card_id, position) VALUES ($1, $2, $3)", [collectionId, cardId, index + 1]);
  }
  await pool.query(
    "INSERT INTO shop_holidays (id, display_name, description, start_month, start_day, end_month, end_day, position) VALUES ($1, 'Тестове свято', 'Опис', 7, 1, 7, 5, 999)",
    [holidayId],
  );
  await pool.query(
    "INSERT INTO shop_holiday_bundles (id, holiday_id, display_name, collection_code, card_count, rarity, currency, price, purchase_limit, position) VALUES ($1, $2, 'Тестовий набір', $3, 2, 'epic', 'gold', 100, 1, 1)",
    [bundleId, holidayId, collectionCode],
  );
  return {
    bundleId,
    holidayId,
    async cleanup() {
      await pool.query("DELETE FROM shop_holidays WHERE id = $1", [holidayId]);
      await pool.query("DELETE FROM player_card_instances WHERE card_id = ANY($1::text[])", [cardIds]);
      await pool.query("DELETE FROM cards WHERE id = ANY($1::text[])", [cardIds]);
      await pool.query("DELETE FROM collections WHERE id = $1", [collectionId]);
    },
  };
}

async function playerState(pool: Pool, playerId: string, bundleId: string) {
  const gold = await pool.query<{ gold: number }>("SELECT gold FROM players WHERE id = $1", [playerId]);
  const instances = await pool.query<{ count: string }>(
    "SELECT COUNT(*) AS count FROM player_card_instances instances INNER JOIN cards ON cards.id = instances.card_id WHERE instances.player_id = $1 AND cards.id LIKE 'test_holiday_card_%'",
    [playerId],
  );
  const counter = await pool.query("SELECT 1 FROM player_holiday_bundle_purchases WHERE player_id = $1 AND bundle_id = $2", [playerId, bundleId]);
  return { gold: Number(gold.rows[0]?.gold), holidayCards: Number(instances.rows[0]?.count), counterRows: counter.rowCount };
}

test("a holiday bundle debits gold, grants distinct cards and respects its limit", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const fixture = await createFixture(pool);
  const user = createTelegramUser();
  try {
    const player = await new PlayerRepository(pool).findOrCreateFromTelegram(user);
    await pool.query("UPDATE players SET gold = 250 WHERE id = $1", [player.id]);
    const shop = new HolidayShopService(pool, { now: duringHoliday, rng: firstRandom });

    const catalog = await shop.getCatalog(player.id);
    const holiday = catalog.holidays.find(({ id }) => id === fixture.holidayId);
    assert.equal(holiday?.active, true);
    assert.equal(holiday?.endsAt, "2031-07-06T00:00:00.000Z");
    assert.deepEqual(holiday?.bundles.map(({ purchased, canAfford, collectionName }) => ({ purchased, canAfford, collectionName })), [
      { purchased: 0, canAfford: true, collectionName: "Святкова тестова" },
    ]);

    const result = await shop.purchase(player.id, fixture.bundleId);
    assert.equal(result.rewards.length, 2);
    assert.equal(new Set(result.rewards.map(({ cardId }) => cardId)).size, 2);
    assert.ok(result.rewards.every(({ rarity }) => rarity === "epic"));
    assert.deepEqual({ gold: result.updatedBalance.gold, purchased: result.purchased }, { gold: 150, purchased: 1 });

    await assert.rejects(shop.purchase(player.id, fixture.bundleId), HolidayLimitReachedError);
    assert.deepEqual(await playerState(pool, player.id, fixture.bundleId), { gold: 150, holidayCards: 2, counterRows: 1 });
    const reopened = await shop.getCatalog(player.id);
    assert.equal(reopened.holidays.find(({ id }) => id === fixture.holidayId)?.bundles[0]?.purchased, 1);
  } finally {
    await pool.query("DELETE FROM players WHERE telegram_user_id = $1", [user.id]);
    await fixture.cleanup();
    await pool.end();
  }
});

test("a failed holiday purchase leaves gold, cards and the limit untouched", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const fixture = await createFixture(pool);
  const user = createTelegramUser();
  try {
    const player = await new PlayerRepository(pool).findOrCreateFromTelegram(user);
    await pool.query("UPDATE players SET gold = 99 WHERE id = $1", [player.id]);
    await assert.rejects(
      new HolidayShopService(pool, { now: duringHoliday, rng: firstRandom }).purchase(player.id, fixture.bundleId),
      InsufficientShopFundsError,
    );
    await assert.rejects(
      new HolidayShopService(pool, { now: afterHoliday, rng: firstRandom }).purchase(player.id, fixture.bundleId),
      HolidayNotActiveError,
    );

    await pool.query("UPDATE players SET gold = 250 WHERE id = $1", [player.id]);
    const failingDeck = new HolidayShopService(pool, {
      now: duringHoliday,
      rng: firstRandom,
      recalculateDeck: async () => { throw new Error("deck failure after cards were inserted"); },
    });
    await assert.rejects(failingDeck.purchase(player.id, fixture.bundleId), ShopPersistenceError);
    assert.deepEqual(await playerState(pool, player.id, fixture.bundleId), { gold: 250, holidayCards: 0, counterRows: 0 });

    const outside = await new HolidayShopService(pool, { now: afterHoliday }).getCatalog(player.id);
    assert.equal(outside.holidays.some(({ id, active }) => id === fixture.holidayId && active), false);
  } finally {
    await pool.query("DELETE FROM players WHERE telegram_user_id = $1", [user.id]);
    await fixture.cleanup();
    await pool.end();
  }
});
