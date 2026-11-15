import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import type { ValidatedTelegramUser } from "../auth/telegramInitData.js";
import { PlayerRepository } from "../users/playerRepository.js";
import type { CollectionPackConfig } from "./collectionPackConfig.js";
import { CollectionPackLimitReachedError, CollectionPackNotActiveError, CollectionPackService } from "./collectionPackService.js";
import { InsufficientShopFundsError, ShopBundleMissingError, ShopCollectionCompleteError, ShopPersistenceError, ShopPriceChangedError } from "./shopService.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
let sequence = 0n;

function createTelegramUser(): ValidatedTelegramUser {
  sequence += 1n;
  return {
    id: String(BigInt(Date.now()) * 1_000_000n + BigInt(process.pid) * 100n + sequence),
    username: null,
    firstName: "Collection pack test",
    lastName: null,
    photoUrl: null,
  };
}

const firstRandom = { nextInt: () => 0 };
const NOW = new Date("2031-07-09T12:00:00Z");

async function createFixture(pool: Pool) {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const codes = { a: `test_pack_a_${suffix}`, b: `test_pack_b_${suffix}` };
  const collectionIds = { a: `collection_${codes.a}`, b: `collection_${codes.b}` };
  const rarities = ["uncommon", "uncommon", "rare"] as const;
  const aCards = rarities.map((_, index) => `test_pack_card_${suffix}_a${index}`);
  const bCards = [`test_pack_card_${suffix}_b0`];
  // collections.position is unique; take two free slots far above the real catalog.
  const basePosition = 1_000_000 + Math.floor(Math.random() * 1_000_000) * 2;
  for (const [key, name, position] of [["a", "Тестовий пакет А", basePosition], ["b", "Тестовий пакет Б", basePosition + 1]] as const) {
    await pool.query(
      "INSERT INTO collections (id, code, display_name, buff_type, buff_value, buff_scope, bonus_label, position) VALUES ($1, $2, $3, 'none', 0, 'all_battles', $5, $4)",
      [collectionIds[key], codes[key], name, position, key === "a" ? "+10% тестового золота" : ""],
    );
  }
  const insertCard = async (cardId: string, collection: "a" | "b", index: number, rarity: string) => {
    await pool.query(
      "INSERT INTO cards (id, code, display_name, art_key, element, collection_id, min_rarity) VALUES ($1, $2, 'Pack test card', NULL, 'fire', $3, $4)",
      [cardId, cardId.replaceAll("_", "-"), collectionIds[collection], rarity],
    );
    await pool.query("INSERT INTO collection_cards (collection_id, card_id, position) VALUES ($1, $2, $3)", [collectionIds[collection], cardId, index + 1]);
  };
  for (const [index, cardId] of aCards.entries()) await insertCard(cardId, "a", index, rarities[index]!);
  await insertCard(bCards[0]!, "b", 0, "epic");

  const packs: CollectionPackConfig[] = [
    { id: `pack_a_${suffix}`, displayName: "Пакет А", collectionCodes: [codes.a], setPrices: { [codes.a]: 60 }, randomPrice: 20 },
    { id: `pack_b_${suffix}`, displayName: "Пакет Б", collectionCodes: [codes.b], setPrices: { [codes.b]: 40 }, randomPrice: 50 },
  ];
  const week = (weekKey: string, packIds: string[]) => () => ({ packIds, weekKey, endsAt: new Date("2031-07-14T00:00:00Z") });
  const allCards = [...aCards, ...bCards];
  return {
    aCards,
    codes,
    packs,
    activeA: week("2031-07-07", [packs[0]!.id]),
    activeANextWeek: week("2031-07-14", [packs[0]!.id]),
    activeB: week("2031-07-07", [packs[1]!.id]),
    async cleanup() {
      await pool.query("DELETE FROM player_card_instances WHERE card_id = ANY($1::text[])", [allCards]);
      await pool.query("DELETE FROM cards WHERE id = ANY($1::text[])", [allCards]);
      await pool.query("DELETE FROM collections WHERE id = ANY($1::text[])", [Object.values(collectionIds)]);
    },
  };
}

