import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import { TOURNAMENT_RULES, getTournamentStageWindow } from "@cardastika/game-core";
import type { ValidatedTelegramUser } from "../auth/telegramInitData.js";
import { PlayerRepository } from "../users/playerRepository.js";
import { TournamentActionError, TournamentService } from "./tournamentService.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
let sequence = 0n;

function telegramUser(name: string): ValidatedTelegramUser {
  sequence += 1n;
  return { id: String(BigInt(Date.now()) * 1_000_000n + BigInt(process.pid) * 100n + sequence), username: null, firstName: name, lastName: null, photoUrl: null };
}

test("two real players register, fight a live final and receive rating, XP and the Conqueror prize", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const ids: string[] = [];
  let eventId: string | null = null;
  try {
    for (const name of ["Tournament A", "Tournament B"]) ids.push((await players.findOrCreateFromTelegram(telegramUser(name))).id);
    // Third epic duel league, the reference's 2000 duel rating.
    await pool.query("UPDATE players SET duel_rating = 900, arena_rating = 1400, gold = 100 WHERE id = ANY($1::uuid[])", [ids]);
    const [a, b] = ids as [string, string];
    const service = new TournamentService(pool, false, () => 0.25, true, false);
    const now = new Date();

    const lobby = await service.scheduleDevEvent(a, now);
    assert.equal(lobby.eligible, true);
    assert.equal(lobby.league, "conqueror");
    assert.equal(lobby.event?.registered, true);
    eventId = lobby.event!.id;
    await assert.rejects(service.register(a, now), TournamentActionError);
    const second = await service.register(b, now);
    assert.equal(second.event?.id, eventId);
    assert.equal(second.event?.registeredCount, 2);
    assert.equal((await service.getRun(a, now))?.status, "waiting");

    const startsAt = Date.parse(lobby.event!.startsAt);
    const window = getTournamentStageWindow(startsAt, 0);
    const paired = await service.getRun(a, new Date(startsAt + 1));
    assert.equal(paired?.status, "buff_selection");
    assert.equal(paired?.stage?.label, "Фінал");
    // A saved tournament snapshot must follow the same display-name rule as the HUD.
    await players.updateNickname(a, "Kostalgia");
    await pool.query("UPDATE players SET nickname = NULL, username = 'SofiComet797' WHERE id = $1", [b]);
    const renamed = await service.getRun(a, new Date(startsAt + 2));
    assert.equal(renamed?.player?.name, "Kostalgia");
    assert.equal(renamed?.match?.opponent.name, "SofiComet797");
    const matchId = renamed!.match!.id;
    const element = renamed!.buffOptions![0].element;
    const buffed = await service.action(a, { type: "buff", matchId, element }, new Date(startsAt + 2));
    assert.equal(buffed.match?.buffElement, element);
    assert.equal(buffed.goldAvailable, 100 - TOURNAMENT_RULES.buffGold);
    await assert.rejects(service.action(a, { type: "attack", matchId, slotIndex: 0 }, new Date(window.battleStartsAt - 1)), TournamentActionError);

    const live = await service.action(a, { type: "attack", matchId, slotIndex: 0 }, new Date(window.battleStartsAt + 10));
    assert.equal(live.status, "battle");
    assert.equal(live.match!.log[0]!.ownStrike, true);
    const seenByB = await service.getRun(b, new Date(window.battleStartsAt + 11));
    assert.equal(seenByB!.match!.log[0]!.ownStrike, false);
    assert.equal(seenByB!.match!.opponentHp, live.match!.playerHp);
    await assert.rejects(service.action(a, { type: "attack", matchId, slotIndex: 0 }, new Date(window.battleStartsAt + 12)), TournamentActionError);
    await service.action(b, { type: "change", matchId }, new Date(window.battleStartsAt + 13));
    await assert.rejects(service.action(b, { type: "change", matchId }, new Date(window.battleStartsAt + 14)), TournamentActionError);

    // A attacked, B did not: A wins on damage when the round expires.
    const finished = await service.getRun(a, new Date(window.endsAt + 1));
    assert.equal(finished?.status, "finished");
    assert.equal(finished?.placement, 1);
    assert.equal(finished?.standings?.length, 2);
    assert.ok(finished!.xpEarned > 0);
    assert.equal(finished?.prize?.reward?.kind, "card");
    assert.ok(finished?.prizeGranted?.cardName);
    const loser = await service.getRun(b, new Date(window.endsAt + 2));
    assert.equal(loser?.placement, 2);

    const lobbyAfterEvent = await service.getLobby(a, new Date(window.endsAt + 3_000));
    assert.deepEqual(lobbyAfterEvent.lastResults?.standings.map(({ place }) => place), [1, 2]);
    assert.equal(lobbyAfterEvent.lastResults?.standings[0]?.participant.playerId, a);
    assert.ok(Number.isInteger(lobbyAfterEvent.lastResults?.standings[0]?.participant.leagueIndex));

    const profiles = await pool.query<{ player_id: string; rating: number }>("SELECT player_id, rating FROM tournament_profiles WHERE player_id = ANY($1::uuid[])", [ids]);
    const ratings = new Map(profiles.rows.map(row => [row.player_id, row.rating]));
    assert.ok(ratings.get(a)! > 2000);
    assert.ok(ratings.get(b)! < 2000);
    const prizes = await pool.query("SELECT 1 FROM player_card_instances i JOIN cards c ON c.id = i.card_id WHERE i.player_id = $1 AND c.code = ANY($2::text[])", [a, ["beautiful_valkyrie", "forest_dryad", "fire_witch", "cruel_medusa"]]);
    assert.equal(prizes.rows.length, 1);
    // Results are paid once even if the event is read again.
    await service.getRun(a, new Date(window.endsAt + 5_000));
    assert.equal((await pool.query("SELECT 1 FROM player_card_instances i JOIN cards c ON c.id = i.card_id WHERE i.player_id = $1 AND c.code = ANY($2::text[])", [a, ["beautiful_valkyrie", "forest_dryad", "fire_witch", "cruel_medusa"]])).rows.length, 1);
  } finally {
    if (eventId) await pool.query("DELETE FROM tournament_events WHERE id = $1", [eventId]);
    if (ids.length) await pool.query("DELETE FROM players WHERE id = ANY($1::uuid[])", [ids]);
    await pool.end();
  }
});

