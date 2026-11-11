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

// The starter deck holds three air cards (fairy, raven, eagle) and two fire cards (salamander, ifrit).
const AIR_TRIO = ["giant_dragonfly", "black_raven", "mountain_eagle"];
const FIRE_PAIR = ["salamander", "fire_ifrit"];
// Copies of the starter dragonfly: the deck keeps only the strongest copy of one base card.
const DRAGONFLY_ID = STARTER_CARDS.find(({ code }) => code === "giant_dragonfly")!.id;
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
    // The dragonfly gets no bonus, so it is the air card pushed out once the target is upgraded.
    const activeAirId = byCode.get("giant_dragonfly")!;
    const retainedStarterId = byCode.get("black_raven")!;
    await pool.query(
      `UPDATE player_card_instances SET level = 15, bonus_power = CASE WHEN card_id = $3 THEN 0 ELSE 2 END
       WHERE player_id = $1 AND card_id = ANY($2::text[])`,
      [owner.id, AIR_TRIO, DRAGONFLY_ID],
    );
    await pool.query(
      `UPDATE player_card_instances SET level = 14
       WHERE player_id = $1 AND card_id = ANY($2::text[])`,
      [owner.id, FIRE_PAIR],
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
        DRAGONFLY_ID,
        STARTER_CARDS[2]!.id,
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
    await expectCode(progression.absorb(owner.id, targetId, [activeAirId]), "fodder_in_deck");
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
    assert.ok(weakAfterUpgrade.some(({ instanceId }) => instanceId === activeAirId));
    assert.ok(!weakAfterUpgrade.some(({ instanceId }) => instanceId === retainedStarterId));
    assert.deepEqual(countDeckElements(deck.cards), { earth: 2, fire: 2, water: 2, air: 3 });
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
    // New players have no weak starters, so seventeen extra cards make the 17-card complement.
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

test("absorbing weak cards takes the weakest same-element cards that fit into the level in one transaction", {
  skip: !databaseUrl,
}, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const progression = new CardProgressionService(pool, new InventoryRepository(pool));
  const user = createTelegramUser("bulk");
  try {
    const player = await players.findOrCreateFromTelegram(user);
    const targetId = randomUUID();
    const tinyIds = [randomUUID(), randomUUID()];
    const mediumId = randomUUID();
    const overflowId = randomUUID();
    const protectedId = randomUUID();
    const otherElementId = randomUUID();
    // Level 21 needs 4.8 elements; level 1 gives 0.02, level 10 gives 0.8, level 20 gives 4.
    await pool.query(
      `INSERT INTO player_card_instances
        (id, player_id, card_id, level, bonus_power, protected_from_absorption)
       VALUES
        ($1, $7, $8, 21, 0, FALSE),
        ($2, $7, $8, 1, 0, FALSE),
        ($3, $7, $8, 1, 0, FALSE),
        ($4, $7, $8, 10, 0, FALSE),
        ($5, $7, $8, 20, 0, FALSE),
        ($6, $7, $8, 1, 0, TRUE),
        ($9, $7, $10, 1, 0, FALSE)`,
      [targetId, tinyIds[0], tinyIds[1], mediumId, overflowId, protectedId, player.id, DRAGONFLY_ID, otherElementId, STARTER_CARDS[2]!.id],
    );
    await recalculateAutomaticDeckForPlayer(pool, player.id);
    const deck = await new DeckRepository(pool).findByPlayerId(player.id);
    // The level-20 card may sit in the deck; either way it must never be consumed by the bulk action.
    const inDeck = new Set(deck.cards.map(({ instanceId }) => instanceId));

    const preview = await progression.previewBulkAbsorption(player.id, targetId);
    for (const id of [...tinyIds, mediumId]) {
      if (!inDeck.has(id)) assert.ok(preview.fodderInstanceIds.includes(id), "small weak cards are selected");
    }
    for (const id of [overflowId, protectedId, otherElementId, targetId]) {
      assert.ok(!preview.fodderInstanceIds.includes(id), "overflowing, protected, other-element and target cards stay");
    }
    assert.ok(preview.fodderInstanceIds.every((id) => !inDeck.has(id)), "deck cards are never selected");
    assert.ok(preview.addedElements <= preview.requiredElements);
    assert.equal(preview.selectedCards, preview.fodderInstanceIds.length);

    const absorbed = await progression.absorbWeak(player.id, targetId);
    assert.deepEqual([...absorbed.consumedInstanceIds].sort(), [...preview.fodderInstanceIds].sort());
    assert.equal(absorbed.card.levelProgressElements, preview.afterElements);
    assert.equal(absorbed.card.storedElements, 0);
    const remaining = await pool.query<{ id: string }>(
      "SELECT id FROM player_card_instances WHERE id = ANY($1::uuid[])",
      [preview.fodderInstanceIds],
    );
    assert.equal(remaining.rowCount, 0);

    // Only the level-20 card is left and it would overflow the level, so nothing is absorbed.
    await expectCode(progression.absorbWeak(player.id, targetId), "nothing_to_absorb");
    assert.equal((await progression.previewBulkAbsorption(player.id, targetId)).selectedCards, 0);
  } finally {
    await cleanupPlayers(pool, [user.id]);
    await pool.end();
  }
});
