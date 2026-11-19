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
    // Below the third epic duel league (900) the arena is closed, so its tasks are not offered.
    const locked = await battlePass.getPage(player.id, now);
    assert.ok(!locked.daily.tasks.some(({ id }) => id === "play-arenas" || id === "win-arenas"));
    await assert.rejects(() => battlePass.claimDailyTask(player.id, "play-arenas", now));
    await pool.query("UPDATE players SET duel_rating = 900 WHERE id = $1", [player.id]);

    const page = await battlePass.getPage(player.id, now);
    const winArenas = page.daily.tasks.find(({ id }) => id === "win-arenas")!;
    // A new arena player starts in third blue, where the reference pays a level 20-24 epic card.
    assert.deepEqual(winArenas.reward, { card: { maxLevel: 24, minLevel: 20 }, diamonds: 3, equipment: "common", gold: 0, silver: 3_000 });
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
    assert.ok(won.card.level >= 20 && won.card.level <= 24);
    assert.equal(won.card.rarity, "epic");
    assert.equal(won.updatedBalance.silver, Number(before.silver) + 6_000);
    assert.equal(won.battlePass.diamonds, 6);
    await assert.rejects(() => battlePass.claimDailyTask(player.id, "win-arenas", now));
  } finally {
    await pool.query("DELETE FROM players WHERE id = $1", [player.id]);
    await pool.end();
  }
});

test("VIP grants hunting permits on the active circle, the final card waits for VIP, a second permit pays 100 gold", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const player = await new PlayerRepository(pool).findOrCreateFromTelegram(telegramUser());
  const battlePass = new BattlePassService(pool);
  const now = new Date("2026-08-23T12:00:00.000Z");
  const permits = async () => Number((await pool.query("SELECT hunting_permits FROM player_invasion_items WHERE player_id = $1", [player.id])).rows[0]?.hunting_permits ?? 0);
  const setDiamonds = (diamonds: number) => pool.query("UPDATE player_battle_pass_state SET diamonds = $3 WHERE player_id = $1 AND season_id = $2", [player.id, "2026-08", diamonds]);
  try {
    await battlePass.getPage(player.id, now);
    await setDiamonds(400);
    await pool.query("UPDATE players SET gold = 1300 WHERE id = $1", [player.id]);

    const before = await battlePass.getPage(player.id, now);
    const stop200 = before.battlePass.circles[0]!.milestones.find(({ threshold }) => threshold === 200)!;
    assert.deepEqual(before.battlePass.vip, { active: false, price: 1250, purchasable: true });
    assert.equal(before.battlePass.totalCircles, 4);
    assert.equal(stop200.vip?.claimable, false);
    await assert.rejects(() => battlePass.claimMilestone(player.id, "circle-1-200-vip", now));

    const bought = await battlePass.purchaseVip(player.id, now);
    assert.equal(bought.updatedBalance.gold, 50);
    assert.equal(bought.battlePass.vip.active, true);
    await assert.rejects(() => battlePass.purchaseVip(player.id, now));

    const permit = await battlePass.claimMilestone(player.id, "circle-1-200-vip", now);
    assert.equal(permit.reward.kind, "item");
    assert.equal(permit.convertedToGold, undefined);
    assert.equal(await permits(), 1);
    // Locked items (no game system yet) cannot be claimed.
    await assert.rejects(() => battlePass.claimMilestone(player.id, "circle-1-50-vip", now));

    for (const id of ["circle-1-50", "circle-1-100", "circle-1-150", "circle-1-200", "circle-1-250", "circle-1-300"]) {
      await battlePass.claimMilestone(player.id, id, now);
    }
    // With VIP the card also waits for the VIP equipment on 100.
    await assert.rejects(() => battlePass.claimMilestone(player.id, "circle-1-400", now));
    const vipEquipment = await battlePass.claimMilestone(player.id, "circle-1-100-vip", now);
    assert.ok(vipEquipment.equipmentItemId?.endsWith("_uncommon"));
    const card = await battlePass.claimMilestone(player.id, "circle-1-400", now);
    assert.equal(card.battlePass.currentCircle, 2);
    assert.equal(card.battlePass.circles[0]!.fromDiamonds, 400);

    // Circle 2 boost is ×3 and its duration stacks on the remaining ×2.
    await setDiamonds(1900);
    const boost = await battlePass.claimMilestone(player.id, "circle-2-460", now);
    assert.equal(boost.battlePass.currencyBoost.multiplier, 3);
    assert.equal(boost.battlePass.currencyBoost.expiresAt, "2026-08-25T12:00:00.000Z");
    // The magic crystal (guild war) is a real item now, so the circle card waits for it too.
    for (const id of ["circle-2-460-vip", "circle-2-580", "circle-2-640-vip", "circle-2-700", "circle-2-900", "circle-3-970", "circle-3-1040-vip", "circle-3-1110", "circle-3-1250", "circle-3-1500"]) {
      await battlePass.claimMilestone(player.id, id, now);
    }
    const duplicate = await battlePass.claimMilestone(player.id, "circle-4-1900-vip", now);
    assert.equal(duplicate.convertedToGold, 100);
    assert.equal(await permits(), 1);
  } finally {
    await pool.query("DELETE FROM players WHERE id = $1", [player.id]);
    await pool.end();
  }
});