async function state(pool: Pool, playerId: string, cardIds: string[]) {
  const gold = await pool.query<{ gold: number }>("SELECT gold FROM players WHERE id = $1", [playerId]);
  const instances = await pool.query<{ count: string }>("SELECT COUNT(*) AS count FROM player_card_instances WHERE player_id = $1 AND card_id = ANY($2::text[])", [playerId, cardIds]);
  const counters = await pool.query("SELECT 1 FROM player_collection_pack_purchases WHERE player_id = $1 AND collection_code LIKE 'test_pack_%'", [playerId]);
  return { gold: Number(gold.rows[0]?.gold), cards: Number(instances.rows[0]?.count), counterRows: counters.rowCount };
}

async function withPlayer(run: (pool: Pool, playerId: string, fixture: Awaited<ReturnType<typeof createFixture>>) => Promise<void>) {
  const pool = new Pool({ connectionString: databaseUrl });
  const fixture = await createFixture(pool);
  const user = createTelegramUser();
  try {
    const player = await new PlayerRepository(pool).findOrCreateFromTelegram(user);
    await run(pool, player.id, fixture);
  } finally {
    await pool.query("DELETE FROM players WHERE telegram_user_id = $1", [user.id]);
    await fixture.cleanup();
    await pool.end();
  }
}

test("a full collection grants every card at its own rarity once per week", { skip: !databaseUrl }, async () => {
  await withPlayer(async (pool, playerId, fixture) => {
    await pool.query("UPDATE players SET gold = 200 WHERE id = $1", [playerId]);
    const shop = new CollectionPackService(pool, { now: () => NOW, rng: firstRandom, packs: fixture.packs, rotation: fixture.activeA });

    const catalog = await shop.getCatalog(playerId);
    assert.equal(catalog.endsAt, "2031-07-14T00:00:00.000Z");
    assert.equal(catalog.packs.length, 1);
    const offer = catalog.packs[0]!.setOffers[0]!;
    assert.deepEqual({ price: offer.price, purchased: offer.purchased, limit: offer.purchaseLimit, cards: offer.cards.length, canAfford: offer.canAfford }, { price: 60, purchased: 0, limit: 1, cards: 3, canAfford: true });
    // Nothing discovered: the configured set price (not the 55 of the ladder), the collection bonus and the schedule.
    assert.deepEqual({ missing: offer.missingCount, bonus: offer.bonusLabel }, { missing: 3, bonus: "+10% тестового золота" });
    assert.equal(catalog.packs[0]!.returnsInWeeks, 1);
    assert.deepEqual(catalog.nextWeekPackNames, ["Пакет А"]);
    assert.deepEqual(catalog.packs[0]!.randomOffer, { id: catalog.packs[0]!.randomOffer.id, price: 20, totalCount: 3, discoveredCount: 0, canAfford: true });

    const result = await shop.purchase(playerId, offer.id);
    assert.deepEqual(result.rewards.map(({ rarity }) => rarity).sort(), ["rare", "uncommon", "uncommon"]);
    assert.equal(new Set(result.rewards.map(({ cardId }) => cardId)).size, 3);
    assert.equal(result.newDiscoveryCardIds.length, 3);
    assert.ok(result.collectionCompleted);
    assert.deepEqual({ gold: result.updatedBalance.gold, purchased: result.purchased }, { gold: 140, purchased: 1 });

    // Fully collected: nothing to buy, whatever the limit says.
    await assert.rejects(shop.purchase(playerId, offer.id), ShopCollectionCompleteError);
    assert.deepEqual(await state(pool, playerId, fixture.aCards), { gold: 140, cards: 3, counterRows: 1 });
    const done = (await shop.getCatalog(playerId)).packs[0]!;
    assert.deepEqual({ purchased: done.setOffers[0]!.purchased, missing: done.setOffers[0]!.missingCount, price: done.setOffers[0]!.price }, { purchased: 1, missing: 0, price: 60 });
    assert.equal(done.randomOffer.discoveredCount, 3);

    // One card is undiscovered again: the weekly limit still blocks the top-up, a new rotation week starts a fresh one.
    await pool.query("DELETE FROM player_card_discoveries WHERE player_id = $1 AND card_id = $2", [playerId, fixture.aCards[2]]);
    await assert.rejects(shop.purchase(playerId, offer.id), CollectionPackLimitReachedError);
    const nextWeek = new CollectionPackService(pool, { now: () => NOW, rng: firstRandom, packs: fixture.packs, rotation: fixture.activeANextWeek });
    const topUp = await nextWeek.purchase(playerId, offer.id, 25);
    assert.deepEqual({ purchased: topUp.purchased, cards: topUp.rewards.length }, { purchased: 1, cards: 1 });
    assert.equal((await state(pool, playerId, fixture.aCards)).gold, 115);
  });
});

