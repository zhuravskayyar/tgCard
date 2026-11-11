import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import test from "node:test";
import type { PlayerAchievementProgressResponse, PlayerSummary, PublicPlayerProfile } from "@cardastika/shared";
import { PlayerSessionError } from "../auth/playerAuth.js";
import { handlePlayerAchievementProgress } from "./achievementProgressRoute.js";

const viewer: PlayerSummary = {
  id: "viewer",
  firstName: "Viewer",
  username: null,
  photoUrl: null,
  level: 1,
  silver: 0,
  gold: 0,
};

const target: PublicPlayerProfile = {
  id: "target",
  displayName: "Target",
  photoUrl: null,
  level: 1,
  deckPower: 0,
  duelRating: 0,
  duelWins: 4,
  mageElement: "fire",
  strongestCards: [],
};

function captureResponse() {
  let status = 0;
  let body: unknown;
  const response = {
    writeHead(value: number) { status = value; return response; },
    end(chunk?: string) { body = chunk ? JSON.parse(chunk) : undefined; return response; },
  } as unknown as ServerResponse;
  return { response, read: () => ({ status, body }) };
}

test("public achievement progress uses the requested player after authentication", async () => {
  const capture = captureResponse();
  const lookedUp: string[] = [];
  const requested: string[] = [];
  const progress = { statistics: { duelWins: 4 } } as PlayerAchievementProgressResponse;

  await handlePlayerAchievementProgress({ method: "GET", headers: {} } as IncomingMessage, capture.response, {
    botToken: "unused",
    auth: { authenticateRequest: async () => ({ player: viewer, provider: "telegram" }) },
    players: { findOrCreateFromTelegram: async () => viewer },
    profiles: { findPublicProfile: async (id) => { lookedUp.push(id); return id === target.id ? target : null; } },
    progress: { getPlayerProgress: async (id) => { requested.push(id); return progress; } },
  }, target.id);

  assert.deepEqual(lookedUp, [target.id]);
  assert.deepEqual(requested, [target.id]);
  assert.deepEqual(capture.read(), { status: 200, body: progress });
});

test("public achievement progress rejects unknown players before reading statistics", async () => {
  const capture = captureResponse();
  let progressRead = false;

  await handlePlayerAchievementProgress({ method: "GET", headers: {} } as IncomingMessage, capture.response, {
    botToken: "unused",
    auth: { authenticateRequest: async () => ({ player: viewer, provider: "telegram" }) },
    players: { findOrCreateFromTelegram: async () => viewer },
    profiles: { findPublicProfile: async () => null },
    progress: { getPlayerProgress: async () => { progressRead = true; throw new Error("should not read"); } },
  }, "missing");

  assert.equal(progressRead, false);
  assert.deepEqual(capture.read(), { status: 404, body: { error: { code: "player_not_found", message: "Player profile was not found" } } });
});

test("public achievement progress requires authentication before looking up another player", async () => {
  const capture = captureResponse();
  let profileRead = false;

  await handlePlayerAchievementProgress({ method: "GET", headers: {} } as IncomingMessage, capture.response, {
    botToken: "unused",
    auth: { authenticateRequest: async () => { throw new PlayerSessionError("missing_session"); } },
    players: { findOrCreateFromTelegram: async () => viewer },
    profiles: { findPublicProfile: async () => { profileRead = true; return target; } },
    progress: { getPlayerProgress: async () => { throw new Error("should not read"); } },
  }, target.id);

  assert.equal(profileRead, false);
  assert.deepEqual(capture.read(), { status: 401, body: { error: { code: "missing_session", message: "Player authentication failed" } } });
});
