import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { ARENA_UNLOCK_DUEL_RATING, type CardElement } from "@cardastika/shared";
import { Pool } from "pg";
import type { ValidatedTelegramUser } from "../auth/telegramInitData.js";
import { recalculateAutomaticDeckForPlayer } from "../decks/automaticDeckService.js";
import { STARTER_CARDS } from "../inventory/starterCards.js";
import { PlayerRepository } from "../users/playerRepository.js";
import { GuardianDragonLockedError, GuardianDragonService, GuardianDragonStateError } from "./guardianDragonService.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
let sequence = 0n;

function createTelegramUser(): ValidatedTelegramUser {
  sequence += 1n;
  return {
    id: String(BigInt(Date.now()) * 1_000_000n + BigInt(process.pid) * 100n + sequence),
    username: null,
    firstName: "Guardian dragon test",
    lastName: null,
    photoUrl: null,
  };
}

function clock(start: string) {
  let now = new Date(start);
  return { now: () => now, set: (value: string) => { now = new Date(value); } };
}

async function expectState(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error) => error instanceof GuardianDragonStateError && error.code === code);
}

test("guardian dragon: gate, feeding, hikes, cancel and monthly rebirth", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const user = createTelegramUser();
  const time = clock("2031-03-10T12:00:00Z");
  const service = new GuardianDragonService(pool, { now: time.now });
  try {
    const player = await new PlayerRepository(pool).findOrCreateFromTelegram(user);

    const locked = await service.getDragon(player.id);
    assert.equal(locked.unlocked, false);
    assert.equal(locked.battleHealthBonus, 0);
    await assert.rejects(service.startHike(player.id, 2), GuardianDragonLockedError);

    await pool.query("UPDATE players SET duel_rating = $2 WHERE id = $1", [player.id, ARENA_UNLOCK_DUEL_RATING]);
    // Weak cards: level 1 starter copies outside the deck; one of them is protected.
    const weak = Array.from({ length: 3 }, () => randomUUID());
    const guarded = randomUUID();
    await pool.query(
      `INSERT INTO player_card_instances (id, player_id, card_id, level, bonus_power)
       SELECT input.id, $1, $2, 1, input.bonus FROM unnest($3::uuid[], $4::integer[]) AS input(id, bonus)`,
      [player.id, STARTER_CARDS[0]!.id, [...weak, guarded], [0, 0, 0, 0]],
    );
    await pool.query("UPDATE player_card_instances SET protected_from_absorption = TRUE WHERE id = $1", [guarded]);
    await recalculateAutomaticDeckForPlayer(pool, player.id);

    const fresh = await service.getDragon(player.id);
    assert.equal(fresh.unlocked, true);
    assert.equal(fresh.monthKey, "2031-03");
    assert.equal(fresh.health, 0);
    assert.equal(fresh.stage, 0);
    assert.equal(fresh.mastery, 45);

    await expectState(service.feed(player.id, [guarded]), "card_not_feedable");
    await expectState(service.startHike(player.id, 2), "not_enough_progress");

    // The element tab limits "feed all" to that element's weak cards.
    const ownElement = (await pool.query<{ element: CardElement }>("SELECT element FROM cards WHERE id = $1", [STARTER_CARDS[0]!.id])).rows[0]!.element;
    const otherElement = (["fire", "water", "earth", "air"] as const).find((element) => element !== ownElement)!;
    await expectState(service.feed(player.id, undefined, otherElement), "nothing_to_feed");

    const fedOne = await service.feed(player.id, [weak[0]!]);
    assert.deepEqual(fedOne.consumedInstanceIds, [weak[0]]);
    assert.ok(fedOne.dragon.progressMinutes >= 1);

    // Feed-all stops as soon as the 8-hour scale is full and never eats a protected card.
    await pool.query("UPDATE guardian_dragons SET progress_minutes = 479 WHERE player_id = $1", [player.id]);
    const fedAll = await service.feed(player.id);
    assert.equal(fedAll.dragon.progressMinutes, 480);
    assert.equal(fedAll.consumedInstanceIds.length, 1);
    assert.ok(!fedAll.consumedInstanceIds.includes(guarded));
    await expectState(service.feed(player.id), "progress_full");
    const left = await pool.query("SELECT id FROM player_card_instances WHERE id = ANY($1::uuid[])", [[...weak, guarded]]);
    assert.equal(left.rowCount, 2);
    assert.ok(left.rows.some(({ id }) => id === guarded));

    const onHike = await service.startHike(player.id, 8);
    assert.equal(onHike.progressMinutes, 0);
    assert.equal(onHike.hike?.healthGain, 320);
    assert.equal(onHike.battleHealthBonus, 0);
    await expectState(service.startHike(player.id, 2), "hike_running");

    const cancelled = await service.cancelHike(player.id);
    assert.equal(cancelled.hike, null);
    assert.equal(cancelled.health, 0);
    assert.equal(cancelled.progressMinutes, 480);

    await service.startHike(player.id, 8);
    time.set("2031-03-10T19:59:00Z");
    assert.equal((await service.getDragon(player.id)).health, 0);
    time.set("2031-03-10T20:00:00Z");
    const back = await service.getDragon(player.id);
    assert.equal(back.health, 320);
    assert.equal(back.hike, null);
    assert.equal(back.battleHealthBonus, 320);
    assert.equal(back.stage, 1);

    // Fights: every random draw wins, so the numbers are exact.
    const fighter = new GuardianDragonService(pool, { now: time.now, random: () => 0 });
    assert.equal(back.fights.freeReady, true);
    assert.equal(back.fights.freeFights, 10);
    assert.equal(back.flame.level, 90);
    assert.equal(back.flame.power, 2817);
    const freeSend = await fighter.fight(player.id);
    assert.deepEqual(freeSend.result, { fights: 10, wins: 10, ratingGain: 110, masteryGain: 5, goldSpent: 0, playerGold: 0 });
    assert.equal(freeSend.dragon.mastery, 50);
    assert.equal(freeSend.dragon.flame.power, 3130);
    assert.equal(freeSend.dragon.fights.freeReady, false);
    assert.equal(freeSend.dragon.fights.cooldownUntil, "2031-03-11T06:00:00.000Z");
    assert.equal(freeSend.dragon.fights.nextPaidPrice, 10);
    assert.ok(freeSend.dragon.fights.place !== null);

    await pool.query("UPDATE players SET gold = 15 WHERE id = $1", [player.id]);
    // A stale "free" click never pays: the server refuses a price the button did not show.
    await expectState(fighter.fight(player.id, 0), "price_changed");
    const paidSend = await fighter.fight(player.id, 10);
    assert.equal(paidSend.result.fights, 100);
    assert.equal(paidSend.result.goldSpent, 10);
    assert.equal(paidSend.result.playerGold, 5);
    assert.equal(paidSend.dragon.mastery, 100);
    assert.equal(paidSend.dragon.fights.rating, 1210);
    assert.equal(Number((await pool.query("SELECT gold FROM players WHERE id = $1", [player.id])).rows[0].gold), 5);
    await expectState(fighter.fight(player.id), "insufficient_gold");

    const rating = await fighter.getRating(player.id, 1);
    assert.equal(rating.viewer?.rating, 1210);
    assert.equal(rating.viewer?.place, paidSend.dragon.fights.place);

    time.set("2031-03-11T06:00:00Z");
    assert.equal((await fighter.getDragon(player.id)).fights.freeReady, true);

    // Rebirth: a top-100 dragon keeps its mastery, health and rating start again.
    time.set("2031-04-01T00:00:00Z");
    const reborn = await service.getDragon(player.id);
    assert.equal(reborn.monthKey, "2031-04");
    assert.equal(reborn.health, 0);
    assert.equal(reborn.progressMinutes, 0);
    assert.equal(reborn.mastery, 100);
    assert.equal(reborn.fights.rating, 0);

    // Outside the top 100 (no rating) the dragon starts again at 45.
    time.set("2031-05-01T00:00:00Z");
    assert.equal((await service.getDragon(player.id)).mastery, 45);
  } finally {
    await pool.query("DELETE FROM players WHERE telegram_user_id = $1::bigint", [user.id]);
    await pool.end();
  }
});
