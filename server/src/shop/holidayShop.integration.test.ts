import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import type { ValidatedTelegramUser } from "../auth/telegramInitData.js";
import { PlayerRepository } from "../users/playerRepository.js";
import { HolidayLimitReachedError, HolidayNotActiveError, HolidayShopService } from "./holidayShopService.js";
import { InsufficientShopFundsError, ShopCollectionCompleteError, ShopPersistenceError, ShopPriceChangedError } from "./shopService.js";

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
  const oneBundleId = `test_holiday_one_${suffix}`;
  const fullBundleId = `test_holiday_full_${suffix}`;
  // Ladder prices of the three cards: rare 25, rare 25, epic 37.5.
  const cardRarities = ["rare", "rare", "epic"];
  const cardIds = [0, 1, 2].map((index) => `test_holiday_card_${suffix}_${index}`);
  await pool.query(
    "INSERT INTO collections (id, code, display_name, buff_type, buff_value, buff_scope, bonus_label, position) VALUES ($1, $2, 'Святкова тестова', 'none', 0, 'all_battles', '', 999)",
    [collectionId, collectionCode],
  );
  for (const [index, cardId] of cardIds.entries()) {
    await pool.query(
      "INSERT INTO cards (id, code, display_name, art_key, element, collection_id, min_rarity) VALUES ($1, $2, 'Holiday test card', NULL, 'fire', $3, $4)",
      [cardId, cardId.replaceAll("_", "-"), collectionId, cardRarities[index]],
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
  await pool.query(
    "INSERT INTO shop_holiday_bundles (id, holiday_id, display_name, collection_code, card_count, rarity, currency, price, purchase_limit, position) VALUES ($1, $2, 'Одна карта', $3, 1, 'epic', 'gold', 10, 3, 2)",
    [oneBundleId, holidayId, collectionCode],
  );
  await pool.query(
    "INSERT INTO shop_holiday_bundles (id, holiday_id, display_name, collection_code, card_count, rarity, currency, price, purchase_limit, position, full_set) VALUES ($1, $2, 'Уся колекція', $3, 3, 'epic', 'gold', 90, 1, 3, TRUE)",
    [fullBundleId, holidayId, collectionCode],
  );
  return {
    bundleId,
    cardIds,
    fullBundleId,
    holidayId,
    oneBundleId,
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
    assert.deepEqual(holiday?.bundles.map(({ purchased, canAfford, collectionName, fullSet }) => ({ purchased, canAfford, collectionName, fullSet })), [
      { purchased: 0, canAfford: true, collectionName: "Святкова тестова", fullSet: false },
      { purchased: 0, canAfford: true, collectionName: "Святкова тестова", fullSet: false },
      { purchased: 0, canAfford: true, collectionName: "Святкова тестова", fullSet: true },
    ]);

    const result = await shop.purchase(player.id, fixture.bundleId);
    assert.equal(result.rewards.length, 2);
    assert.equal(new Set(result.rewards.map(({ cardId }) => cardId)).size, 2);
    assert.ok(result.rewards.every(({ rarity }) => rarity === "epic"));
    // A stale price is refused without spending anything.
    await assert.rejects(shop.purchase(player.id, fixture.oneBundleId, 11), ShopPriceChangedError);
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

test("a random holiday card prefers undiscovered cards and falls back to any card", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const fixture = await createFixture(pool);
  const user = createTelegramUser();
  try {
    const player = await new PlayerRepository(pool).findOrCreateFromTelegram(user);
    await pool.query("UPDATE players SET gold = 200 WHERE id = $1", [player.id]);
    // The always-zero rng would pick card 0 without the preference; cards 0 and 1 are already discovered.
    for (const cardId of fixture.cardIds.slice(0, 2)) {
      await pool.query("INSERT INTO player_card_discoveries (player_id, card_id) VALUES ($1, $2)", [player.id, cardId]);
    }
    const shop = new HolidayShopService(pool, { now: duringHoliday, rng: firstRandom });

    const first = await shop.purchase(player.id, fixture.oneBundleId, 10);
    assert.deepEqual(first.rewards.map(({ cardId }) => cardId), [fixture.cardIds[2]]);
    assert.deepEqual(first.newDiscoveryCardIds, [fixture.cardIds[2]]);
    // Everything discovered: any card again.
    const second = await shop.purchase(player.id, fixture.oneBundleId, 10);
    assert.equal(second.rewards.length, 1);
    assert.deepEqual(second.newDiscoveryCardIds, []);

    // A two-card bundle with one new card gives the new one plus one other.
    await pool.query("DELETE FROM player_card_discoveries WHERE player_id = $1 AND card_id = $2", [player.id, fixture.cardIds[1]]);
    const pair = await shop.purchase(player.id, fixture.bundleId);
    assert.ok(pair.rewards.some(({ cardId }) => cardId === fixture.cardIds[1]));
    assert.equal(new Set(pair.rewards.map(({ cardId }) => cardId)).size, 2);
  } finally {
    await pool.query("DELETE FROM players WHERE telegram_user_id = $1", [user.id]);
    await fixture.cleanup();
    await pool.end();
  }
});

test("a full holiday set is priced by the missing cards and grants only those", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const fixture = await createFixture(pool);
  const user = createTelegramUser();
  try {
    const player = await new PlayerRepository(pool).findOrCreateFromTelegram(user);
    await pool.query("UPDATE players SET gold = 300 WHERE id = $1", [player.id]);
    const shop = new HolidayShopService(pool, { now: duringHoliday, rng: firstRandom });
    const offerOf = async () => (await shop.getCatalog(player.id)).holidays.find(({ id }) => id === fixture.holidayId)!.bundles.find(({ id }) => id === fixture.fullBundleId)!;
    const discover = (cardId: string) => pool.query("INSERT INTO player_card_discoveries (player_id, card_id) VALUES ($1, $2)", [player.id, cardId]);

    // Nothing discovered: the configured whole-collection price.
    assert.deepEqual({ price: (await offerOf()).price, missing: (await offerOf()).missingCount, cards: (await offerOf()).cardCount }, { price: 90, missing: 3, cards: 3 });
    // Ladder: missing the epic alone 37.5 → 40; missing rare + epic 62.5 → 65, below the 90 of the whole set.
    await discover(fixture.cardIds[0]!);
    await discover(fixture.cardIds[1]!);
    assert.deepEqual({ price: (await offerOf()).price, missing: (await offerOf()).missingCount }, { price: 40, missing: 1 });
    await pool.query("DELETE FROM player_card_discoveries WHERE player_id = $1 AND card_id = $2", [player.id, fixture.cardIds[1]]);
    assert.deepEqual({ price: (await offerOf()).price, missing: (await offerOf()).missingCount }, { price: 65, missing: 2 });

    await assert.rejects(shop.purchase(player.id, fixture.fullBundleId, 90), ShopPriceChangedError);
    const gold = async () => Number((await pool.query<{ gold: number }>("SELECT gold FROM players WHERE id = $1", [player.id])).rows[0]?.gold);
    assert.equal(await gold(), 300);

    const result = await shop.purchase(player.id, fixture.fullBundleId, 65);
    // Only the undiscovered cards, each at the level range of its own rarity.
    assert.deepEqual(result.rewards.map(({ cardId, rarity }) => ({ cardId, rarity })).sort((a, b) => a.cardId.localeCompare(b.cardId)), [
      { cardId: fixture.cardIds[1], rarity: "rare" },
      { cardId: fixture.cardIds[2], rarity: "epic" },
    ]);
    assert.deepEqual(result.newDiscoveryCardIds.sort(), [fixture.cardIds[1], fixture.cardIds[2]].sort());
    assert.ok(result.collectionCompleted);
    assert.deepEqual({ gold: result.updatedBalance.gold, purchased: result.purchased }, { gold: 235, purchased: 1 });

    // Fully collected: «Зібрано» (the list price stays positive) and no purchase.
    assert.deepEqual({ price: (await offerOf()).price, missing: (await offerOf()).missingCount, purchased: (await offerOf()).purchased }, { price: 90, missing: 0, purchased: 1 });
    await assert.rejects(shop.purchase(player.id, fixture.fullBundleId, 90), ShopCollectionCompleteError);
    // The limit of one per occurrence still holds when a card is undiscovered again.
    await pool.query("DELETE FROM player_card_discoveries WHERE player_id = $1 AND card_id = $2", [player.id, fixture.cardIds[2]]);
    await assert.rejects(shop.purchase(player.id, fixture.fullBundleId, 40), HolidayLimitReachedError);
    assert.equal(await gold(), 235);
  } finally {
    await pool.query("DELETE FROM players WHERE telegram_user_id = $1", [user.id]);
    await fixture.cleanup();
    await pool.end();
  }
});

test("the six seeded holiday full sets exist and cost their ladder price", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const rows = await pool.query<{ collection_code: string; price: number; card_count: number; actual: string }>(
      `
        SELECT bundles.collection_code, bundles.price, bundles.card_count,
          (SELECT COUNT(*) FROM collection_cards INNER JOIN collections ON collections.id = collection_cards.collection_id WHERE collections.code = bundles.collection_code) AS actual
        FROM shop_holiday_bundles bundles WHERE bundles.full_set = TRUE AND bundles.id LIKE '%\_set' ORDER BY bundles.collection_code
      `,
    );
    assert.deepEqual(rows.rows.map((row) => [row.collection_code, Number(row.price)]), [
      ["ancient_order", 230], ["berserks", 100], ["dragon_whisperers", 100], ["dwarves_peace", 100], ["treasure_hunters", 100], ["ufavorites", 100],
    ]);
    for (const row of rows.rows) assert.equal(Number(row.actual), Number(row.card_count), `${row.collection_code} size`);
  } finally {
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
