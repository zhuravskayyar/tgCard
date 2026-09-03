import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { countDeckElements } from "@cardastika/game-core";
import { Pool } from "pg";
import type { ValidatedTelegramUser } from "../auth/telegramInitData.js";
import { DeckRepository } from "../decks/deckRepository.js";
import { recalculateAutomaticDeckForPlayer } from "../decks/automaticDeckService.js";
import { InventoryRepository } from "../inventory/inventoryRepository.js";
import { STARTER_CARDS } from "../inventory/starterCards.js";
import { PlayerRepository } from "../users/playerRepository.js";
import { CardProgressionDomainError, CardProgressionService } from "./cardProgressionService.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
let telegramSequence = 0n;

function createTelegramUser(label: string): ValidatedTelegramUser {
  telegramSequence += 1n;
  return {
    id: String(BigInt(Date.now()) * 1_000_000n + BigInt(process.pid) * 100n + telegramSequence),
    username: null,
    firstName: `Progression ${label}`,
    lastName: null,
    photoUrl: null,
  };
}

async function cleanupPlayers(pool: Pool, telegramUserIds: string[]) {
  await pool.query("DELETE FROM players WHERE telegram_user_id = ANY($1::bigint[])", [telegramUserIds]);
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error) => (
    error instanceof CardProgressionDomainError && error.code === code
  ));
}

test("absorption validates ownership, weak membership and element while preserving all potential", {
  skip: !databaseUrl,
}, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const inventory = new InventoryRepository(pool);
  const progression = new CardProgressionService(pool, inventory);
  const ownerUser = createTelegramUser("owner");
  const otherUser = createTelegramUser("other");

  try {
    const owner = await players.findOrCreateFromTelegram(ownerUser);
    const other = await players.findOrCreateFromTelegram(otherUser);
    const starterRows = await pool.query<{ code: string; id: string }>(
      `SELECT cards.code, player_card_instances.id
       FROM player_card_instances
       INNER JOIN cards ON cards.id = player_card_instances.card_id
       WHERE player_card_instances.player_id = $1`,
      [owner.id],
    );
    const byCode = new Map(starterRows.rows.map((row) => [row.code, row.id]));
    const targetId = randomUUID();
    const activeFireId = byCode.get("starter_02")!;
    const displacedFireId = byCode.get("starter_03")!;
    await pool.query(
      `UPDATE player_card_instances SET level = 15
       WHERE player_id = $1 AND card_id = ANY($2::text[])`,
      [owner.id, STARTER_CARDS.slice(0, 3).map(({ id }) => id)],
    );
    await pool.query(
      `UPDATE player_card_instances SET level = 14
       WHERE player_id = $1 AND card_id = ANY($2::text[])`,
      [owner.id, STARTER_CARDS.slice(3, 5).map(({ id }) => id)],
    );
    const validFodderId = randomUUID();
    const secondValidId = randomUUID();
    const differentElementId = randomUUID();
    const levelOneTargetId = randomUUID();
    const levelOneFodderId = randomUUID();
    await pool.query(
      `INSERT INTO player_card_instances
        (id, player_id, card_id, level, bonus_power, level_progress_elements, stored_elements)
       VALUES
        ($1, $5, $6, 10, 0, 3, 5),
        ($2, $5, $6, 10, 0, 0, 0),
        ($3, $5, $7, 10, 0, 0, 0),
        ($4, $5, $6, 14, 40, 1, 0),
        ($8, $5, $6, 1, 0, 0, 0),
        ($9, $5, $6, 1, 0, 0, 0)`,
      [
        validFodderId,
        secondValidId,
        differentElementId,
        targetId,
        owner.id,
        STARTER_CARDS[0]!.id,
        STARTER_CARDS[3]!.id,
        levelOneTargetId,
        levelOneFodderId,
      ],
    );
    await recalculateAutomaticDeckForPlayer(pool, owner.id);
    assert.ok(!(await new DeckRepository(pool).findByPlayerId(owner.id)).cards.some(({ instanceId }) => instanceId === targetId));
    const levelOnePreview = await progression.previewAbsorption(owner.id, levelOneTargetId, [levelOneFodderId]);
    assert.equal(levelOnePreview.addedElements, 0.02);
    assert.equal(levelOnePreview.beforePercent, 0);
    assert.equal(levelOnePreview.afterPercent, 100);
    assert.equal(levelOnePreview.beforeElements, 0);
    assert.equal(levelOnePreview.afterElements, 0.02);
    assert.equal(levelOnePreview.requiredElements, 0.02);
    const levelOneAbsorbed = await progression.absorb(owner.id, levelOneTargetId, [levelOneFodderId]);
    assert.equal(levelOneAbsorbed.card.levelProgressElements, 0.02);
    assert.equal(typeof levelOneAbsorbed.deckPower, "number");
    assert.deepEqual(levelOneAbsorbed.consumedInstanceIds, [levelOneFodderId]);

    const protectedCard = await progression.toggleProtection(owner.id, secondValidId);
    assert.equal(protectedCard.card.protectedFromAbsorption, true);
    await expectCode(progression.absorb(owner.id, targetId, [secondValidId]), "protected_card");
    const unprotectedCard = await progression.toggleProtection(owner.id, secondValidId);
    assert.equal(unprotectedCard.card.protectedFromAbsorption, false);

    const otherFireId = (await pool.query<{ id: string }>(
      `SELECT player_card_instances.id
       FROM player_card_instances
       INNER JOIN cards ON cards.id = player_card_instances.card_id
       WHERE player_card_instances.player_id = $1 AND cards.element = 'fire'
       LIMIT 1`,
      [other.id],
    )).rows[0]!.id;

    await expectCode(progression.absorb(owner.id, targetId, [targetId]), "target_is_fodder");
    await expectCode(progression.absorb(owner.id, targetId, [differentElementId]), "different_element");
    await expectCode(progression.absorb(owner.id, targetId, [activeFireId]), "fodder_in_deck");
    await expectCode(progression.absorb(owner.id, targetId, [otherFireId]), "fodder_not_owned");
    await expectCode(progression.absorb(owner.id, targetId, [secondValidId, differentElementId]), "different_element");
    assert.equal(Number((await pool.query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM player_card_instances WHERE id = $1",
      [secondValidId],
    )).rows[0]!.count), 1, "rollback keeps a valid card when another selected card fails validation");

    const absorbed = await progression.absorb(owner.id, targetId, [validFodderId]);
    assert.equal(absorbed.card.levelProgressElements, 1.76);
    assert.equal(absorbed.card.storedElements, 8.04);
    assert.equal(typeof absorbed.deckPower, "number");
    assert.deepEqual(absorbed.consumedInstanceIds, [validFodderId]);
    assert.equal(Number((await pool.query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM player_card_instances WHERE id = $1",
      [validFodderId],
    )).rows[0]!.count), 0);
    assert.ok(!(await inventory.findWeakByPlayerId(owner.id)).some(
      ({ instanceId }) => instanceId === validFodderId,
    ));

    await pool.query("UPDATE players SET gold = 10 WHERE id = $1", [owner.id]);
    const upgraded = await progression.levelUp(owner.id, targetId);
    assert.equal(upgraded.card.level, 15);
    assert.equal(upgraded.card.basePower, 310);
    assert.equal(upgraded.card.bonusPower, 40);
    assert.equal(upgraded.card.finalPower, 350);
    assert.equal(upgraded.card.levelProgressElements, 2);
    assert.equal(upgraded.card.storedElements, 6.04);
    assert.equal(upgraded.playerGold, 8);
    const deck = await new DeckRepository(pool).findByPlayerId(owner.id);
    assert.equal(upgraded.deckPower, deck.totalPower);
    assert.ok(deck.cards.some(({ instanceId }) => instanceId === targetId));
    const weakAfterUpgrade = await inventory.findWeakByPlayerId(owner.id);
    assert.ok(weakAfterUpgrade.some(({ instanceId }) => instanceId === byCode.get("starter_01")));
    assert.ok(!weakAfterUpgrade.some(({ instanceId }) => instanceId === displacedFireId));
    assert.deepEqual(countDeckElements(deck.cards), { fire: 3, water: 2, air: 2, earth: 2 });
    assert.equal(deck.totalPower, deck.cards.reduce((total, card) => total + card.finalPower, 0));
  } finally {
    await cleanupPlayers(pool, [ownerUser.id, otherUser.id]);
    await pool.end();
  }
});

