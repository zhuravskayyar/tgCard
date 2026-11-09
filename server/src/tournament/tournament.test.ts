import assert from "node:assert/strict";
import test from "node:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "pg";
import type { PlayerSummary } from "@cardastika/shared";
import { PlayerPersistenceError } from "../users/playerRepository.js";
import { TournamentActionError, TournamentService } from "./tournamentService.js";
import { handleTournamentRequest } from "./tournamentRoute.js";

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
const calls: { method: string; args: unknown[] }[] = [];

function fakeService(overrides: Partial<Record<string, (...args: unknown[]) => Promise<unknown>>> = {}) {
  const record = (method: string, value: unknown) => async (...args: unknown[]) => { calls.push({ method, args }); return value; };
  return {
    getLobby: record("getLobby", { rating: 2000 }),
    getRun: record("getRun", null),
    getAwards: record("getAwards", { played: 0 }),
    register: record("register", { event: { registered: true } }),
    unregister: record("unregister", { event: { registered: false } }),
    scheduleDevEvent: record("scheduleDevEvent", { event: { registered: true } }),
    action: record("action", { status: "battle" }),
    getChat: record("getChat", { messages: [] }),
    sendChatMessage: record("sendChatMessage", { id: "m", author: "a", body: "b", createdAt: "" }),
    ...overrides,
  } as unknown as TournamentService;
}

function dependencies(tournaments = fakeService()) {
  return {
    botToken: "tournament-test-token",
    auth: { authenticateRequest: async () => ({ player, provider: "guest" as const }) },
    players: { findOrCreateFromTelegram: async () => { throw new Error("Legacy auth must not run"); } },
    tournaments,
  };
}

function request(method: string, url: string, body?: unknown) {
  return {
    method, url, headers: {},
    async *[Symbol.asyncIterator]() { if (body !== undefined) yield Buffer.from(JSON.stringify(body)); },
  } as unknown as IncomingMessage;
}

test("tournament endpoints act only for the authenticated viewer", async () => {
  calls.length = 0;
  for (const [method, url, name] of [
    ["GET", "/api/tournament?playerId=someone-else", "getLobby"],
    ["GET", "/api/tournament/run", "getRun"],
    ["GET", "/api/tournament/awards", "getAwards"],
    ["POST", "/api/tournament/register", "register"],
    ["POST", "/api/tournament/unregister", "unregister"],
    ["POST", "/api/tournament/dev/schedule", "scheduleDevEvent"],
  ] as const) {
    const capture = captureResponse();
    await handleTournamentRequest(request(method, url, method === "POST" ? {} : undefined), capture.response, dependencies());
    assert.equal(capture.read().status, 200, url);
    assert.equal(calls.at(-1)!.method, name);
    assert.equal(calls.at(-1)!.args[0], "viewer");
  }
});

test("battle actions are validated before reaching the service", async () => {
  calls.length = 0;
  for (const body of [
    { type: "attack", matchId: "m", slotIndex: 3 },
    { type: "attack", matchId: "m", slotIndex: "1" },
    { type: "buff", matchId: "m", element: "light" },
    { type: "unknown", matchId: "m" },
    { type: "change" },
  ]) {
    const capture = captureResponse();
    await handleTournamentRequest(request("POST", "/api/tournament/run/action", body), capture.response, dependencies());
    assert.equal(capture.read().status, 400, JSON.stringify(body));
  }
  assert.equal(calls.length, 0);
  for (const body of [
    { type: "attack", matchId: "m", slotIndex: 2 },
    { type: "buff", matchId: "m", element: "water" },
    { type: "change", matchId: "m" },
  ]) {
    const capture = captureResponse();
    await handleTournamentRequest(request("POST", "/api/tournament/run/action", body), capture.response, dependencies());
    assert.equal(capture.read().status, 200);
    assert.deepEqual(calls.at(-1)!.args, ["viewer", body]);
  }
});

test("unknown routes, missing auth, rule violations and outages map to clear statuses", async () => {
  const unknown = captureResponse();
  const deps = dependencies();
  deps.auth.authenticateRequest = async () => { throw new Error("Unknown routes must not authenticate"); };
  await handleTournamentRequest(request("POST", "/api/tournament/enter", {}), unknown.response, deps);
  assert.equal(unknown.read().status, 405);

  const anonymous = captureResponse();
  const { auth: _auth, ...withoutAuth } = dependencies();
  await handleTournamentRequest(request("GET", "/api/tournament"), anonymous.response, withoutAuth);
  assert.equal(anonymous.read().status, 401);

  const rejected = captureResponse();
  await handleTournamentRequest(request("POST", "/api/tournament/register", {}), rejected.response, dependencies(fakeService({ register: async () => { throw new TournamentActionError("closed"); } })));
  assert.equal(rejected.read().status, 409);

  const offline = captureResponse();
  await handleTournamentRequest(request("GET", "/api/tournament"), offline.response, dependencies(fakeService({ getLobby: async () => { throw new PlayerPersistenceError(); } })));
  assert.equal(offline.read().status, 503);
});

test("tournament chat reads and writes messages for the authenticated player", async () => {
  calls.length = 0;
  const sent = captureResponse();
  await handleTournamentRequest(request("POST", "/api/tournament/chat", { body: "Hi there" }), sent.response, dependencies());
  assert.equal(sent.read().status, 201);
  assert.deepEqual(calls.at(-1)!.args, ["viewer", "Hi there"]);
  const invalid = captureResponse();
  await handleTournamentRequest(request("POST", "/api/tournament/chat", { body: 1 }), invalid.response, dependencies());
  assert.equal(invalid.read().status, 400);
});

test("an unavailable database surfaces as a persistence error", async () => {
  const service = new TournamentService({ query: async () => { throw new Error("offline"); }, connect: async () => { throw new Error("offline"); } } as unknown as Pool);
  await assert.rejects(service.getLobby("viewer"), PlayerPersistenceError);
  await assert.rejects(service.register("viewer"), PlayerPersistenceError);
});
