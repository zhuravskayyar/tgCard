import assert from "node:assert/strict";
import test from "node:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "pg";
import type { PlayerSummary } from "@cardastika/shared";
import { getTournamentPrize, TOURNAMENT_LEAGUES } from "@cardastika/game-core";
import { PlayerPersistenceError } from "../users/playerRepository.js";
import { TournamentService } from "./tournamentService.js";
import { handleTournamentRequest } from "./tournamentRoute.js";

function database(rows: { duel_rating: number; arena_rating: number }[]) {
  return { query: async (sql: string, parameters: string[]) => {
    assert.match(sql, /^SELECT duel_rating, arena_rating, FALSE AS has_master_cup FROM players WHERE id = \$1$/);
    assert.deepEqual(parameters, ["viewer"]);
    return { rows };
  } } as unknown as Pool;
}

test("lobby derives eligibility from real duels and provisional rating from the stronger personal rating", async () => {
  const service = new TournamentService(database([{ duel_rating: 1999, arena_rating: 3300 }]));
  const view = await service.getLobby("viewer", new Date("2026-11-03T00:00:00Z"));
  assert.equal(view.eligible, false);
  assert.equal(view.duelRating, 1999);
  assert.equal(view.rating, 3300);
  assert.equal(view.league, "master");
  assert.equal(view.ratingProvisional, true);
  assert.equal(view.registrationAvailable, false);
  assert.equal(view.schedule.startsAt, "2026-11-03T10:00:00.000Z");
  assert.equal(view.schedule.utcOffsetMinutes, 0);
  assert.deepEqual(view.rules, { registrationMinutes: 30, cycleSeconds: 9, roundSeconds: 220, freeCardChanges: 1, hpMultiplier: 2, buffGold: 10, buffPercent: 15, collectionBuffPercent: 20 });
});

test("lobby unlocks at exactly 2000 and never invents a cup to bypass the ruler gate", async () => {
  const service = new TournamentService(database([{ duel_rating: 2000, arena_rating: 4400 }]));
  const view = await service.getLobby("viewer");
  assert.equal(view.eligible, true);
  assert.equal(view.rating, 3800);
  assert.equal(view.league, "master");
});

test("lobby exposes all five configured leagues with the cup and weekly qualification gates", async () => {
  const view = await new TournamentService(database([{ duel_rating: 2000, arena_rating: 1400 }])).getLobby("viewer");
  assert.equal(view.leagues.length, 5);
  assert.deepEqual(view.leagues.map(row => row.league), ["conqueror", "champion", "master", "ruler", "crown"]);
  for (const league of view.leagues) {
    const definition = TOURNAMENT_LEAGUES[league.league];
    assert.equal(league.name, definition.name);
    assert.equal(league.minimumRating, definition.minimumRating);
    assert.deepEqual(league.hours, definition.hours);
    assert.equal(league.requiresMasterCup, league.league === "ruler");
    assert.equal(league.weeklyQualification, league.league === "crown");
  }
});

test("lobby prize tables follow the current league's domain rewards without inventing a qualifier card", async () => {
  for (const [arenaRating, expectedLeague] of [[1400, "conqueror"], [2600, "champion"], [3300, "master"]] as const) {
    const view = await new TournamentService(database([{ duel_rating: 2000, arena_rating: arenaRating }])).getLobby("viewer");
    assert.equal(view.league, expectedLeague);
    assert.equal(view.registrationAvailable, false);
    assert.deepEqual(view.prizes.map(row => row.label), ["1 місце", "2 місце", "3 місце", "4 місце", "1/4", "1/8", "1/16", "1/32", "1/64 і раніше", "Відбір"]);
    for (const placement of [1, 2, 3, 4] as const) {
      assert.deepEqual(view.prizes[placement - 1]!.prize, getTournamentPrize(expectedLeague, { placement }));
    }
    for (const [index, eliminatedWith] of [8, 16, 32, 64, 128].entries()) {
      assert.deepEqual(view.prizes[index + 4]!.prize, getTournamentPrize(expectedLeague, { eliminatedWith }));
    }
    assert.deepEqual(view.prizes[9]!.prize, getTournamentPrize(expectedLeague, { qualifier: true }));
    assert.equal(view.prizes[9]!.prize.reward, null);
    assert.equal(view.prizes[9]!.prize.badge, null);
    assert.equal(view.prizes[0]!.prize.reward!.kind, expectedLeague === "conqueror" ? "card" : "source");
    assert.equal(view.prizes[9]!.prize.diamonds, expectedLeague === "master" ? 1 : 0);
  }
});

