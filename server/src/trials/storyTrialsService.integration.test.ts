import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import type { ValidatedTelegramUser } from "../auth/telegramInitData.js";
import { PlayerRepository } from "../users/playerRepository.js";
import { StoryTrialNotClaimableError, StoryTrialsService } from "./storyTrialsService.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
let telegramSequence = 0n;

function telegramUser(label: string): ValidatedTelegramUser {
  telegramSequence += 1n;
  return {
    id: String(BigInt(Date.now()) * 1_000_000n + BigInt(process.pid) * 100n + telegramSequence),
    username: null,
    firstName: `Trials ${label}`,
    lastName: null,
    photoUrl: null,
  };
}

async function addEvents(pool: Pool, playerId: string, eventType: string, count: number) {
  for (let index = 0; index < count; index += 1) {
    await pool.query(
      "INSERT INTO player_campaign_events (player_id, event_type, payload, occurred_at) VALUES ($1, $2, '{}', NOW())",
      [playerId, eventType],
    );
  }
}

test("Story trials derive progress from events, pay once and unlock the campaign after all claims", {
  skip: !databaseUrl,
}, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const service = new StoryTrialsService(pool);
  const player = await players.findOrCreateFromTelegram(telegramUser("flow"));
  const balance = async () => {
    const row = (await pool.query<{ gold: string; silver: string }>("SELECT gold, silver FROM players WHERE id = $1", [player.id])).rows[0]!;
    return { gold: Number(row.gold), silver: Number(row.silver) };
  };
  try {
    const start = await balance();
    let view = await service.getTrials(player.id);
    assert.equal(view.totalCount, 5);
    assert.equal(view.campaignUnlocked, false);
    assert.equal(view.trials.find(({ id }) => id === "first-duel-win")?.state, "active");
    assert.equal(view.trials.find(({ id }) => id === "save-profile")?.state, "completed");
    await assert.rejects(service.claim(player.id, "first-duel-win"), StoryTrialNotClaimableError);

    await addEvents(pool, player.id, "DUEL_WON", 1);
    const first = await service.claim(player.id, "first-duel-win");
    const repeated = await service.claim(player.id, "first-duel-win");
    assert.equal(first.alreadyClaimed, false);
    assert.equal(repeated.alreadyClaimed, true);
    assert.deepEqual(await balance(), { gold: start.gold + 1, silver: start.silver + 100 });

    await addEvents(pool, player.id, "DUEL_FINISHED", 10);
    await addEvents(pool, player.id, "SHOP_CARD_PURCHASED", 4);
    await addEvents(pool, player.id, "CARD_LEVEL_UP", 3);
    for (const id of ["play-duels", "buy-cards", "upgrade-cards"]) await service.claim(player.id, id);
    view = await service.getTrials(player.id);
    assert.equal(view.campaignUnlocked, false);

    const saved = await service.claim(player.id, "save-profile");
    assert.equal(saved.trials.campaignUnlocked, true);
    assert.equal(saved.trials.completedCount, 5);
    assert.deepEqual(await balance(), { gold: start.gold + 504, silver: start.silver + 400 });
    assert.equal((await service.claim(player.id, "save-profile")).alreadyClaimed, true);
    assert.deepEqual(await balance(), { gold: start.gold + 504, silver: start.silver + 400 });
  } finally {
    await pool.query("DELETE FROM players WHERE id = $1", [player.id]);
    await pool.end();
  }
});

test("A player with claimed campaign quests keeps campaign access and legacy link rewards count as claimed", {
  skip: !databaseUrl,
}, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const service = new StoryTrialsService(pool);
  const player = await players.findOrCreateFromTelegram(telegramUser("legacy"));
  try {
    await pool.query(
      `INSERT INTO player_account_link_rewards (player_id, diamonds_awarded) VALUES ($1, 5)`,
      [player.id],
    );
    await pool.query(
      `INSERT INTO player_campaign_quest_progress (player_id, quest_id, stage_number, progress, completed_at, claimed_at)
       VALUES ($1, '1.1', 1, 1, NOW(), NOW())`,
      [player.id],
    );
    const view = await service.getTrials(player.id);
    assert.equal(view.campaignUnlocked, true);
    assert.equal(view.trials.find(({ id }) => id === "save-profile")?.state, "claimed");
  } finally {
    await pool.query("DELETE FROM players WHERE id = $1", [player.id]);
    await pool.end();
  }
});