test("buying the missing cards charges the ladder price and grants only undiscovered cards", { skip: !databaseUrl }, async () => {
  await withPlayer(async (pool, playerId, fixture) => {
    await pool.query("UPDATE players SET gold = 200 WHERE id = $1", [playerId]);
    const shop = new CollectionPackService(pool, { now: () => NOW, rng: firstRandom, packs: fixture.packs, rotation: fixture.activeA });
    const setOfferId = `set:${fixture.codes.a}`;
    const offerOf = async () => (await shop.getCatalog(playerId)).packs[0]!.setOffers[0]!;
    const discover = (cardId: string) => pool.query("INSERT INTO player_card_discoveries (player_id, card_id) VALUES ($1, $2)", [playerId, cardId]);

    // Cards are uncommon, uncommon, rare: ladder 15 + 15 + 25. Missing two uncommon = 30, one rare = 25, one uncommon = 15.
    await discover(fixture.aCards[2]!);
    assert.deepEqual({ missing: (await offerOf()).missingCount, price: (await offerOf()).price }, { missing: 2, price: 30 });
    await pool.query("DELETE FROM player_card_discoveries WHERE player_id = $1", [playerId]);
    await discover(fixture.aCards[0]!);
    await discover(fixture.aCards[1]!);
    assert.deepEqual({ missing: (await offerOf()).missingCount, price: (await offerOf()).price }, { missing: 1, price: 25 });
    await pool.query("DELETE FROM player_card_discoveries WHERE player_id = $1", [playerId]);
    await discover(fixture.aCards[0]!);
    await discover(fixture.aCards[2]!);
    const offer = await offerOf();
    assert.deepEqual({ missing: offer.missingCount, price: offer.price, canAfford: offer.canAfford }, { missing: 1, price: 15, canAfford: true });

    // A stale price is refused before any gold or card moves.
    await assert.rejects(shop.purchase(playerId, setOfferId, 60), ShopPriceChangedError);
    assert.deepEqual(await state(pool, playerId, fixture.aCards), { gold: 200, cards: 0, counterRows: 0 });

    const result = await shop.purchase(playerId, setOfferId, 15);
    assert.deepEqual(result.rewards.map(({ cardId }) => cardId), [fixture.aCards[1]]);
    assert.deepEqual(result.newDiscoveryCardIds, [fixture.aCards[1]]);
    assert.ok(result.collectionCompleted);
    assert.deepEqual({ gold: result.updatedBalance.gold, purchased: result.purchased }, { gold: 185, purchased: 1 });
    assert.deepEqual(await state(pool, playerId, fixture.aCards), { gold: 185, cards: 1, counterRows: 1 });
    // The set is complete now: its offer shows as collected and the purchase is refused without spending anything.
    assert.equal((await offerOf()).missingCount, 0);
    await assert.rejects(shop.purchase(playerId, setOfferId, 60), ShopCollectionCompleteError);
    assert.equal((await state(pool, playerId, fixture.aCards)).gold, 185);
  });
});

