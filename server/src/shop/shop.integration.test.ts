import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { countDeckElements, type GeneratedLevelPolicy } from "@cardastika/game-core";
import type { CardElement, CardRarity } from "@cardastika/shared";
import { Pool } from "pg";
import type { ValidatedTelegramUser } from "../auth/telegramInitData.js";
import { DeckRepository } from "../decks/deckRepository.js";
import { InventoryRepository } from "../inventory/inventoryRepository.js";
import { PlayerRepository } from "../users/playerRepository.js";
import type { ShopRandomSource } from "./shopChancePolicy.js";
import {
  InsufficientShopFundsError,
  ShopPersistenceError,
  ShopService,
} from "./shopService.js";
import { ShopRewardUnavailableError } from "./shopRewardSelector.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
let telegramSequence = 0n;

class AlwaysMissRandomSource implements ShopRandomSource {
  nextInt(maxExclusive: number) {
    return maxExclusive === 10_000 ? 9_999 : 0;
  }
}

class SequenceRandomSource implements ShopRandomSource {
  constructor(private readonly values: number[]) {}

  nextInt(maxExclusive: number) {
    const value = this.values.shift();
    if (value === undefined || value < 0 || value >= maxExclusive) {
      throw new Error("Missing deterministic integration RNG value");
    }
    return value;
  }
}

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

function createCard(
  rarity: CardRarity,
  element: CardElement,
  level: number,
  shopEligible = true,
) {
  const suffix = randomUUID();
  return {
    cardId: `test_shop_${suffix}`,
    code: `test-shop-${suffix}`,
    displayName: `Shop ${rarity} test card`,
    artKey: null,
    element,
    rarity,
    level,
    collectionId: null,
    shopEligible,
  };
}

type TestCard = ReturnType<typeof createCard>;

function selectInsertedReward(cards: readonly TestCard[]) {
  return async (_client: unknown, rarity: CardRarity) => {
    const card = cards.find((candidate) => candidate.rarity === rarity && candidate.shopEligible);
    if (!card) throw new ShopRewardUnavailableError(rarity);
    return {
      id: card.cardId,
      code: card.code,
      displayName: card.displayName,
      artKey: card.artKey,
      element: card.element,
      targetRarity: card.rarity,
      collectionId: card.collectionId,
      minRarity: card.rarity,
      shopEligible: true,
    };
  };
}

function levelPolicyFor(cards: readonly TestCard[]): GeneratedLevelPolicy {
  return (rarity) => {
    const card = cards.find((candidate) => candidate.rarity === rarity && candidate.shopEligible);
    if (!card) throw new Error(`No test level for ${rarity}`);
    return card.level;
  };
}

