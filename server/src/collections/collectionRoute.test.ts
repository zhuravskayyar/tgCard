import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import test from "node:test";
import type { PlayerCollectionsResponse, PlayerSummary } from "@cardastika/shared";
import { handlePlayerCollections } from "./collectionRoute.js";

const botToken = "collection-route-token";

function createInitData() {
  const values = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: 812345, first_name: "Collections" }),
  });
  const dataCheckString = [...values.entries()].sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  values.set("hash", createHmac("sha256", secret).update(dataCheckString).digest("hex"));
  return values.toString();
}

function captureResponse() {
  let status = 0;
  let body: unknown;
  const response = {
    writeHead(nextStatus: number) { status = nextStatus; return response; },
    end(chunk?: string) { body = chunk ? JSON.parse(chunk) : undefined; return response; },
  } as unknown as ServerResponse;
  return { response, read: () => ({ status, body }) };
}

test("collection list uses permanent player data for the authenticated player", async () => {
  const request = { method: "GET", headers: { authorization: `tma ${createInitData()}` } } as IncomingMessage;
  const capture = captureResponse();
  const player: PlayerSummary = { id: "player-id", username: null, firstName: "Collections", photoUrl: null, level: 1, silver: 1500, gold: 0 };
  const result: PlayerCollectionsResponse = { collections: [] };
  let requestedPlayer = "";
  await handlePlayerCollections(request, capture.response, {
    botToken,
    players: { findOrCreateFromTelegram: async () => player },
    collections: {
      list: async (playerId) => { requestedPlayer = playerId; return result; },
      detail: async () => { throw new Error("not called"); },
      card: async () => { throw new Error("not called"); },
    },
  });
  assert.equal(requestedPlayer, player.id);
  assert.deepEqual(capture.read(), { status: 200, body: result });
});
