import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import test from "node:test";
import type { PlayerSummary } from "@cardastika/shared";
import { handlePlayerTutorialCompletion } from "./playerTutorialRoute.js";

const botToken = "test-token";

function createInitData(userId: number) {
  const values = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: userId, first_name: "Tutorial route" }),
  });
  const dataCheckString = [...values.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  values.set("hash", createHmac("sha256", secret).update(dataCheckString).digest("hex"));
  return values.toString();
}

function createResponseCapture() {
  let status = 0;
  let body: unknown;
  const response = {
    writeHead(nextStatus: number) { status = nextStatus; return response; },
    end(chunk?: string) { body = chunk ? JSON.parse(chunk) : undefined; return response; },
  } as unknown as ServerResponse;
  return { response, read: () => ({ status, body }) };
}

test("tutorial completion disables eligibility for the authenticated player", async () => {
  const player: PlayerSummary = {
    id: "authenticated-player",
    firstName: "Tutorial route",
    username: null,
    photoUrl: null,
    level: 1,
    silver: 1500,
    gold: 0,
    tutorialEligible: false,
  };
  let completedPlayerId: string | null = null;
  const capture = createResponseCapture();

  await handlePlayerTutorialCompletion({
    method: "POST",
    headers: { authorization: `tma ${createInitData(123456)}` },
  } as IncomingMessage, capture.response, {
    botToken,
    players: {
      findOrCreateFromTelegram: async () => ({ ...player, tutorialEligible: true }),
      completeTutorial: async (playerId) => {
        completedPlayerId = playerId;
        return player;
      },
    },
  });

  assert.equal(completedPlayerId, player.id);
  assert.deepEqual(capture.read(), { status: 200, body: { player } });
});

test("tutorial completion rejects non-POST methods without authenticating", async () => {
  const capture = createResponseCapture();
  let authenticated = false;

  await handlePlayerTutorialCompletion({ method: "GET", headers: {} } as IncomingMessage, capture.response, {
    botToken,
    players: {
      findOrCreateFromTelegram: async () => {
        authenticated = true;
        return {} as PlayerSummary;
      },
      completeTutorial: async () => ({} as PlayerSummary),
    },
  });

  assert.equal(authenticated, false);
  assert.deepEqual(capture.read(), {
    status: 405,
    body: { error: { code: "method_not_allowed", message: "Method not allowed" } },
  });
});