async function insertCards(pool: Pool, cards: readonly TestCard[]) {
  for (const card of cards) {
    await pool.query(
      `
        INSERT INTO cards (id, code, display_name, art_key, element, collection_id)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [card.cardId, card.code, card.displayName, card.artKey, card.element, card.collectionId],
    );
    if (card.shopEligible) {
      await pool.query(
        "INSERT INTO shop_card_pools (card_id, target_rarity) VALUES ($1, $2)",
        [card.cardId, card.rarity],
      );
    }
  }
}

async function cleanup(pool: Pool, telegramUserIds: string[], cardIds: string[]) {
  await pool.query("DELETE FROM players WHERE telegram_user_id = ANY($1::bigint[])", [telegramUserIds]);
  await pool.query("DELETE FROM cards WHERE id = ANY($1::text[])", [cardIds]);
}

test("prices, miss increments, independent instances, and persisted pity are authoritative", {
  skip: !databaseUrl,
}, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const inventory = new InventoryRepository(pool);
  const user = createTelegramUser("prices-and-pity");
  const rewards = {
    uncommon: createCard("uncommon", "fire", 5),
    epic: createCard("epic", "water", 20),
    legendary: createCard("legendary", "air", 35),
  };
  const cards = Object.values(rewards);

  try {
    await insertCards(pool, cards);
    const player = await players.findOrCreateFromTelegram(user);
    await pool.query("UPDATE players SET gold = 250 WHERE id = $1", [player.id]);
    const shop = new ShopService(pool, {
      rng: new AlwaysMissRandomSource(),
      selectReward: selectInsertedReward(cards),
      levelPolicy: levelPolicyFor(cards),
    });
    const initialCatalog = await shop.getCardsCatalog(player.id);
    assert.deepEqual(initialCatalog.offers.map(({ id }) => id), [
      "card_uncommon", "card_epic", "card_legendary",
    ]);
    assert.ok(initialCatalog.offers.every(({ canAfford }) => canAfford));

    const firstSilver = await shop.purchase(player.id, "card_uncommon");
    const secondSilver = await shop.purchase(player.id, "card_uncommon");
    const epic = await shop.purchase(player.id, "card_epic");
    const legendary = await shop.purchase(player.id, "card_legendary");
    const ownedCards = await inventory.findByPlayerId(player.id);

    assert.deepEqual(firstSilver.updatedBalance, { silver: 1_000, gold: 250 });
    assert.deepEqual(firstSilver.updatedChances, [
      { rarity: "rare", chance: 3.5 }, { rarity: "epic", chance: 0.25 },
    ]);
    assert.deepEqual(secondSilver.updatedBalance, { silver: 500, gold: 250 });
    assert.deepEqual(epic.updatedBalance, { silver: 500, gold: 200 });
    assert.deepEqual(legendary.updatedBalance, { silver: 500, gold: 50 });
    const uncommonCopies = ownedCards.filter(({ cardId }) => cardId === rewards.uncommon.cardId);
    assert.equal(uncommonCopies.length, 2);
    assert.equal(new Set(uncommonCopies.map(({ instanceId }) => instanceId)).size, 2);
    assert.ok(uncommonCopies.every(({ level, rarity }) => level === 5 && rarity === "uncommon"));
    assert.equal(ownedCards.filter(({ cardId }) => cardId === rewards.epic.cardId).length, 1);
    assert.equal(ownedCards.filter(({ cardId }) => cardId === rewards.legendary.cardId).length, 1);

    const reopenedCatalog = await new ShopService(pool).getCardsCatalog(player.id);
    assert.deepEqual(reopenedCatalog.offers[0]?.upgrades.map(({ chance }) => chance), [7, 0.5]);
    assert.deepEqual(reopenedCatalog.offers[1]?.upgrades.map(({ chance }) => chance), [3.5, 0.25]);
    assert.deepEqual(reopenedCatalog.offers[2]?.upgrades.map(({ chance }) => chance), [3.5]);
  } finally {
    await cleanup(pool, [user.id], cards.map(({ cardId }) => cardId));
    await pool.end();
  }
});

test("pity belongs to one player and survives a new service/session", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const firstUser = createTelegramUser("first-owner");
  const secondUser = createTelegramUser("second-owner");
  const reward = createCard("uncommon", "earth", 5);

  try {
    await insertCards(pool, [reward]);
    const first = await players.findOrCreateFromTelegram(firstUser);
    const second = await players.findOrCreateFromTelegram(secondUser);
    await new ShopService(pool, {
      rng: new AlwaysMissRandomSource(),
      levelPolicy: levelPolicyFor([reward]),
    }).purchase(first.id, "card_uncommon");

    const freshService = new ShopService(pool);
    const firstCatalog = await freshService.getCardsCatalog(first.id);
    const secondCatalog = await freshService.getCardsCatalog(second.id);
    assert.deepEqual(firstCatalog.offers[0]?.upgrades.map(({ chance }) => chance), [3.5, 0.25]);
    assert.deepEqual(secondCatalog.offers[0]?.upgrades.map(({ chance }) => chance), [0, 0]);
  } finally {
    await cleanup(pool, [firstUser.id, secondUser.id], [reward.cardId]);
    await pool.end();
  }
});

test("a higher rarity hit halves only its meter and increments lower pity", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const user = createTelegramUser("epic-hit");
  const reward = createCard("epic", "air", 20);

  try {
    await insertCards(pool, [reward]);
    const player = await players.findOrCreateFromTelegram(user);
    await pool.query(
      `
        INSERT INTO player_shop_chances (player_id, offer_id, target_rarity, chance_basis_points)
        VALUES ($1, 'card_uncommon', 'rare', 1750), ($1, 'card_uncommon', 'epic', 225)
      `,
      [player.id],
    );
    const result = await new ShopService(pool, {
      rng: new SequenceRandomSource([0, 0, 0]),
      levelPolicy: levelPolicyFor([reward]),
    }).purchase(player.id, "card_uncommon");

    assert.equal(result.reward.rarity, "epic");
    assert.equal(result.reward.level, 20);
    assert.deepEqual(result.updatedChances, [
      { rarity: "rare", chance: 21 }, { rarity: "epic", chance: 2 },
    ]);
  } finally {
    await cleanup(pool, [user.id], [reward.cardId]);
    await pool.end();
  }
});

test("downstream Shop failures roll back balance, pity, discovery, and inventory", {
  skip: !databaseUrl,
}, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const user = createTelegramUser("rollback");
  const reward = createCard("uncommon", "water", 5);

  try {
    await insertCards(pool, [reward]);
    const player = await players.findOrCreateFromTelegram(user);
    const unavailableShop = new ShopService(pool, {
      rng: new AlwaysMissRandomSource(),
      levelPolicy: levelPolicyFor([reward]),
      selectReward: async () => { throw new ShopRewardUnavailableError("uncommon"); },
    });
    await assert.rejects(
      unavailableShop.purchase(player.id, "card_uncommon"),
      (error) => error instanceof ShopRewardUnavailableError,
    );
    const failingDeckShop = new ShopService(pool, {
      rng: new AlwaysMissRandomSource(),
      levelPolicy: levelPolicyFor([reward]),
      recalculateDeck: async () => { throw new Error("deck write failed"); },
    });
    await assert.rejects(
      failingDeckShop.purchase(player.id, "card_uncommon"),
      (error) => error instanceof ShopPersistenceError,
    );

    const balance = await pool.query<{ silver: string }>("SELECT silver FROM players WHERE id = $1", [player.id]);
    const pity = await pool.query<{ count: string }>(
      "SELECT count(*) FROM player_shop_chances WHERE player_id = $1",
      [player.id],
    );
    const ownership = await pool.query<{ count: string }>(
      "SELECT count(*) FROM player_card_instances WHERE player_id = $1 AND card_id = $2",
      [player.id, reward.cardId],
    );
    const discovery = await pool.query<{ count: string }>(
      "SELECT count(*) FROM player_card_discoveries WHERE player_id = $1 AND card_id = $2",
      [player.id, reward.cardId],
    );
    assert.equal(balance.rows[0]?.silver, "1500");
    assert.equal(pity.rows[0]?.count, "0");
    assert.equal(ownership.rows[0]?.count, "0");
    assert.equal(discovery.rows[0]?.count, "0");
  } finally {
    await cleanup(pool, [user.id], [reward.cardId]);
    await pool.end();
  }
});

test("concurrent purchases serialize balance and pity without double-spend", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const user = createTelegramUser("concurrent");
  const reward = createCard("uncommon", "water", 5);

  try {
    await insertCards(pool, [reward]);
    const player = await players.findOrCreateFromTelegram(user);
    await pool.query("UPDATE players SET silver = 600 WHERE id = $1", [player.id]);
    const shop = new ShopService(pool, {
      rng: new AlwaysMissRandomSource(),
      selectReward: selectInsertedReward([reward]),
      levelPolicy: levelPolicyFor([reward]),
    });
    const results = await Promise.allSettled([
      shop.purchase(player.id, "card_uncommon"),
      shop.purchase(player.id, "card_uncommon"),
    ]);
    const balance = await pool.query<{ silver: string }>("SELECT silver FROM players WHERE id = $1", [player.id]);
    const ownership = await pool.query<{ count: string }>(
      "SELECT count(*) FROM player_card_instances WHERE player_id = $1 AND card_id = $2",
      [player.id, reward.cardId],
    );

    assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => (
      result.status === "rejected" && result.reason instanceof InsufficientShopFundsError
    )).length, 1);
    assert.equal(balance.rows[0]?.silver, "100");
    assert.equal(ownership.rows[0]?.count, "1");
  } finally {
    await cleanup(pool, [user.id], [reward.cardId]);
    await pool.end();
  }
});

test("shop instance enters inventory, strongest deck, and weak cards remain its complement", {
  skip: !databaseUrl,
}, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const decks = new DeckRepository(pool);
  const inventory = new InventoryRepository(pool);
  const user = createTelegramUser("deck");
  const reward = createCard("uncommon", "fire", 8, true);
  const ineligible = createCard("uncommon", "fire", 9, false);

  try {
    await insertCards(pool, [reward, ineligible]);
    const player = await players.findOrCreateFromTelegram(user);
    const before = await decks.findByPlayerId(player.id);
    const result = await new ShopService(pool, {
      rng: new AlwaysMissRandomSource(),
      selectReward: selectInsertedReward([reward]),
      levelPolicy: levelPolicyFor([reward]),
    }).purchase(player.id, "card_uncommon");
    const after = await decks.findByPlayerId(player.id);
    const ownedCards = await inventory.findByPlayerId(player.id);
    const weakCards = await inventory.findWeakByPlayerId(player.id);

    assert.equal(result.reward.cardId, reward.cardId);
    assert.equal(result.reward.finalPower, 100);
    assert.equal(result.deckChanged, true);
    assert.equal(result.previousDeckPower, before.totalPower);
    assert.equal(result.deckPower, after.totalPower);
    assert.equal(after.totalPower, before.totalPower + 88);
    assert.ok(after.cards.some(({ instanceId }) => instanceId === result.reward.instanceId));
    assert.deepEqual(countDeckElements(after.cards), { fire: 3, water: 2, air: 2, earth: 2 });
    assert.equal(ownedCards.length, 10);
    assert.equal(weakCards.length, 1);
    const deckIds = new Set(after.cards.map(({ instanceId }) => instanceId));
    assert.deepEqual(
      new Set(weakCards.map(({ instanceId }) => instanceId)),
      new Set(ownedCards.filter(({ instanceId }) => !deckIds.has(instanceId)).map(({ instanceId }) => instanceId)),
    );
    assert.ok(!ownedCards.some(({ cardId }) => cardId === ineligible.cardId));
  } finally {
    await cleanup(pool, [user.id], [reward.cardId, ineligible.cardId]);
    await pool.end();
  }
});