test("missing players, invalid stored ratings and database failure return availability errors", async () => {
  await assert.rejects(new TournamentService(database([])).getLobby("viewer"), PlayerPersistenceError);
  await assert.rejects(new TournamentService(database([{ duel_rating: NaN, arena_rating: 1400 }])).getLobby("viewer"), PlayerPersistenceError);
  const service = new TournamentService({ query: async () => { throw new Error("offline"); } } as unknown as Pool);
  await assert.rejects(service.getLobby("viewer"), PlayerPersistenceError);
});

function captureResponse() {
  let status = 0;
  let body: unknown;
  const response = {
    writeHead(code: number) { status = code; return response; },
    end(data?: string) { body = data ? JSON.parse(data) : undefined; return response; },
  } as unknown as ServerResponse;
  return { response, read: () => ({ status, body }) };
}
const player: PlayerSummary = { id: "viewer", firstName: "Tournament test", username: null, photoUrl: null, level: 1, silver: 0, gold: 0 };
function dependencies() {
  return {
    botToken: "tournament-test-token",
    auth: { authenticateRequest: async () => ({ player, provider: "guest" as const }) },
    players: { findOrCreateFromTelegram: async () => { throw new Error("Legacy auth must not run"); } },
    tournaments: new TournamentService(database([{ duel_rating: 2000, arena_rating: 1400 }])),
  };
}

test("tournament endpoint reads only the authenticated viewer even if a different ID is supplied", async () => {
  const capture = captureResponse();
  await handleTournamentRequest({ method: "GET", headers: {}, url: "/api/tournament?playerId=someone-else" } as IncomingMessage, capture.response, dependencies());
  assert.equal(capture.read().status, 200);
  assert.equal((capture.read().body as { rating: number }).rating, 2000);
});

test("tournament endpoint rejects writes before authenticating or touching storage", async () => {
  const capture = captureResponse();
  const deps = dependencies();
  deps.auth.authenticateRequest = async () => { throw new Error("Writes must not authenticate"); };
  await handleTournamentRequest({ method: "POST", headers: {} } as IncomingMessage, capture.response, deps);
  assert.equal(capture.read().status, 405);
});

test("tournament endpoint requires authentication and reports storage outages", async () => {
  const capture = captureResponse();
  const { auth: _auth, ...deps } = dependencies();
  await handleTournamentRequest({ method: "GET", headers: {} } as IncomingMessage, capture.response, deps);
  assert.equal(capture.read().status, 401);
  const unavailable = { ...dependencies(), tournaments: { getLobby: async () => { throw new PlayerPersistenceError(); }, getRun: async () => null, enter: async () => { throw new PlayerPersistenceError(); }, action: async () => { throw new PlayerPersistenceError(); }, getChat: async () => ({ messages: [] }), sendChatMessage: async () => ({ id: "", author: "", body: "", createdAt: "" }) } };
  await handleTournamentRequest({ method: "GET", headers: {} } as IncomingMessage, capture.response, unavailable);
  assert.equal(capture.read().status, 503);
});

test("tournament chat reads and writes messages for the authenticated player", async () => {
  let posted: { playerId: string; body: string } | null = null;
  const deps = {
    ...dependencies(),
    tournaments: {
      getChat: async () => ({ messages: [{ id: "message-1", author: "Tournament test", body: "Hello", createdAt: "2026-11-03T09:00:00.000Z" }] }),
      sendChatMessage: async (playerId: string, body: string) => {
        posted = { playerId, body };
        return { id: "message-2", author: "Tournament test", body, createdAt: "2026-11-03T09:00:02.000Z" };
      },
    } as unknown as TournamentService,
  };
  const makeRequest = (method: string, url: string, body?: unknown) => ({
    method, url, headers: {},
    async *[Symbol.asyncIterator]() { if (body !== undefined) yield Buffer.from(JSON.stringify(body)); },
  }) as unknown as IncomingMessage;

  const read = captureResponse();
  await handleTournamentRequest(makeRequest("GET", "/api/tournament/chat"), read.response, deps);
  assert.equal(read.read().status, 200);
  assert.deepEqual((read.read().body as { messages: unknown[] }).messages, [
    { id: "message-1", author: "Tournament test", body: "Hello", createdAt: "2026-11-03T09:00:00.000Z" },
  ]);

  const sent = captureResponse();
  await handleTournamentRequest(makeRequest("POST", "/api/tournament/chat", { body: "Hi there" }), sent.response, deps);
  assert.equal(sent.read().status, 201);
  assert.deepEqual(posted, { playerId: "viewer", body: "Hi there" });
  assert.deepEqual(sent.read().body, { id: "message-2", author: "Tournament test", body: "Hi there", createdAt: "2026-11-03T09:00:02.000Z" });
});
