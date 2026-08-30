import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import type { ValidatedTelegramUser } from "../auth/telegramInitData.js";
import { LIMITED_CARD_EVENT_ID, LIMITED_CARD_PROMO_CODE } from "./limitedCardConfig.js";
import { LimitedCardAlreadyRedeemedError, LimitedCardService } from "./limitedCardService.js";
import { PlayerRepository } from "../users/playerRepository.js";

const databaseUrl = process.env.DATABASE_URL?.trim();

test("limited Carter card is active for 24h and redeemable once per player", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const telegramUser: ValidatedTelegramUser = {
    id: String(BigInt(Date.now()) * 10_000n + BigInt(process.pid)),
    username: null,
    firstName: "Limited Carter test",
    lastName: null,
    photoUrl: null,
  };
  const player = await new PlayerRepository(pool).findOrCreateFromTelegram(telegramUser);
  const service = new LimitedCardService(
    pool,
    { nextInt: () => 0 },
    async () => ({ instanceIds: [], status: "unchanged" as const, totalPower: 108 }),
  );

  try {
    const event = await service.getActiveEvent(player.id);
    assert.ok(event);
    assert.equal(event.id, LIMITED_CARD_EVENT_ID);
    assert.equal(event.displayName, "Кролик Картер");
    assert.equal(event.limited, true);
    assert.ok(new Date(event.endsAt).getTime() > Date.now());

    const reward = await service.redeem(player.id, event.id, LIMITED_CARD_PROMO_CODE);
    assert.equal(reward.message, "Лімітовану карту отримано");
    assert.equal(reward.reward.displayName, "Кролик Картер");
    assert.equal(reward.reward.limited, true);
    assert.equal(reward.reward.level, 35);

    await assert.rejects(
      service.redeem(player.id, event.id, LIMITED_CARD_PROMO_CODE),
      (error) => error instanceof LimitedCardAlreadyRedeemedError,
    );
    const count = await pool.query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM player_card_instances WHERE player_id = $1 AND card_id = 'limited_rabbit_carter'",
      [player.id],
    );
    assert.equal(count.rows[0]?.count, "1");
  } finally {
    await pool.query("DELETE FROM players WHERE id = $1", [player.id]);
    await pool.end();
  }
});
