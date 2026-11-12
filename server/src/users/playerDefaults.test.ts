import assert from "node:assert/strict";
import test from "node:test";
import { parsePlayerAvatarId, toPlayerAvatarId } from "@cardastika/shared";
import { NEW_PLAYER_DEFAULTS } from "./playerDefaults.js";

test("new Cardastika players receive the canonical account defaults", () => {
  assert.deepEqual(NEW_PLAYER_DEFAULTS, {
    level: 1,
    silver: 0,
    gold: 0,
  });
  assert.equal(Object.isFrozen(NEW_PLAYER_DEFAULTS), true);
});

test("only the game's own portraits are accepted as a chosen avatar", () => {
  assert.equal(parsePlayerAvatarId(toPlayerAvatarId(1)), 1);
  assert.equal(parsePlayerAvatarId("avatar:20"), 20);
  for (const value of ["avatar:00", "avatar:21", "avatar:7", "https://t.me/i/userpic/a.jpg", "/card-art/x.webp", null]) {
    assert.equal(parsePlayerAvatarId(value), null);
  }
});
