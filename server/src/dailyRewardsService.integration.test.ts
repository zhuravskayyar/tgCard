import assert from "node:assert/strict";
import { Pool } from "pg";
import test from "node:test";
import type { ValidatedTelegramUser } from "./auth/telegramInitData.js";
import { BattlePassService } from "./battlePassService.js";
import { DailyRewardNotClaimableError } from "./dailyRewardsService.js";
import { PlayerRepository } from "./users/playerRepository.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
let sequence = 0n;
function telegramUser(): ValidatedTelegramUser {
  sequence += 1n;
  return { id: String(BigInt(Date.now()) * 1_000_000n + BigInt(process.pid) * 100n + sequence), username: null, firstName: "Daily currency test", lastName: null, photoUrl: null };
}

test("daily currencies are atomic, streak-based, capped and credited to the current season", { skip: !databaseUrl }, async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const player = await new PlayerRepository(pool).findOrCreateFromTelegram(telegramUser());
  const battlePass = new BattlePassService(pool);
  const start = new Date("2026-08-30T23:59:59.000Z");
  const atDay = (day: number) => new Date(start.getTime() + (day - 1) * 86_400_000);
  try {
    const before = (await pool.query("SELECT silver, gold, account_xp, arena_tokens FROM players WHERE id=$1", [player.id])).rows[0];
    const initialCards = (await pool.query("SELECT count(*) FROM player_card_instances WHERE player_id=$1", [player.id])).rows[0].count;
    const initialView = await battlePass.getPage(player.id, start);
    assert.equal(initialView.dailyLogin.reward.kind, "currencies");
    assert.equal(initialView.dailyLogin.streak, 1);
    const concurrent = await Promise.allSettled([
      battlePass.claimDailyLogin(player.id, undefined, start),
      battlePass.claimDailyLogin(player.id, undefined, start),
    ]);
    assert.equal(concurrent.filter((r) => r.status === "fulfilled").length, 1);
    const rejected = concurrent.find((r) => r.status === "rejected");
    assert.ok(rejected?.status === "rejected" && rejected.reason instanceof DailyRewardNotClaimableError);
    const first = await battlePass.getPage(player.id, start);
    assert.equal(first.dailyLogin.claimable, false);
    assert.equal(first.dailyLogin.day, 1);
    assert.equal(first.dailyLogin.calendar[0]?.claimed, true);
    assert.equal(first.battlePass.diamonds, 1);
    let silver = 500, gold = 2, septemberDiamonds = 0;
    for (let day = 2; day <= 31; day++) {
      const preview = await battlePass.getPage(player.id, atDay(day));
      assert.equal(preview.dailyLogin.streak, day);
      const result = await battlePass.claimDailyLogin(player.id, undefined, atDay(day));
      assert.equal(result.grant.kind, "currencies");
      if (result.grant.kind !== "currencies") throw new Error("Expected currencies");
      assert.equal(result.grant.silver, preview.dailyLogin.reward.silver);
      assert.equal(result.grant.gold, preview.dailyLogin.reward.gold);
      assert.equal(result.grant.diamonds, preview.dailyLogin.reward.diamonds);
      assert.equal(result.streakBonus, undefined);
      silver += result.grant.silver; gold += result.grant.gold;
      if (day >= 3) septemberDiamonds += result.grant.diamonds;
      if (day === 7) assert.equal(result.dailyLogin.day, 7);
      if (day === 8) { assert.equal(result.dailyLogin.cycle, 2); assert.equal(result.dailyLogin.day, 1); }
      if (day >= 30) assert.deepEqual([result.grant.silver, result.grant.gold, result.grant.diamonds], [15000, 31, 10]);
      if (day >= 3) assert.equal(result.battlePass.diamonds, septemberDiamonds);
    }
    // A skipped day resets reward amounts but never collides with old ledger positions.
    const resetPreview = await battlePass.getPage(player.id, atDay(33));
    assert.equal(resetPreview.dailyLogin.streak, 1);
    assert.equal(resetPreview.dailyLogin.calendar.some((day) => day.claimed), false);
    const reset = await battlePass.claimDailyLogin(player.id, undefined, atDay(33));
    assert.equal(reset.grant.kind, "currencies");
    if (reset.grant.kind !== "currencies") throw new Error("Expected currencies");
    assert.deepEqual([reset.grant.silver, reset.grant.gold, reset.grant.diamonds], [500, 2, 1]);
    assert.equal(reset.dailyLogin.totalClaims, 32);
    assert.equal(reset.rewardPlayer.silver, Number(before.silver) + silver + 500);
    assert.equal(reset.rewardPlayer.gold, Number(before.gold) + gold + 2);
    assert.equal(reset.rewardPlayer.accountXp, Number(before.account_xp));
    assert.equal(reset.rewardPlayer.arenaTokens, Number(before.arena_tokens));
    assert.equal((await pool.query("SELECT count(*) FROM player_card_instances WHERE player_id=$1", [player.id])).rows[0].count, initialCards);
    assert.equal(Number((await pool.query("SELECT count(*) FROM player_lariska_daily_claims WHERE player_id=$1", [player.id])).rows[0].count), 32);
    // UTC midnight counts as the next day even if only one second has passed.
    const midnight = new Date(atDay(33).getTime() + 1_000);
    const next = await battlePass.getPage(player.id, midnight);
    assert.equal(next.dailyLogin.streak, 2);
    assert.equal(next.dailyLogin.claimable, true);
  } finally {
    await pool.query("DELETE FROM players WHERE id = $1", [player.id]);
    await pool.end();
  }
});
