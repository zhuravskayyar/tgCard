import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { PlayerCard } from "@cardastika/shared";
import { countDeckElements } from "@cardastika/game-core";
import { Pool } from "pg";
import type { ValidatedTelegramUser } from "../auth/telegramInitData.js";
import { DeckRepository } from "../decks/deckRepository.js";
import { InventoryRepository } from "../inventory/inventoryRepository.js";
import { PlayerRepository } from "../users/playerRepository.js";
import {
  InsufficientShopFundsError,
  ShopPersistenceError,
  ShopService,
} from "./shopService.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
let telegramSequence = 0n;

function createTelegramUser(label: string): ValidatedTelegramUser {
  telegramSequence += 1n;
  return {
    id: String(BigInt(Date.now()) * 1_000_000n + BigInt(process.pid) * 100n + telegramSequence),
    username: null,
    firstName: `Shop test ${label}`,
    lastName: null,
    photoUrl: null,
  };
}

function createCard(rarity: PlayerCard["rarity"], element: PlayerCard["element"], power: number) {
  const suffix = randomUUID();
  return {
    cardId: `test_shop_${suffix}`,
    code: `test-shop-${suffix}`,
    displayName: `Shop ${rarity} test card`,
    artKey: null,
    element,
    rarity,
    power,
    collectionId: null,
  } satisfies Omit<PlayerCard, "quantity">;
}