test("packs that are not on sale and unknown offers are rejected", { skip: !databaseUrl }, async () => {
  await withPlayer(async (pool, playerId, fixture) => {
    await pool.query("UPDATE players SET gold = 500 WHERE id = $1", [playerId]);
    const shop = new CollectionPackService(pool, { now: () => NOW, rng: firstRandom, packs: fixture.packs, rotation: fixture.activeA });
    await assert.rejects(shop.purchase(playerId, `set:${fixture.codes.b}`), CollectionPackNotActiveError);
    await assert.rejects(shop.purchase(playerId, `random:${fixture.packs[1]!.id}`), CollectionPackNotActiveError);
    await assert.rejects(shop.purchase(playerId, "set:magic_1"), ShopBundleMissingError);
    await assert.rejects(shop.purchase(playerId, "random:nothing"), ShopBundleMissingError);
    await assert.rejects(shop.purchase(playerId, "garbage"), ShopBundleMissingError);
    assert.deepEqual(await state(pool, playerId, fixture.aCards), { gold: 500, cards: 0, counterRows: 0 });
    assert.equal((await shop.getCatalog(playerId)).packs.some(({ id }) => id === fixture.packs[1]!.id), false);
  });
});

test("a random card prefers undiscovered species and then falls back to any card", { skip: !databaseUrl }, async () => {
  await withPlayer(async (pool, playerId, fixture) => {
    await pool.query("UPDATE players SET gold = 100 WHERE id = $1", [playerId]);
    // The first two cards are already discovered; the always-zero rng would pick card 0 without the preference.
    for (const cardId of fixture.aCards.slice(0, 2)) {
      await pool.query("INSERT INTO player_card_discoveries (player_id, card_id) VALUES ($1, $2)", [playerId, cardId]);
    }
    const shop = new CollectionPackService(pool, { now: () => NOW, rng: firstRandom, packs: fixture.packs, rotation: fixture.activeA });
    const offerId = (await shop.getCatalog(playerId)).packs[0]!.randomOffer.id;

    const first = await shop.purchase(playerId, offerId);
    assert.deepEqual(first.rewards.map(({ cardId }) => cardId), [fixture.aCards[2]]);
    assert.deepEqual(first.newDiscoveryCardIds, [fixture.aCards[2]]);
    assert.equal(first.purchased, 0);
    assert.equal(first.updatedBalance.gold, 80);

    // Everything discovered: any card, no limit, repeated buys keep working.
    const second = await shop.purchase(playerId, offerId);
    assert.ok(fixture.aCards.includes(second.rewards[0]!.cardId));
    assert.deepEqual(second.newDiscoveryCardIds, []);
    await shop.purchase(playerId, offerId);
    assert.equal((await state(pool, playerId, fixture.aCards)).gold, 40);
  });
});

test("a failed pack purchase leaves gold, cards and the limit untouched", { skip: !databaseUrl }, async () => {
  await withPlayer(async (pool, playerId, fixture) => {
    await pool.query("UPDATE players SET gold = 59 WHERE id = $1", [playerId]);
    const options = { now: () => NOW, rng: firstRandom, packs: fixture.packs, rotation: fixture.activeA };
    await assert.rejects(new CollectionPackService(pool, options).purchase(playerId, `set:${fixture.codes.a}`), InsufficientShopFundsError);

    await pool.query("UPDATE players SET gold = 200 WHERE id = $1", [playerId]);
    const failingDeck = new CollectionPackService(pool, {
      ...options,
      recalculateDeck: async () => { throw new Error("deck failure after cards were inserted"); },
    });
    await assert.rejects(failingDeck.purchase(playerId, `set:${fixture.codes.a}`), ShopPersistenceError);
    assert.deepEqual(await state(pool, playerId, fixture.aCards), { gold: 200, cards: 0, counterRows: 0 });
    const discoveries = await pool.query("SELECT 1 FROM player_card_discoveries WHERE player_id = $1 AND card_id = ANY($2::text[])", [playerId, fixture.aCards]);
    assert.equal(discoveries.rowCount, 0);
  });
});
