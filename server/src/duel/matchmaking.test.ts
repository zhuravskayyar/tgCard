import assert from "node:assert/strict";
import test from "node:test";
import { getMatchmakingRange } from "@cardastika/game-core";
import { selectMatchmakingCandidate } from "./matchmaking.js";

test("matchmaking excludes self, invalid decks, and players outside the exact range", () => {
  const selected = selectMatchmakingCandidate("self", getMatchmakingRange(1_000, 0), [
    { playerId: "self", effectiveDeckPower: 1_000, validDeck: true },
    { playerId: "invalid", effectiveDeckPower: 1_000, validDeck: false },
    { playerId: "low", effectiveDeckPower: 899, validDeck: true },
    { playerId: "high", effectiveDeckPower: 1_101, validDeck: true },
    { playerId: "eligible", effectiveDeckPower: 1_050, validDeck: true },
  ], () => 0);
  assert.equal(selected?.playerId, "eligible");
});

test("matchmaking returns no opponent and never creates a fake fallback", () => {
  const selected = selectMatchmakingCandidate("self", getMatchmakingRange(1_000, 5), [
    { playerId: "self", effectiveDeckPower: 1_000, validDeck: true },
    { playerId: "outside", effectiveDeckPower: 1_151, validDeck: true },
  ], () => 0);
  assert.equal(selected, null);
});