test("a lone registration is cancelled at the start; no bots are added", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  let playerId = "";
  let eventId: string | null = null;
  try {
    playerId = (await players.findOrCreateFromTelegram(telegramUser("Tournament solo"))).id;
    await pool.query("UPDATE players SET duel_rating = 900 WHERE id = $1", [playerId]);
    const service = new TournamentService(pool, false, Math.random, true, false);
    const now = new Date();
    const lobby = await service.scheduleDevEvent(playerId, now);
    eventId = lobby.event!.id;
    const run = await service.getRun(playerId, new Date(Date.parse(lobby.event!.startsAt) + 1));
    assert.equal(run?.status, "cancelled");
    assert.equal(run?.match, null);
  } finally {
    if (eventId) await pool.query("DELETE FROM tournament_events WHERE id = $1", [eventId]);
    if (playerId) await pool.query("DELETE FROM players WHERE id = $1", [playerId]);
    await pool.end();
  }
});

test("locally a lone tester gets the sparring partner, who strikes on its own", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  let playerId = "";
  let eventId: string | null = null;
  try {
    playerId = (await players.findOrCreateFromTelegram(telegramUser("Tournament sparring tester"))).id;
    const service = new TournamentService(pool, false, () => 0.5, true, true);
    const now = new Date();
    const lobby = await service.scheduleDevEvent(playerId, now);
    eventId = lobby.event!.id;
    assert.equal(lobby.event?.registeredCount, 2);
    const startsAt = Date.parse(lobby.event!.startsAt);
    const window = getTournamentStageWindow(startsAt, 0);
    const paired = await service.getRun(playerId, new Date(startsAt + 1));
    assert.equal(paired?.status, "buff_selection");
    assert.equal(paired?.match?.opponent.name, "Спаринг-партнер");
    const live = await service.getRun(playerId, new Date(window.battleStartsAt + 3_100));
    assert.equal(live?.status, "battle");
    assert.ok(live!.match!.log.some(entry => !entry.ownStrike), "sparring partner struck");
  } finally {
    if (eventId) await pool.query("DELETE FROM tournament_events WHERE id = $1", [eventId]);
    if (playerId) await pool.query("DELETE FROM players WHERE id = $1", [playerId]);
    await pool.end();
  }
});

test("a Champion-league finish grants a real magic source of the prize level", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const ids: string[] = [];
  let eventId: string | null = null;
  try {
    for (const name of ["Source A", "Source B"]) ids.push((await players.findOrCreateFromTelegram(telegramUser(name))).id);
    await pool.query("UPDATE players SET duel_rating = 900, arena_rating = 1400, gold = 100 WHERE id = ANY($1::uuid[])", [ids]);
    await pool.query(
      "INSERT INTO tournament_profiles (player_id, rating, highest_league, highest_league_index) SELECT unnest($1::uuid[]), 2700, 'champion', 0",
      [ids],
    );
    const [a, b] = ids as [string, string];
    const service = new TournamentService(pool, false, () => 0.25, true, false);
    const now = new Date();
    const lobby = await service.scheduleDevEvent(a, now);
    assert.equal(lobby.league, "champion");
    eventId = lobby.event!.id;
    await service.register(b, now);
    const startsAt = Date.parse(lobby.event!.startsAt);
    const window = getTournamentStageWindow(startsAt, 0);
    const paired = await service.getRun(a, new Date(startsAt + 1));
    const matchId = paired!.match!.id;
    await service.action(a, { type: "buff", matchId, element: paired!.buffOptions![0].element }, new Date(startsAt + 2));
    await service.action(a, { type: "attack", matchId, slotIndex: 0 }, new Date(window.battleStartsAt + 10));

    const finished = await service.getRun(a, new Date(window.endsAt + 1));
    assert.equal(finished?.placement, 1);
    assert.deepEqual(finished?.prize?.reward, { kind: "source", level: 60, cardCodes: [] });
    assert.equal(finished?.prizeGranted?.sourcePending, false);
    assert.ok(finished?.prizeGranted?.cardName);
    const sources = await pool.query<{ level: number; bonus_power: number }>(
      "SELECT level, bonus_power FROM player_card_instances WHERE player_id = $1 AND card_id = ANY($2::text[])",
      [a, ["el_air", "el_earth", "el_fire", "el_water"]],
    );
    assert.deepEqual(sources.rows.map(({ level, bonus_power }) => [level, bonus_power]), [[60, 0]]);
    // Paid once even if the run is read again.
    await service.getRun(a, new Date(window.endsAt + 5_000));
    assert.equal((await pool.query("SELECT 1 FROM player_card_instances WHERE player_id = $1 AND card_id = ANY($2::text[])", [a, ["el_air", "el_earth", "el_fire", "el_water"]])).rows.length, 1);
  } finally {
    if (eventId) await pool.query("DELETE FROM tournament_events WHERE id = $1", [eventId]);
    if (ids.length) await pool.query("DELETE FROM players WHERE id = ANY($1::uuid[])", [ids]);
    await pool.end();
  }
});
