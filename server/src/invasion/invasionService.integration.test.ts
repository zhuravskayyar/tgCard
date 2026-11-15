import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { INVASION_UNLOCK_DUEL_LEAGUE_INDEX, type InvasionView } from "@cardastika/shared";
import { Pool } from "pg";
import type { ValidatedTelegramUser } from "../auth/telegramInitData.js";
import { recalculateAutomaticDeckForPlayer } from "../decks/automaticDeckService.js";
import { PlayerRepository } from "../users/playerRepository.js";
import { InvasionDomainError, InvasionService } from "./invasionService.js";

const rawDatabaseUrl = process.env.DATABASE_URL?.trim();
/** Only ever touch a local database: this test rewrites the newest invasion event. */
const databaseUrl = rawDatabaseUrl && ["127.0.0.1", "localhost", "::1"].includes(safeHost(rawDatabaseUrl)) ? rawDatabaseUrl : undefined;

function safeHost(url: string) {
  try { return new URL(url).hostname.replace(/^[|]$/g, ""); } catch { return ""; }
}
let sequence = 0n;

function telegramUser(): ValidatedTelegramUser {
  sequence += 1n;
  return {
    id: String(BigInt(Date.now()) * 1_000_000n + BigInt(process.pid) * 100n + sequence + 700n),
    username: `invasion_test_${sequence}`,
    firstName: "Invasion test",
    lastName: null,
    photoUrl: null,
  };
}

async function count(pool: Pool, sql: string, params: unknown[] = []) {
  return Number((await pool.query<{ n: string }>(sql, params)).rows[0]!.n);
}

/**
 * Runs against the local database, on the newest invasion (created lazily by the service); everything this test
 * creates (events above the baseline, players) is deleted at the end. Migration 098 is idempotent, so it is applied first.
 */