test("weak pagination returns the 17-card complement as 9 then 8 in deterministic power order", {
  skip: !databaseUrl,
}, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const inventory = new InventoryRepository(pool);
  const user = createTelegramUser("pagination");
  try {
    const player = await players.findOrCreateFromTelegram(user);
    const ids = Array.from({ length: 17 }, () => randomUUID());
    await pool.query(
      `INSERT INTO player_card_instances (id, player_id, card_id, level, bonus_power)
       SELECT input.id, $1, $2, 1, input.bonus
       FROM unnest($3::uuid[], $4::integer[]) AS input(id, bonus)`,
      [player.id, STARTER_CARDS[0]!.id, ids, ids.map((_, index) => index + 1)],
    );
    await recalculateAutomaticDeckForPlayer(pool, player.id);
    const first = await inventory.findWeakPageByPlayerId(player.id, 1, 9);
    const second = await inventory.findWeakPageByPlayerId(player.id, 2, 9);
    assert.equal(first.totalCards, 17);
    assert.equal(second.totalCards, 17);
    assert.equal(first.cards.length, 9);
    assert.equal(second.cards.length, 8);
    const all = [...first.cards, ...second.cards];
    assert.deepEqual(all, [...all].sort((left, right) => right.finalPower - left.finalPower || left.instanceId.localeCompare(right.instanceId)));
    assert.equal(new Set(all.map(({ instanceId }) => instanceId)).size, 17);
  } finally {
    await cleanupPlayers(pool, [user.id]);
    await pool.end();
  }
});
