import assert from "node:assert/strict";
import { Pool } from "pg";
import test from "node:test";
import type { ValidatedTelegramUser } from "./auth/telegramInitData.js";
import { getCurrencyBoostStatus } from "./boosts/currencyBoost.js";
import { BattlePassService } from "./battlePassService.js";
import { PlayerRepository } from "./users/playerRepository.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
let sequence = 0n;

function telegramUser(): ValidatedTelegramUser {
  sequence += 1n;
  return {
    id: String(BigInt(Date.now()) * 1_000_000n + BigInt(process.pid) * 100n + sequence),
    username: null,
    firstName: "Battle pass tester",
    lastName: null,
    photoUrl: null,
  };
}

test("battle pass grants a 24h currency boost and a card at the lowest deck level", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const player = await new PlayerRepository(pool).findOrCreateFromTelegram(telegramUser());
  const battlePass = new BattlePassService(pool);
  const now = new Date("2026-08-23T12:00:00.000Z");
  try {
    await battlePass.getPage(player.id, now);
    await pool.query(
      "UPDATE player_battle_pass_state SET diamonds = 400 WHERE player_id = $1 AND season_id = $2",
      [player.id, "2026-08"],
    );
    await pool.query(
      `
        UPDATE player_card_instances
        SET level = 30
        WHERE id IN (
          SELECT deck_slots.card_instance_id
          FROM player_decks
          INNER JOIN deck_slots ON deck_slots.deck_id = player_decks.id
          WHERE player_decks.player_id = $1
        )
      `,
      [player.id],
    );

    const boost = await battlePass.claimMilestone(player.id, "circle-1-50", now);
    assert.equal(boost.reward.kind, "boost");
    assert.equal(boost.battlePass.currencyBoost.active, true);
    assert.equal(boost.battlePass.currencyBoost.multiplier, 2);
    assert.equal(boost.battlePass.currencyBoost.expiresAt, "2026-08-24T12:00:00.000Z");

    const equipmentReward = await battlePass.claimMilestone(player.id, "circle-1-100", now);
    assert.equal(equipmentReward.reward.kind, "equipment");
    assert.ok(equipmentReward.equipmentItemId?.endsWith("_common"));
    await battlePass.claimMilestone(player.id, "circle-1-200", now);
    await battlePass.claimMilestone(player.id, "circle-1-300", now);
    await battlePass.claimMilestone(player.id, "circle-1-150", now);
    await battlePass.claimMilestone(player.id, "circle-1-250", now);
    const cardReward = await battlePass.claimMilestone(player.id, "circle-1-400", now);

    assert.equal(cardReward.reward.kind, "card");
    assert.equal(cardReward.reward.label, "Випадкова карта");
    assert.equal(cardReward.card?.level, 30);
    assert.equal(cardReward.card?.rarity, "epic");
    assert.equal((await getCurrencyBoostStatus(pool, player.id, new Date("2026-08-24T11:59:59.999Z"))).active, true);
    assert.equal((await getCurrencyBoostStatus(pool, player.id, new Date("2026-08-24T12:00:00.000Z"))).active, false);
  } finally {
    await pool.query("DELETE FROM players WHERE id = $1", [player.id]);
    await pool.end();
  }
});

test("daily tasks pay gold, silver and an item, and five arena wins pay an epic-or-better card", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const player = await new PlayerRepository(pool).findOrCreateFromTelegram(telegramUser());
  const battlePass = new BattlePassService(pool);
  const now = new Date("2026-08-23T12:00:00.000Z");
  const addEvents = (eventType: string, count: number) => pool.query(
    "INSERT INTO player_campaign_events (player_id, event_type, payload, occurred_at) SELECT $1, $2, '{}'::jsonb, $3 FROM generate_series(1, $4)",
    [player.id, eventType, now, count],
  );
  try {
    const page = await battlePass.getPage(player.id, now);
    const winArenas = page.daily.tasks.find(({ id }) => id === "win-arenas")!;
    assert.deepEqual(winArenas.reward, { card: { maxLevel: 33, minLevel: 29 }, diamonds: 3, equipment: "common", gold: 0, silver: 3_000 });
    const before = (await pool.query<{ gold: string; silver: string }>("SELECT gold, silver FROM players WHERE id = $1", [player.id])).rows[0]!;

    await addEvents("ARENA_FINISHED", 10);
    const played = await battlePass.claimDailyTask(player.id, "play-arenas", now);
    assert.equal(played.updatedBalance.gold, Number(before.gold) + 3);
    assert.equal(played.updatedBalance.silver, Number(before.silver) + 3_000);
    assert.ok(played.equipmentItemId?.endsWith("_common"));
    assert.equal(played.card, undefined);
    assert.equal(played.battlePass.diamonds, 3);

    await addEvents("ARENA_WON", 5);
    const won = await battlePass.claimDailyTask(player.id, "win-arenas", now);
    assert.ok(won.card);
    assert.ok(won.card.level >= 29 && won.card.level <= 33);
    assert.equal(won.card.rarity, "epic");
    assert.equal(won.updatedBalance.silver, Number(before.silver) + 6_000);
    assert.equal(won.battlePass.diamonds, 6);
    await assert.rejects(() => battlePass.claimDailyTask(player.id, "win-arenas", now));
  } finally {
    await pool.query("DELETE FROM players WHERE id = $1", [player.id]);
    await pool.end();
  }
});
