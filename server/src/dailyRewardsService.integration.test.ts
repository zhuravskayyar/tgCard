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
  return {
    id: String(BigInt(Date.now()) * 1_000_000n + BigInt(process.pid) * 100n + sequence),
    username: null,
    firstName: "Lariska reward tester",
    lastName: null,
    photoUrl: null,
  };
}

test("Lariska daily login accumulates, persists choices, and grants real rewards", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const player = await new PlayerRepository(pool).findOrCreateFromTelegram(telegramUser());
  const battlePass = new BattlePassService(pool);
  const start = new Date("2026-08-01T12:00:00.000Z");
  try {
    const firstPage = await battlePass.getPage(player.id, start);
    assert.equal(firstPage.dailyLogin.day, 1);
    assert.equal(firstPage.dailyLogin.reward.kind, "card");
    assert.equal(firstPage.dailyLogin.reward.rarity, "common");

    const firstClaim = await battlePass.claimDailyLogin(player.id, undefined, start);
    assert.equal(firstClaim.grant.kind, "card");
    assert.equal(firstClaim.grant.card.rarity, "common");
    assert.equal(firstClaim.dailyLogin.claimable, false);
    await assert.rejects(() => battlePass.claimDailyLogin(player.id, undefined, start), DailyRewardNotClaimableError);

    for (let day = 2; day <= 5; day += 1) {
      await battlePass.claimDailyLogin(player.id, undefined, new Date(start.getTime() + (day - 1) * 86_400_000));
    }

    const choicePage = await battlePass.getPage(player.id, new Date(start.getTime() + 5 * 86_400_000));
    assert.equal(choicePage.dailyLogin.day, 6);
    assert.equal(choicePage.dailyLogin.reward.options?.length, 3);
    const choice = await battlePass.claimDailyLogin(player.id, 1, new Date(start.getTime() + 5 * 86_400_000));
    assert.equal(choice.claimedDay, 6);
    assert.equal(choice.grant.kind, "card");
    assert.equal(choice.grant.card.rarity, "rare");

    const finalClaim = await battlePass.claimDailyLogin(player.id, undefined, new Date(start.getTime() + 6 * 86_400_000));
    assert.equal(finalClaim.claimedDay, 7);
    assert.ok(finalClaim.grant.kind === "card" || finalClaim.grant.kind === "equipment");
    assert.equal(finalClaim.dailyLogin.totalClaims, 7);
  } finally {
    await pool.query("DELETE FROM players WHERE id = $1", [player.id]);
    await pool.end();
  }
});
