import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import test from "node:test";
import type { PlayerSummary } from "@cardastika/shared";
import type { PlayerAuthService } from "../auth/playerAuth.js";
import type { PlayerRepository } from "../users/playerRepository.js";
import { AdminAccessDeniedError, AdminAuthService } from "./adminAuth.js";

const player: PlayerSummary = {
  id: "00000000-0000-4000-8000-000000000001",
  firstName: "Admin",
  username: "cardastika_admin",
  nickname: null,
  photoUrl: null,
  level: 1,
  silver: 1500,
  gold: 0,
};

function createService(telegramUserId: string, allowed: readonly string[]) {
  const auth = {
    authenticateRequest: async () => ({ player, provider: "telegram" as const }),
  } as Pick<PlayerAuthService, "authenticateRequest">;
  const pool = {
    query: async () => ({ rows: [{ provider_user_id: telegramUserId }] }),
  };
  return new AdminAuthService(auth, {} as PlayerRepository, pool as never, allowed);
}

test("allows an authenticated player whose linked Telegram ID is whitelisted", async () => {
  const admin = await createService("12345678", ["12345678"]).requireAdmin({} as IncomingMessage);
  assert.deepEqual(admin, {
    displayName: "cardastika_admin",
    playerId: player.id,
    telegramUserId: "12345678",
  });
});

test("rejects a normal authenticated player", async () => {
  await assert.rejects(
    createService("87654321", ["12345678"]).requireAdmin({} as IncomingMessage),
    (error) => error instanceof AdminAccessDeniedError,
  );
});

test("keeps admin routes closed when the whitelist is empty", async () => {
  await assert.rejects(
    createService("12345678", []).requireAdmin({} as IncomingMessage),
    (error) => error instanceof AdminAccessDeniedError,
  );
});