async function insertCards(pool: Pool, cards: readonly Omit<PlayerCard, "quantity">[]) {
  for (const card of cards) {
    await pool.query(
      `
        INSERT INTO cards (id, code, display_name, art_key, element, rarity, power, collection_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        card.cardId,
        card.code,
        card.displayName,
        card.artKey,
        card.element,
        card.rarity,
        card.power,
        card.collectionId,
      ],
    );
  }
}

async function cleanup(pool: Pool, telegramUserIds: string[], cardIds: string[]) {
  await pool.query("DELETE FROM players WHERE telegram_user_id = ANY($1::bigint[])", [telegramUserIds]);
  await pool.query("DELETE FROM cards WHERE id = ANY($1::text[])", [cardIds]);
}

test("all base prices deduct correctly and rewards become real inventory", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const inventory = new InventoryRepository(pool);
  const user = createTelegramUser("prices");
  const rewards = {
    silver_card: createCard("uncommon", "fire", 40),
    epic_card: createCard("epic", "water", 45),
    legendary_card: createCard("legendary", "air", 50),
  };
  const cards = Object.values(rewards);

  try {
    await insertCards(pool, cards);
    const player = await players.findOrCreateFromTelegram(user);
    await pool.query("UPDATE players SET gold = 250 WHERE id = $1", [player.id]);
    const shop = new ShopService(pool, {
      selectReward: async (_client, offer) => rewards[offer.id as keyof typeof rewards],
    });

    const silverPurchase = await shop.purchase(player.id, "silver_card");
    const secondSilverPurchase = await shop.purchase(player.id, "silver_card");
    const epicPurchase = await shop.purchase(player.id, "epic_card");
    const legendaryPurchase = await shop.purchase(player.id, "legendary_card");
    const ownedCards = await inventory.findByPlayerId(player.id);

    assert.deepEqual(silverPurchase.balance, { silver: 1_000, gold: 250 });
    assert.deepEqual(secondSilverPurchase.balance, { silver: 500, gold: 250 });
    assert.deepEqual(epicPurchase.balance, { silver: 500, gold: 200 });
    assert.deepEqual(legendaryPurchase.balance, { silver: 500, gold: 50 });
    assert.equal(ownedCards.find(({ cardId }) => cardId === rewards.silver_card.cardId)?.quantity, 2);
    assert.equal(ownedCards.find(({ cardId }) => cardId === rewards.epic_card.cardId)?.quantity, 1);
    assert.equal(ownedCards.find(({ cardId }) => cardId === rewards.legendary_card.cardId)?.quantity, 1);
    assert.deepEqual(cards.map(({ rarity }) => rarity), ["uncommon", "epic", "legendary"]);
  } finally {
    await cleanup(pool, [user.id], cards.map(({ cardId }) => cardId));
    await pool.end();
  }
});

test("insufficient funds and reward failures never deduct currency", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const user = createTelegramUser("failures");
  const reward = createCard("uncommon", "earth", 30);

  try {
    await insertCards(pool, [reward]);
    const player = await players.findOrCreateFromTelegram(user);
    const insufficientShop = new ShopService(pool, { selectReward: async () => reward });
    await assert.rejects(
      insufficientShop.purchase(player.id, "epic_card"),
      (error) => error instanceof InsufficientShopFundsError,
    );

    const failingRewardShop = new ShopService(pool, {
      selectReward: async () => {
        throw new Error("reward selection failed");
      },
    });
    await assert.rejects(
      failingRewardShop.purchase(player.id, "silver_card"),
      (error) => error instanceof ShopPersistenceError,
    );
    const balance = await pool.query<{ silver: string; gold: string }>(
      "SELECT silver, gold FROM players WHERE id = $1",
      [player.id],
    );
    assert.deepEqual(balance.rows[0], { silver: "1500", gold: "0" });
  } finally {
    await cleanup(pool, [user.id], [reward.cardId]);
    await pool.end();
  }
});

test("inventory, balance, and automatic deck changes roll back together", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const user = createTelegramUser("atomic");
  const reward = createCard("uncommon", "fire", 80);

  try {
    await insertCards(pool, [reward]);
    const player = await players.findOrCreateFromTelegram(user);
    const shop = new ShopService(pool, {
      selectReward: async () => reward,
      recalculateDeck: async () => {
        throw new Error("deck write failed");
      },
    });
    await assert.rejects(shop.purchase(player.id, "silver_card"), (error) => error instanceof ShopPersistenceError);

    const balance = await pool.query<{ silver: string }>("SELECT silver FROM players WHERE id = $1", [player.id]);
    const ownership = await pool.query<{ count: string }>(
      "SELECT count(*) FROM player_cards WHERE player_id = $1 AND card_id = $2",
      [player.id, reward.cardId],
    );
    assert.equal(balance.rows[0]?.silver, "1500");
    assert.equal(ownership.rows[0]?.count, "0");
  } finally {
    await cleanup(pool, [user.id], [reward.cardId]);
    await pool.end();
  }
});

test("concurrent purchases cannot overspend and duplicate ownership increments safely", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const user = createTelegramUser("concurrent");
  const reward = createCard("uncommon", "water", 35);

  try {
    await insertCards(pool, [reward]);
    const player = await players.findOrCreateFromTelegram(user);
    await pool.query("UPDATE players SET silver = 600 WHERE id = $1", [player.id]);
    const shop = new ShopService(pool, { selectReward: async () => reward });
    const results = await Promise.allSettled([
      shop.purchase(player.id, "silver_card"),
      shop.purchase(player.id, "silver_card"),
    ]);
    const balance = await pool.query<{ silver: string }>("SELECT silver FROM players WHERE id = $1", [player.id]);
    const ownership = await pool.query<{ quantity: number }>(
      "SELECT quantity FROM player_cards WHERE player_id = $1 AND card_id = $2",
      [player.id, reward.cardId],
    );

    assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
    assert.equal(results.filter(({ status }) => status === "rejected").length, 1);
    assert.equal(balance.rows[0]?.silver, "100");
    assert.equal(ownership.rows[0]?.quantity, 1);
  } finally {
    await cleanup(pool, [user.id], [reward.cardId]);
    await pool.end();
  }
});

test("a stronger reward can improve only the canonical valid deck while inventory stays unrestricted", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const decks = new DeckRepository(pool);
  const inventory = new InventoryRepository(pool);
  const user = createTelegramUser("deck");
  const reward = createCard("uncommon", "fire", 100);

  try {
    await insertCards(pool, [reward]);
    const player = await players.findOrCreateFromTelegram(user);
    const before = await decks.findByPlayerId(player.id);
    const result = await new ShopService(pool, { selectReward: async () => reward }).purchase(player.id, "silver_card");
    const after = await decks.findByPlayerId(player.id);
    const ownedCards = await inventory.findByPlayerId(player.id);

    assert.equal(result.deckChanged, true);
    assert.equal(after.totalPower, before.totalPower + 88);
    assert.ok(after.cards.some(({ cardId }) => cardId === reward.cardId));
    assert.deepEqual(countDeckElements(after.cards), { fire: 3, water: 2, air: 2, earth: 2 });
    assert.ok(ownedCards.some(({ cardId }) => cardId === reward.cardId));
    assert.equal(ownedCards.filter(({ element }) => element === "fire").length, 4);
  } finally {
    await cleanup(pool, [user.id], [reward.cardId]);
    await pool.end();
  }
});
