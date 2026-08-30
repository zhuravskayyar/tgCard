import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import type { ValidatedTelegramUser } from "../auth/telegramInitData.js";
import { PlayerRepository } from "../users/playerRepository.js";
import {
  NicknameSkinAlreadyOwnedError,
  NicknameSkinService,
} from "./nicknameSkinService.js";

const databaseUrl = process.env.DATABASE_URL?.trim();

function telegramUser(): ValidatedTelegramUser {
  return {
    id: String(BigInt(Date.now()) * 1_000_000n + BigInt(process.pid)),
    username: `nickname_skin_test_${process.pid}`,
    firstName: "Nickname skin test",
    lastName: null,
    photoUrl: null,
  };
}

test("nickname skin pack purchases are choice-based, persistent, and equippable", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const skins = new NicknameSkinService(pool);
  const user = telegramUser();
  let playerId: string | undefined;

  try {
    const player = await players.findOrCreateFromTelegram(user);
    playerId = player.id;
    await pool.query("UPDATE players SET arena_tokens = 500 WHERE id = $1", [player.id]);

    const initial = await skins.getCatalog(player.id);
    assert.equal(initial.offer.price, 250);
    assert.deepEqual(initial.offer.ownedSkinIds, []);
    assert.equal(initial.offer.progress.owned, 0);

    const first = await skins.purchase(player.id, "blood_moon");
    assert.equal(first.acquiredSkin, "blood_moon");
    assert.equal(first.updatedBalance.arenaTokens, 250);
    assert.deepEqual(first.inventory.cosmetics.map(({ id }) => id), ["blood_moon"]);
    assert.equal(first.inventory.equippedNicknameSkin, "blood_moon");
    assert.equal(first.offer.progress.owned, 1);
    assert.rejects(() => skins.purchase(player.id!, "blood_moon"), NicknameSkinAlreadyOwnedError);

    await skins.equip(player.id, null);
    await pool.query("UPDATE players SET arena_tokens = 500 WHERE id = $1", [player.id]);
    const second = await skins.purchase(player.id, "starforged");
    assert.equal(second.offer.progress.owned, 2);
    assert.equal(second.inventory.equippedNicknameSkin, "starforged");

    const equipped = await skins.equip(player.id, "blood_moon");
    assert.equal(equipped.inventory.equippedNicknameSkin, "blood_moon");
    assert.equal((await players.findSummaryById(player.id)).equippedNicknameSkin, "blood_moon");
  } finally {
    if (playerId) await pool.query("DELETE FROM players WHERE id = $1", [playerId]);
    await pool.end();
  }
});
