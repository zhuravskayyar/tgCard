import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import type { ValidatedTelegramUser } from "../auth/telegramInitData.js";
import { PlayerRepository } from "../users/playerRepository.js";
import { CAMPAIGN_STAGES } from "./campaignConfig.js";
import { CampaignService } from "./campaignService.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
let telegramSequence = 0n;

function telegramUser(label: string): ValidatedTelegramUser {
  telegramSequence += 1n;
  return {
    id: String(BigInt(Date.now()) * 1_000_000n + BigInt(process.pid) * 100n + telegramSequence),
    username: null,
    firstName: `Campaign ${label}`,
    lastName: null,
    photoUrl: null,
  };
}

async function completeAndClaimStage(
  pool: Pool,
  campaign: CampaignService,
  playerId: string,
  stageNumber: number,
  claimCount = 6,
) {
  await campaign.getCampaign(playerId);
  const stage = CAMPAIGN_STAGES[stageNumber - 1]!;
  await pool.query(
    `
      UPDATE player_campaign_quest_progress
      SET progress = 100, completed_at = NOW(), updated_at = NOW()
      WHERE player_id = $1 AND stage_number = $2
    `,
    [playerId, stageNumber],
  );
  for (const quest of stage.quests.slice(0, claimCount)) await campaign.claim(playerId, quest.id);
}

test("Campaign stages unlock sequentially and the boss unlocks only after all 36 claims", {
  skip: !databaseUrl,
}, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const campaign = new CampaignService(pool);
  const player = await players.findOrCreateFromTelegram(telegramUser("sequence"));
  try {
    let view = await campaign.getCampaign(player.id);
    assert.equal(view.stages[0]?.state, "active");
    assert.equal(view.stages[1]?.state, "locked");
    assert.equal(view.boss.state, "locked");

    for (let stageNumber = 1; stageNumber <= 5; stageNumber += 1) {
      await completeAndClaimStage(pool, campaign, player.id, stageNumber);
      view = await campaign.getCampaign(player.id);
      assert.equal(view.stages[stageNumber]?.state, "active");
      assert.equal(view.boss.state, "locked");
    }

    await completeAndClaimStage(pool, campaign, player.id, 6, 5);
    view = await campaign.getCampaign(player.id);
    assert.equal(view.stages[5]?.state, "active");
    assert.equal(view.stages.reduce((total, stage) => total + stage.claimedCount, 0), 35);
    assert.equal(view.boss.state, "locked");

    await campaign.claim(player.id, CAMPAIGN_STAGES[5]!.quests[5]!.id);
    view = await campaign.getCampaign(player.id);
    assert.equal(view.stages.every(({ claimedCount }) => claimedCount === 6), true);
    assert.equal(view.stages[5]?.state, "completed");
    assert.equal(view.stages.reduce((total, stage) => total + stage.claimedCount, 0), 36);
    assert.equal(view.boss.state, "unlocked");
    assert.deepEqual(view.boss.reward, {
      xp: 600,
      silver: 1_000,
      card: { level: 15, name: "Мантикора", rarity: "rare" },
    });
  } finally {
    await pool.query("DELETE FROM players WHERE id = $1", [player.id]);
    await pool.end();
  }
});

test("Campaign claim is idempotent, isolated per player, and fixed rewards ignore account boost", {
  skip: !databaseUrl,
}, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const campaign = new CampaignService(pool);
  const first = await players.findOrCreateFromTelegram(telegramUser("idempotent"));
  const second = await players.findOrCreateFromTelegram(telegramUser("isolated"));
  const now = new Date();
  try {
    await campaign.getCampaign(first.id, now);
    await campaign.getCampaign(second.id, now);
    await pool.query(
      `
        INSERT INTO player_boosts (id, player_id, boost_type, starts_at, expires_at, source)
        VALUES ($1, $2, 'account_x2', $3, $4, 'campaign_referral')
      `,
      [randomUUID(), first.id, now, new Date(now.getTime() + 24 * 60 * 60 * 1_000)],
    );
    await pool.query(
      `UPDATE player_campaign_quest_progress SET progress = 2, completed_at = $3 WHERE player_id = $1 AND quest_id = $2`,
      [first.id, "1.1", now],
    );
    const before = await pool.query<{ silver: string }>("SELECT silver FROM players WHERE id = $1", [first.id]);
    const firstClaim = await campaign.claim(first.id, "1.1", now);
    const repeatedClaim = await campaign.claim(first.id, "1.1", new Date(now.getTime() + 1_000));
    const after = await pool.query<{ silver: string }>("SELECT silver FROM players WHERE id = $1", [first.id]);
    assert.equal(Number(after.rows[0]?.silver) - Number(before.rows[0]?.silver), 100);
    assert.equal(firstClaim.alreadyClaimed, false);
    assert.equal(repeatedClaim.alreadyClaimed, true);
    assert.equal(firstClaim.reward.silver, 100);
    assert.equal((await campaign.getCampaign(second.id)).stages[0]?.quests[0]?.state, "active");
  } finally {
    await pool.query("DELETE FROM players WHERE id = ANY($1::uuid[])", [[first.id, second.id]]);
    await pool.end();
  }
});
