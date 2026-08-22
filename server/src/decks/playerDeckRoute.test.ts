import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import test from "node:test";
import type { PlayerDeckResponse, PlayerSummary } from "@cardastika/shared";
import { handlePlayerDeck } from "./playerDeckRoute.js";

const botToken = "test-token";

function createInitData(userId: number) {
  const values = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: userId, first_name: "Deck route" }),
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
    writeHead(nextStatus: number) {
      status = nextStatus;
      return response;
    },
    end(chunk?: string) {
      body = chunk ? JSON.parse(chunk) : undefined;
      return response;
    },
  } as unknown as ServerResponse;
  return { response, read: () => ({ status, body }) };
}

test("GET player deck uses only the authenticated player's id", async () => {
  const player: PlayerSummary = {
    id: "authenticated-player",
    firstName: "Deck route",
    username: null,
    photoUrl: null,
    level: 1,
    silver: 1500,
    gold: 0,
  };
  const deck: PlayerDeckResponse = { cards: [], totalPower: 0 };
  let requestedPlayerId: string | null = null;
  const request = {
    method: "GET",
    headers: { authorization: `tma ${createInitData(123456)}` },
  } as IncomingMessage;
  const capture = createResponseCapture();

  await handlePlayerDeck(request, capture.response, {
    botToken,
    players: { findOrCreateFromTelegram: async () => player },
    decks: {
      findByPlayerId: async (playerId) => {
        requestedPlayerId = playerId;
        return deck;
      },
      save: async () => deck,
    },
  });

  assert.equal(requestedPlayerId, player.id);
  assert.deepEqual(capture.read(), { status: 200, body: deck });
});
