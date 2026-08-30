import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import test from "node:test";
import type { PlayerCardInstance, PlayerSummary } from "@cardastika/shared";
import { handleWeakPlayerCards } from "./playerCardsRoute.js";

const botToken = "test-token";

function createInitData(userId: number) {
  const values = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: userId, first_name: "Weak route" }),
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

test("weak cards endpoint uses the authenticated player and returns derived instances", async () => {
  const player: PlayerSummary = {
    id: "authenticated-player",
    firstName: "Weak route",
    username: null,
    photoUrl: null,
    level: 1,
    silver: 1500,
    gold: 0,
  };
  const weakCard: PlayerCardInstance = {
    instanceId: "instance-weak",
    cardId: "starter_01",
    code: "starter_01",
    displayName: "Саламандра",
    artKey: null,
    element: "fire",
    level: 1,
    levelProgressElements: 0,
    protectedFromAbsorption: false,
    basePower: 10,
    bonusPower: 2,
    finalPower: 12,
    rarity: "common",
    storedElements: 0,
    collectionId: null,
  };
  let requestedPlayerId: string | null = null;
  const capture = createResponseCapture();

  await handleWeakPlayerCards({
    method: "GET",
    url: "/api/player/cards/weak?page=2&limit=9",
    headers: { authorization: `tma ${createInitData(123456)}` },
  } as IncomingMessage, capture.response, {
    botToken,
    players: { findOrCreateFromTelegram: async () => player },
    inventory: {
      findByPlayerId: async () => [],
      findWeakPageByPlayerId: async (playerId, page, pageSize) => {
        requestedPlayerId = playerId;
        assert.equal(page, 2);
        assert.equal(pageSize, 9);
        return { cards: [weakCard], totalCards: 17 };
      },
    },
  });

  assert.equal(requestedPlayerId, player.id);
  assert.deepEqual(capture.read(), {
    status: 200,
    body: { cards: [weakCard], page: 2, pageSize: 9, totalCards: 17, totalPages: 2 },
  });
});