test("invasion: one kill under concurrent strikes, stale battle settled once, prizes claimed once, price guard", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const migration = readFileSync(new URL("../../migrations/098_invasion.sql", import.meta.url), "utf8");
  await pool.query(migration);
  const baseline = await count(pool, "SELECT COALESCE(MAX(number), 0) AS n FROM invasion_events");
  const fixedNow = Date.now();
  const service = new InvasionService(pool, Math.random, () => fixedNow);
  const repository = new PlayerRepository(pool);
  const ids: string[] = [];
  const makePlayer = async () => {
    const player = await repository.findOrCreateFromTelegram(telegramUser());
    ids.push(player.id);
    await pool.query("UPDATE players SET duel_highest_league_index = $2, gold = 1000 WHERE id = $1", [player.id, INVASION_UNLOCK_DUEL_LEAGUE_INDEX]);
    await recalculateAutomaticDeckForPlayer(pool, player.id);
    return player.id;
  };
  try {
    const [a, b, c, d] = [await makePlayer(), await makePlayer(), await makePlayer(), await makePlayer()];

    const first = await service.getView(a);
    assert.equal(first.unlocked, true);
    assert.ok(!Number.isNaN(Date.parse(first.serverNow)), "serverNow is filled");
    const eventNumber = first.invasionNumber;
    assert.ok(eventNumber > baseline, "the test owns the newest invasion");
    const hourAgo = new Date(fixedNow - 3_600_000);
    await pool.query("UPDATE invasion_events SET starts_at = $2, boss_appears_at = $2, boss_health = 5000000 WHERE number = $1", [eventNumber, hourAgo]);

    // C fights first, so its damage already counts when the boss dies under someone else's strike.
    const battleOf = (view: InvasionView) => view.battle!;
    const cBattle = battleOf(await service.attack(c, { expectedGold: 0 }));
    // A starter deck would die to the boss's counter-strike; keep C alive so its battle stays open.
    await pool.query("UPDATE invasion_battles SET state = jsonb_set(jsonb_set(state, '{core,playerHp}', '1000000000'), '{core,playerMaxHp}', '1000000000') WHERE id = $1", [cBattle.id]);
    const afterC = await service.strike(c, { battleId: cBattle.id, expectedVersion: cBattle.version, slotIndex: 0 });
    assert.ok(afterC.battle!.damageDealt > 0);
    const cStats = (await pool.query<{ silver: string; account_xp: string; level: number }>("SELECT silver, account_xp, level FROM players WHERE id = $1", [c])).rows[0]!;

    const aBattle = battleOf(await service.attack(a, { expectedGold: 0 }));
    const bBattle = battleOf(await service.attack(b, { expectedGold: 0 }));
    await pool.query("UPDATE invasion_events SET boss_health = 1 WHERE number = $1", [eventNumber]);

    // (a) two killing strikes at once: exactly one kill, one set of prizes, the boss advances by one.
    await Promise.all([
      service.strike(a, { battleId: aBattle.id, expectedVersion: aBattle.version, slotIndex: 0 }),
      service.strike(b, { battleId: bBattle.id, expectedVersion: bBattle.version, slotIndex: 0 }),
    ]);
    const event = (await pool.query<{ current_boss: number; boss_health: string }>("SELECT current_boss, boss_health FROM invasion_events WHERE number = $1", [eventNumber])).rows[0]!;
    assert.equal(event.current_boss, 2);
    assert.notEqual(event.boss_health, "0");
    assert.equal(await count(pool, "SELECT COUNT(*) AS n FROM invasion_prizes WHERE invasion_number = $1 AND boss_number = 1 AND kind = 'first_place'", [eventNumber]), 1);
    const prizeTotal = await count(pool, "SELECT COUNT(*) AS n FROM invasion_prizes WHERE invasion_number = $1 AND boss_number = 1", [eventNumber]);
    assert.ok(prizeTotal >= 1);
    assert.equal(await count(pool, "SELECT COUNT(*) AS n FROM invasion_participants WHERE invasion_number = $1 AND boss_number = 1 AND damage > 0", [eventNumber]) <= 3, true);

    // (b) C's battle is still open on the dead boss: the next GET settles it and pays for the damage once.
    const settled = await service.getView(c);
    assert.equal(settled.battle, null);
    assert.ok(settled.lastResult && settled.lastResult.bossKilled && settled.lastResult.xp > 0, "the stale battle is rewarded");
    const cAfter = (await pool.query<{ silver: string; account_xp: string; level: number }>("SELECT silver, account_xp, level FROM players WHERE id = $1", [c])).rows[0]!;
    assert.equal(Number(cAfter.silver) - Number(cStats.silver), settled.lastResult.silver);
    const again = await service.getView(c);
    assert.equal(again.lastResult, null);
    const cAgain = (await pool.query<{ silver: string }>("SELECT silver FROM players WHERE id = $1", [c])).rows[0]!;
    assert.equal(cAgain.silver, cAfter.silver, "no second payout");
    assert.equal(await count(pool, "SELECT COUNT(*) AS n FROM invasion_battles WHERE player_id = $1 AND finished = FALSE", [c]), 0);

    // (c) prizes are claimed exactly once, even when two GETs race.
    await Promise.all([service.getView(a), service.getView(a), service.getView(b)]);
    await service.getView(b);
    await service.getView(a);
    const claimed = await count(pool, "SELECT COUNT(*) AS n FROM invasion_prizes WHERE invasion_number = $1 AND boss_number = 1 AND instance_id IS NOT NULL AND seen_at IS NOT NULL", [eventNumber]);
    assert.equal(claimed, prizeTotal, "every prize got an instance");
    assert.equal(await count(pool, "SELECT COUNT(DISTINCT instance_id) AS n FROM invasion_prizes WHERE invasion_number = $1 AND boss_number = 1", [eventNumber]), prizeTotal, "one instance per prize, none shared or created twice");
    assert.equal(await count(pool, "SELECT COUNT(*) AS n FROM invasion_prizes WHERE instance_id IS NOT NULL AND invasion_number = $1 AND boss_number = 1 AND player_id <> ALL($2::uuid[])", [eventNumber, [a, b, c]]), 0);
    const shownTwice = await service.getView(a);
    assert.deepEqual(shownTwice.defeats, []);

    // (d) the price guard: an attack priced above expectedGold is refused, and gold is charged once on success.
    await pool.query("UPDATE invasion_events SET boss_appears_at = $2 WHERE number = $1", [eventNumber, hourAgo]);
    await service.attack(d, { expectedGold: 0 });
    await pool.query("UPDATE invasion_battles SET finished = TRUE WHERE player_id = $1", [d]);
    const quoted = await service.getView(d);
    const price = quoted.quote!.gold;
    assert.ok(price > 0, "the second attack is inside the break and costs gold");
    const goldBefore = Number(quoted.gold);
    await assert.rejects(service.attack(d, { expectedGold: price - 1 }), (error) => error instanceof InvasionDomainError && error.code === "invasion_price_changed");
    assert.equal(await count(pool, "SELECT gold AS n FROM players WHERE id = $1", [d]), goldBefore, "nothing charged on refusal");
    const paid = await service.attack(d, { expectedGold: price });
    assert.equal(paid.gold, goldBefore - price);
    assert.equal(await count(pool, "SELECT gold AS n FROM players WHERE id = $1", [d]), goldBefore - price, "charged once");
  } finally {
    await pool.query("DELETE FROM invasion_events WHERE number > $1", [baseline]);
    await pool.query("DELETE FROM players WHERE id = ANY($1::uuid[])", [ids]);
    await pool.end();
  }
});

