import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import test from "node:test";
import type { PlayerCardInstance, PlayerDeckResponse, PlayerSummary, StoredPlayerDeck } from "@cardastika/shared";
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
  const deck: StoredPlayerDeck = { cards: [], totalPower: 0, baseBattleHp: 0 };
  let requestedPlayerId: string | null = null;
  const request = {
    method: "GET",
    headers: { authorization: `tma ${createInitData(123456)}` },
  } as IncomingMessage;
  const capture = createResponseCapture();
  let recalculatedPlayerId: string | null = null;

  await handlePlayerDeck(request, capture.response, {
    botToken,
    automaticDeck: {
      recalculateForPlayer: async (playerId) => {
        recalculatedPlayerId = playerId;
      },
    },
    players: { findOrCreateFromTelegram: async () => player },
    decks: {
      findByPlayerId: async (playerId) => {
        requestedPlayerId = playerId;
        return deck;
      },
    },
  });

  assert.equal(requestedPlayerId, player.id);
  assert.equal(recalculatedPlayerId, player.id);
  const lockedExtraCards: PlayerDeckResponse["extraCards"] = { ally: { status: "locked" }, guild: { status: "locked" }, goblin: { status: "locked" } };
  assert.deepEqual(capture.read(), { status: 200, body: { ...deck, extraCards: lockedExtraCards } });
});

test("GET player deck adds the guild card of the authenticated player", async () => {
  const player: PlayerSummary = { id: "guild-member", firstName: "Deck route", username: null, photoUrl: null, level: 1, silver: 0, gold: 0 };
  const guildCard = { cardId: "card-1", instanceId: "guild-card:1", code: "card-1", displayName: "Guild card", finalPower: 40 } as unknown as PlayerCardInstance;
  let requestedPlayerId: string | null = null;
  const capture = createResponseCapture();

  await handlePlayerDeck({ method: "GET", headers: { authorization: `tma ${createInitData(123457)}` } } as IncomingMessage, capture.response, {
    botToken,
    automaticDeck: { recalculateForPlayer: async () => {} },
    players: { findOrCreateFromTelegram: async () => player },
    decks: { findByPlayerId: async () => ({ cards: [], totalPower: 0, baseBattleHp: 0 }) },
    guildCard: { findForMember: async (playerId) => { requestedPlayerId = playerId; return guildCard; } },
  });

  assert.equal(requestedPlayerId, player.id);
  const { body } = capture.read() as { body: PlayerDeckResponse };
  assert.deepEqual(body.extraCards, { ally: { status: "locked" }, guild: { status: "card", card: guildCard }, goblin: { status: "locked" } });
});

test("GET player deck still loads when the guild card lookup throws", async () => {
  const player: PlayerSummary = { id: "guild-fail", firstName: "Deck route", username: null, photoUrl: null, level: 1, silver: 0, gold: 0 };
  const capture = createResponseCapture();
  const originalError = console.error;
  console.error = () => {};
  try {
    await handlePlayerDeck({ method: "GET", headers: { authorization: `tma ${createInitData(123457)}` } } as IncomingMessage, capture.response, {
      botToken,
      automaticDeck: { recalculateForPlayer: async () => {} },
      players: { findOrCreateFromTelegram: async () => player },
      decks: { findByPlayerId: async () => ({ cards: [], totalPower: 0, baseBattleHp: 0 }) },
      guildCard: { findForMember: async () => { throw new Error("guild lookup down"); } },
    });
  } finally {
    console.error = originalError;
  }
  const { status, body } = capture.read() as { status: number; body: PlayerDeckResponse };
  assert.equal(status, 200);
  assert.deepEqual(body.extraCards, { ally: { status: "locked" }, guild: { status: "locked" }, goblin: { status: "locked" } });
});

test("PUT player deck is retired", async () => {
  const request = { method: "PUT", headers: {} } as IncomingMessage;
  const capture = createResponseCapture();
  let playerLookupCalled = false;

  await handlePlayerDeck(request, capture.response, {
    botToken,
    automaticDeck: { recalculateForPlayer: async () => undefined },
    players: {
      findOrCreateFromTelegram: async () => {
        playerLookupCalled = true;
        throw new Error("Player lookup must not run for retired methods");
      },
    },
    decks: {
      findByPlayerId: async () => ({ cards: [], totalPower: 0, baseBattleHp: 0 }),
    },
  });

  assert.equal(playerLookupCalled, false);
  assert.deepEqual(capture.read(), {
    status: 405,
    body: { error: { code: "method_not_allowed", message: "Method not allowed" } },
  });
});