test("VIP bought after a finished circle loses that circle's VIP rewards", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const player = await new PlayerRepository(pool).findOrCreateFromTelegram(telegramUser());
  const battlePass = new BattlePassService(pool);
  const now = new Date("2026-08-23T12:00:00.000Z");
  try {
    await battlePass.getPage(player.id, now);
    await pool.query("UPDATE player_battle_pass_state SET diamonds = 470 WHERE player_id = $1 AND season_id = $2", [player.id, "2026-08"]);
    await pool.query("UPDATE players SET gold = 1250 WHERE id = $1", [player.id]);
    for (const id of ["circle-1-50", "circle-1-100", "circle-1-150", "circle-1-200", "circle-1-250", "circle-1-300", "circle-1-400"]) {
      await battlePass.claimMilestone(player.id, id, now);
    }
    await battlePass.purchaseVip(player.id, now);
    await assert.rejects(() => battlePass.claimMilestone(player.id, "circle-1-200-vip", now));
    const rare = await battlePass.claimMilestone(player.id, "circle-2-460-vip", now);
    assert.ok(rare.equipmentItemId?.endsWith("_rare"));
  } finally {
    await pool.query("DELETE FROM players WHERE id = $1", [player.id]);
    await pool.end();
  }
});

test("the circle's final card is shown in advance, stays the same and is the one granted; with VIP it comes in the VIP frame", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const player = await new PlayerRepository(pool).findOrCreateFromTelegram(telegramUser());
  const battlePass = new BattlePassService(pool);
  const now = new Date("2026-08-23T12:00:00.000Z");
  try {
    const first = await battlePass.getPage(player.id, now);
    const preview = first.battlePass.circles[0]!.finalCard;
    assert.ok(preview, "the active circle shows its final card");
    assert.equal(preview.vip, false);
    const again = await battlePass.getPage(player.id, now);
    assert.equal(again.battlePass.circles[0]!.finalCard?.cardId, preview.cardId, "the preview does not change between loads");

    await pool.query("UPDATE player_battle_pass_state SET diamonds = 400 WHERE player_id = $1 AND season_id = $2", [player.id, "2026-08"]);
    await pool.query("UPDATE players SET gold = 1300 WHERE id = $1", [player.id]);
    const bought = await battlePass.purchaseVip(player.id, now);
    assert.equal(bought.battlePass.circles[0]!.finalCard?.vip, true);
    for (const id of ["circle-1-50", "circle-1-100", "circle-1-150", "circle-1-200", "circle-1-250", "circle-1-300", "circle-1-100-vip", "circle-1-200-vip"]) {
      await battlePass.claimMilestone(player.id, id, now);
    }
    const final = await battlePass.claimMilestone(player.id, "circle-1-400", now);
    assert.equal(final.card?.cardId, preview.cardId, "the granted card is the one shown in advance");
    assert.equal(final.card?.vip, true);
    const stored = await pool.query<{ vip_frame: boolean }>("SELECT vip_frame FROM player_card_instances WHERE id = $1", [final.card!.instanceId]);
    assert.equal(stored.rows[0]?.vip_frame, true);
  } finally {
    await pool.query("DELETE FROM players WHERE id = $1", [player.id]);
    await pool.end();
  }
});