test("invasion: diamonds paid once per attack under the daily norm, hunting permit halves the price, guild XP recorded", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  await pool.query(readFileSync(new URL("../../migrations/098_invasion.sql", import.meta.url), "utf8"));
  const baseline = await count(pool, "SELECT COALESCE(MAX(number), 0) AS n FROM invasion_events");
  const fixedNow = Date.now();
  // A constant 0.99 rules out the random bonus diamonds (chance 0.1) once switched on.
  let steady = false;
  const calls: Array<{ playerId: string; type: string; sourceId: string; xp: number }> = [];
  const recorder = {
    async recordActivity(_client: unknown, playerId: string, type: string, sourceId: string, xp: number) {
      calls.push({ playerId, type, sourceId, xp });
      return xp;
    },
  };
  const service = new InvasionService(pool, () => (steady ? 0.99 : Math.random()), () => fixedNow, undefined, recorder);
  const repository = new PlayerRepository(pool);
  const ids: string[] = [];
  try {
    const player = await repository.findOrCreateFromTelegram(telegramUser());
    const p = player.id;
    ids.push(p);
    await pool.query("UPDATE players SET duel_highest_league_index = $2, gold = 10000000 WHERE id = $1", [p, INVASION_UNLOCK_DUEL_LEAGUE_INDEX]);
    await recalculateAutomaticDeckForPlayer(pool, p);
    const first = await service.getView(p);
    assert.deepEqual(first.diamondsToday, { norm: 0, limit: 8 });
    assert.deepEqual(first.huntingPermit, { owned: 0, activeOnBoss: false });
    const hourAgo = new Date(fixedNow - 3_600_000);
    await pool.query("UPDATE invasion_events SET starts_at = $2, boss_appears_at = $2, boss_health = 1000000000000 WHERE number = $1", [first.invasionNumber, hourAgo]);
    steady = true;

    const diamondsInPass = () => count(pool, "SELECT COALESCE(SUM(diamonds), 0) AS n FROM player_battle_pass_state WHERE player_id = $1", [p]);
    const paid: number[] = [];
    const autoAttack = async () => {
      const view = await service.getView(p);
      const result = await service.autoBattle(p, { expectedGold: view.quote!.autoGold });
      paid.push(result.lastResult!.diamonds);
      return result;
    };
    for (let index = 0; index < 5; index += 1) await autoAttack();
    assert.deepEqual(paid, [2, 2, 2, 2, 0], "2 diamonds per attack until the norm of 8, nothing above it");
    assert.equal(await diamondsInPass(), 8, "diamonds reach «Алмазні нагороди» exactly once per attack");
    assert.equal(await count(pool, "SELECT norm_diamonds AS n FROM invasion_daily_diamonds WHERE player_id = $1", [p]), 8);
    const afterNorm = await service.getView(p);
    assert.deepEqual(afterNorm.diamondsToday, { norm: 8, limit: 8 });
    // The view must not pay anything.
    await service.getView(p);
    assert.equal(await diamondsInPass(), 8);

    // «Шукачі скарбів» doubles the norm.
    await pool.query("INSERT INTO player_collection_completions (player_id, collection_id) SELECT $1, id FROM collections WHERE code = 'treasure_hunters'", [p]);
    const doubled = await service.getView(p);
    assert.deepEqual(doubled.diamondsToday, { norm: 8, limit: 16 });
    await autoAttack();
    assert.equal(paid.at(-1), 2);
    assert.equal(await diamondsInPass(), 10);

    // Guild XP: one record per paid attack with the XP the player got, unique source ids.
    const withXp = calls.filter((call) => call.playerId === p);
    assert.ok(withXp.length > 0 && withXp.every((call) => call.type === "invasion_attack" && call.xp > 0 && call.sourceId.startsWith("invasion:")));
    assert.equal(new Set(withXp.map((call) => call.sourceId)).size, withXp.length);

    // Hunting permit: none → error; activation halves the price; second activation is refused.
    await assert.rejects(service.activatePermit(p), (error) => error instanceof InvasionDomainError && error.code === "invasion_permit_none");
    await pool.query("INSERT INTO player_invasion_items (player_id, hunting_permits) VALUES ($1, 2)", [p]);
    const full = (await service.getView(p)).quote!;
    assert.ok(full.autoGold >= 20, "full price is meaningful at this attack number");
    const activated = await service.activatePermit(p);
    assert.deepEqual(activated.huntingPermit, { owned: 1, activeOnBoss: true });
    assert.equal(activated.quote!.autoGold, Math.ceil(full.autoGold / 2));
    await assert.rejects(service.activatePermit(p), (error) => error instanceof InvasionDomainError && error.code === "invasion_permit_active");
    assert.equal(await count(pool, "SELECT hunting_permits AS n FROM player_invasion_items WHERE player_id = $1", [p]), 1, "a refused activation keeps the permit");
    const goldBefore = await count(pool, "SELECT gold AS n FROM players WHERE id = $1", [p]);
    await assert.rejects(service.autoBattle(p, { expectedGold: activated.quote!.autoGold - 1 }), (error) => error instanceof InvasionDomainError && error.code === "invasion_price_changed");
    await service.autoBattle(p, { expectedGold: activated.quote!.autoGold });
    assert.equal(await count(pool, "SELECT gold AS n FROM players WHERE id = $1", [p]) - goldBefore <= -activated.quote!.autoGold, true, "discounted price charged");
    assert.ok(goldBefore - await count(pool, "SELECT gold AS n FROM players WHERE id = $1", [p]) < full.autoGold, "not the full price");

    // The permit works on one boss only: after the kill it no longer applies.
    await pool.query("UPDATE invasion_events SET boss_health = 1 WHERE number = $1", [first.invasionNumber]);
    await service.autoBattle(p, { expectedGold: (await service.getView(p)).quote!.autoGold });
    const next = await service.getView(p);
    assert.equal(next.boss!.number, 2);
    assert.equal(next.huntingPermit.activeOnBoss, false);
    assert.equal((await service.activatePermit(p)).huntingPermit.activeOnBoss, true, "the second permit works on the next boss");
    assert.equal(await count(pool, "SELECT hunting_permits AS n FROM player_invasion_items WHERE player_id = $1", [p]), 0);

    // Both guild activity constraints accept the new type (and dragon raids).
    for (const table of ["guild_xp_contributions", "guild_activity_log"]) {
      const definition = (await pool.query<{ def: string }>(
        "SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = $1", [`${table}_activity_type_check`],
      )).rows[0]!.def;
      assert.ok(definition.includes("invasion_attack") && definition.includes("dragon_raid"), table);
    }
  } finally {
    await pool.query("DELETE FROM invasion_events WHERE number > $1", [baseline]);
    await pool.query("DELETE FROM players WHERE id = ANY($1::uuid[])", [ids]);
    await pool.end();
  }
});
