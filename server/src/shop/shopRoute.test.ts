import assert from "node:assert/strict";
import test from "node:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { PlayerSummary, ShopCardInfoResponse } from "@cardastika/shared";
import { CollectionCardMissingError, CollectionPersistenceError } from "../collections/collectionRepository.js";
import { handleShopCardInfo, isShopBundlePurchaseRequest, isShopPurchaseRequest } from "./shopRoute.js";

test("purchase input accepts only the canonical offer id", () => {
  assert.equal(isShopPurchaseRequest({ offerId: "card_uncommon" }), true);
  assert.equal(isShopPurchaseRequest({ offerId: "card_uncommon", price: 1 }), false);
  assert.equal(isShopPurchaseRequest({ offerId: "card_uncommon", rarity: "mythic" }), false);
  assert.equal(isShopPurchaseRequest({ offerId: " " }), false);
  assert.equal(isShopPurchaseRequest(null), false);
});

test("bundle purchase input accepts only the canonical bundle id", () => {
  assert.equal(isShopBundlePurchaseRequest({ bundleId: "elemental-spirits" }), true);
  assert.equal(isShopBundlePurchaseRequest({ bundleId: "elemental-spirits", price: 1 }), false);
  assert.equal(isShopBundlePurchaseRequest({ offerId: "elemental-spirits" }), false);
  assert.equal(isShopBundlePurchaseRequest({ bundleId: " " }), false);
  assert.equal(isShopBundlePurchaseRequest(null), false);
});

function captureResponse() {
  let status = 0;
  let body: unknown;
  const response = {
    writeHead(nextStatus: number) { status = nextStatus; return response; },
    end(chunk?: string) { body = chunk ? JSON.parse(chunk) : undefined; return response; },
  } as unknown as ServerResponse;
  return { response, read: () => ({ status, body }) };
}

const preview: ShopCardInfoResponse = {
  card: {
    id: "shop-card", code: "shop_card", displayName: "Shop card", description: "Card description",
    artKey: null, collectionId: null, element: "fire", minRarity: "rare", discovered: false,
    ownedCopies: 0, strongestInstanceId: null,
  },
  collections: [],
};
const player: PlayerSummary = {
  id: "authenticated-player", username: null, firstName: "Shop", photoUrl: null, level: 1, silver: 0, gold: 0,
};

function cardInfoDependencies(previewCard: (playerId: string, cardId: string) => Promise<ShopCardInfoResponse>) {
  return {
    botToken: "shop-test-token",
    auth: { authenticateRequest: async () => ({ player, provider: "guest" as const }) },
    players: { findOrCreateFromTelegram: async () => { throw new Error("Legacy auth must not run"); } },
    collections: { previewCard },
  };
}

test("shop card preview uses the authenticated player and returns undiscovered cards", async () => {
  const capture = captureResponse();
  await handleShopCardInfo({ method: "GET", headers: {} } as IncomingMessage, capture.response,
    cardInfoDependencies(async (playerId, cardId) => {
      assert.equal(playerId, player.id);
      assert.equal(cardId, preview.card.id);
      return preview;
    }), preview.card.id);
  assert.deepEqual(capture.read(), { status: 200, body: preview });
});

test("shop card preview rejects writes before accessing player data", async () => {
  const capture = captureResponse();
  await handleShopCardInfo({ method: "POST", headers: {} } as IncomingMessage, capture.response,
    cardInfoDependencies(async () => { throw new Error("Preview must not run"); }), preview.card.id);
  assert.equal(capture.read().status, 405);
});

test("shop card preview requires authentication", async () => {
  const capture = captureResponse();
  const { auth: _auth, ...dependencies } = cardInfoDependencies(async () => { throw new Error("Preview must not run"); });
  await handleShopCardInfo({ method: "GET", headers: {} } as IncomingMessage, capture.response, dependencies, preview.card.id);
  assert.equal(capture.read().status, 401);
});

test("shop card preview distinguishes a missing card from unavailable storage", async () => {
  for (const [error, status, code] of [
    [new CollectionCardMissingError(), 404, "card_not_found"],
    [new CollectionPersistenceError(), 503, "database_unavailable"],
  ] as const) {
    const capture = captureResponse();
    await handleShopCardInfo({ method: "GET", headers: {} } as IncomingMessage, capture.response,
      cardInfoDependencies(async () => { throw error; }), preview.card.id);
    assert.equal(capture.read().status, status);
    assert.equal((capture.read().body as { error: { code: string } }).error.code, code);
  }
});
