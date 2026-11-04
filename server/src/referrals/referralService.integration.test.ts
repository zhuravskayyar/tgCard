import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import type { ValidatedTelegramUser } from "../auth/telegramInitData.js";
import { getAccountBoostStatus } from "../boosts/accountBoost.js";
import { CampaignService } from "../campaign/campaignService.js";
import { PlayerRepository } from "../users/playerRepository.js";
import { ReferralService } from "./referralService.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
let telegramSequence = 0n;

function telegramUser(label: string): ValidatedTelegramUser {
  telegramSequence += 1n;
  return {
    id: String(BigInt(Date.now()) * 1_000_000n + BigInt(process.pid) * 100n + telegramSequence),
    username: null,
    firstName: `Referral ${label}`,
    lastName: null,
    photoUrl: null,
  };
}

test("valid Telegram referral creates friendship and grants one exact 24h boost independently of campaign stages", {
  skip: !databaseUrl,
}, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const campaign = new CampaignService(pool);
  const referrals = new ReferralService(pool, campaign);
  const inviter = await players.findOrCreateFromTelegram(telegramUser("inviter"));
  const alternateInviter = await players.findOrCreateFromTelegram(telegramUser("alternate"));
  const invited = await players.findOrCreateFromTelegram(telegramUser("invited"));
  const playerIds = [inviter.id, alternateInviter.id, invited.id];
  const now = new Date("2026-08-23T12:00:00.000Z");
  try {
    const codes = await pool.query<{ id: string; referral_code: string }>(
      "SELECT id, referral_code FROM players WHERE id = ANY($1::uuid[])",
      [playerIds],
    );
    const codeById = new Map(codes.rows.map((row) => [row.id, row.referral_code]));
    assert.equal(
      (await referrals.acceptFromTelegramStart(inviter.id, `ref_${codeById.get(inviter.id)}`, now)).status,
      "self_referral",
    );
    const accepted = await referrals.acceptFromTelegramStart(
      invited.id,
      `ref_${codeById.get(inviter.id)}`,
      now,
    );
    assert.equal(accepted.status, "accepted");
    assert.equal(accepted.boostExpiresAt, "2026-08-24T12:00:00.000Z");
    assert.equal(
      (await referrals.acceptFromTelegramStart(invited.id, `ref_${codeById.get(inviter.id)}`, now)).status,
      "already_accepted",
    );
    assert.equal(
      (await referrals.acceptFromTelegramStart(invited.id, `ref_${codeById.get(alternateInviter.id)}`, now)).status,
      "already_accepted",
    );

    const persisted = await pool.query<{ boosts: string; friends: string; referrals: string }>(
      `
        SELECT
          (SELECT COUNT(*) FROM player_referrals WHERE invited_player_id = $1) AS referrals,
          (SELECT COUNT(*) FROM player_friends WHERE player_a_id = $1 OR player_b_id = $1) AS friends,
          (SELECT COUNT(*) FROM player_boosts WHERE player_id = $2) AS boosts
      `,
      [invited.id, inviter.id],
    );
    assert.deepEqual({
      referrals: Number(persisted.rows[0]?.referrals),
      friends: Number(persisted.rows[0]?.friends),
      boosts: Number(persisted.rows[0]?.boosts),
    }, { referrals: 1, friends: 1, boosts: 1 });
    assert.equal((await getAccountBoostStatus(pool, inviter.id, new Date(now.getTime() + 24 * 60 * 60 * 1_000 - 1))).multiplier, 2);
    assert.equal((await getAccountBoostStatus(pool, inviter.id, new Date(now.getTime() + 24 * 60 * 60 * 1_000))).multiplier, 1);
  } finally {
    await pool.query("DELETE FROM players WHERE id = ANY($1::uuid[])", [playerIds]);
    await pool.end();
  }
});
