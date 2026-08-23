import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import type { ValidatedTelegramUser } from "../auth/telegramInitData.js";
import { PlayerRepository } from "../users/playerRepository.js";
import { CampaignBossBattleConflictError, CampaignBossService } from "./campaignBossService.js";
import { CAMPAIGN_STAGES, MANTICORE_CARD_CODE } from "./campaignConfig.js";
import { CampaignService } from "./campaignService.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
let telegramSequence = 0n;

function telegramUser(label: string): ValidatedTelegramUser {
  telegramSequence += 1n;
  return {
    id: String(BigInt(Date.now()) * 1_000_000n + BigInt(process.pid) * 100n + telegramSequence),
    username: null,
    firstName: `Boss ${label}`,
    lastName: null,
    photoUrl: null,
  };
}

async function unlockBoss(pool: Pool, campaign: CampaignService, playerId: string, now: Date) {
  await campaign.getCampaign(playerId, now);
  for (const stage of CAMPAIGN_STAGES) {
    for (const quest of stage.quests) {
      await pool.query(
        `
          INSERT INTO player_campaign_quest_progress (
            player_id, quest_id, stage_number, progress, completed_at, claimed_at
          ) VALUES ($1, $2, $3, $4, $5, $5)
          ON CONFLICT (player_id, quest_id) DO UPDATE SET
            progress = EXCLUDED.progress,
            completed_at = EXCLUDED.completed_at,
            claimed_at = EXCLUDED.claimed_at
        `,
        [playerId, quest.id, stage.number, quest.target, now],
      );
    }
  }
  await pool.query(
    `UPDATE player_campaign_state SET current_stage = 6, current_stage_started_at = $2 WHERE player_id = $1`,
    [playerId, now],
  );
}

test("Campaign boss start/resume redacts every active enemy card field and reveals only battle-log history", {
  skip: !databaseUrl,
}, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const campaign = new CampaignService(pool);
  const boss = new CampaignBossService(pool, campaign, () => 0, { nextInt: () => 0 });
  const player = await players.findOrCreateFromTelegram(telegramUser("secrecy"));
  const now = new Date("2026-08-23T12:00:00.000Z");
  try {
    await unlockBoss(pool, campaign, player.id, now);
    const started = await boss.start(player.id);
    assert.equal("cards" in started.opponent, false);
    assert.equal("pairMultipliers" in started, false);
    assert.deepEqual(started.enemyActiveCards, [
      { slotIndex: 0, hidden: true },
      { slotIndex: 1, hidden: true },
      { slotIndex: 2, hidden: true },
    ]);
    for (const hidden of started.enemyActiveCards) {
      assert.deepEqual(Object.keys(hidden).sort(), ["hidden", "slotIndex"]);
    }
    const resumed = await boss.findActive(player.id);
    assert.deepEqual(resumed?.enemyActiveCards, started.enemyActiveCards);

    const acted = await boss.action(player.id, started.battleId, { slotIndex: 0, expectedVersion: started.version }, now);
    assert.equal(acted.battleLog.length, 1);
    assert.ok(acted.battleLog[0]?.enemyCard.code);
    assert.deepEqual(acted.enemyActiveCards, started.enemyActiveCards);
    assert.equal("pairMultipliers" in acted, false);
  } finally {
    await pool.query("DELETE FROM players WHERE id = $1", [player.id]);
    await pool.end();
  }
});

test("first boss victory grants one standard Lv15 Rare Мантикора and finalizes Campaign once", {
  skip: !databaseUrl,
}, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const campaign = new CampaignService(pool);
  const boss = new CampaignBossService(pool, campaign, () => 0, { nextInt: () => 0 });
  const player = await players.findOrCreateFromTelegram(telegramUser("reward"));
  const now = new Date("2026-08-23T12:00:00.000Z");
  try {
    await unlockBoss(pool, campaign, player.id, now);
    const started = await boss.start(player.id);
    await pool.query("UPDATE duels SET enemy_hp = 1 WHERE id = $1", [started.battleId]);
    const won = await boss.action(player.id, started.battleId, {
      slotIndex: 0,
      expectedVersion: started.version,
    }, now);
    assert.equal(won.status, "won");
    assert.deepEqual(won.result && {
      outcome: won.result.outcome,
      xp: won.result.xp,
      silver: won.result.silver,
      cardName: won.result.rewardCard?.displayName,
      cardLevel: won.result.rewardCard?.level,
      cardRarity: won.result.rewardCard?.rarity,
    }, {
      outcome: "win",
      xp: 600,
      silver: 1_000,
      cardName: "Мантикора",
      cardLevel: 15,
      cardRarity: "rare",
    });
    await assert.rejects(
      boss.action(player.id, started.battleId, { slotIndex: 0, expectedVersion: started.version }, now),
      CampaignBossBattleConflictError,
    );
    const persisted = await pool.query<{ deck_count: string; discoveries: string; instances: string }>(
      `
        SELECT
          (SELECT COUNT(*) FROM player_card_instances
            INNER JOIN cards ON cards.id = player_card_instances.card_id
            WHERE player_card_instances.player_id = $1 AND cards.code = $2) AS instances,
          (SELECT COUNT(*) FROM player_card_discoveries
            INNER JOIN cards ON cards.id = player_card_discoveries.card_id
            WHERE player_card_discoveries.player_id = $1 AND cards.code = $2) AS discoveries,
          (SELECT COUNT(*) FROM deck_slots
            INNER JOIN player_decks ON player_decks.id = deck_slots.deck_id
            INNER JOIN player_card_instances ON player_card_instances.id = deck_slots.card_instance_id
            INNER JOIN cards ON cards.id = player_card_instances.card_id
            WHERE player_decks.player_id = $1 AND cards.code = $2) AS deck_count
      `,
      [player.id, MANTICORE_CARD_CODE],
    );
    assert.deepEqual({
      instances: Number(persisted.rows[0]?.instances),
      discoveries: Number(persisted.rows[0]?.discoveries),
      deckCount: Number(persisted.rows[0]?.deck_count),
    }, { instances: 1, discoveries: 1, deckCount: 1 });
    assert.equal((await campaign.getCampaign(player.id, now)).boss.state, "completed");
  } finally {
    await pool.query("DELETE FROM players WHERE id = $1", [player.id]);
    await pool.end();
  }
});
