import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import type { ValidatedTelegramUser } from "../auth/telegramInitData.js";
import {
  LIMITED_CARD_EVENT_ID,
  LIMITED_CARD_PROMO_CODE,
  NECRAT_CARD_EVENT_ID,
  NECRAT_CARD_PROMO_CODE,
} from "./limitedCardConfig.js";
import { CollectionRepository } from "../collections/collectionRepository.js";
import { LimitedCardAlreadyRedeemedError, LimitedCardService } from "./limitedCardService.js";
import { PlayerRepository } from "../users/playerRepository.js";

const databaseUrl = process.env.DATABASE_URL?.trim();

test("limited Carter card remains redeemable once per player", { skip: !databaseUrl }, async () => {
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
    const reward = await service.redeem(player.id, LIMITED_CARD_EVENT_ID, LIMITED_CARD_PROMO_CODE);
    assert.equal(reward.message, "Лімітовану карту отримано");
    assert.equal(reward.reward.displayName, "Кролик Картер");
    assert.equal(reward.reward.limited, true);
    assert.equal(reward.reward.level, 35);

    await assert.rejects(
      service.redeem(player.id, LIMITED_CARD_EVENT_ID, LIMITED_CARD_PROMO_CODE),
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

test("limited Necrat card is active, persistent, and redeemable once per player", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const playerRepository = new PlayerRepository(pool);
  const firstTelegramUser: ValidatedTelegramUser = {
    id: String(BigInt(Date.now()) * 10_000n + BigInt(process.pid) + 1n),
    username: null,
    firstName: "Limited Necrat test 1",
    lastName: null,
    photoUrl: null,
  };
  const secondTelegramUser: ValidatedTelegramUser = {
    ...firstTelegramUser,
    id: `${firstTelegramUser.id}2`,
    firstName: "Limited Necrat test 2",
  };
  const firstPlayer = await playerRepository.findOrCreateFromTelegram(firstTelegramUser);
  const secondPlayer = await playerRepository.findOrCreateFromTelegram(secondTelegramUser);
  const service = new LimitedCardService(
    pool,
    { nextInt: () => 0 },
    async () => ({ instanceIds: [], status: "unchanged" as const, totalPower: 108 }),
  );

  try {
    const event = await service.getActiveEvent(firstPlayer.id);
    assert.ok(event);
    assert.equal(event.id, NECRAT_CARD_EVENT_ID);
    assert.equal(event.displayName, "Некрат");
    assert.equal(event.element, "water");
    assert.equal(event.rarity, "legendary");
    assert.equal(event.limited, true);
    assert.ok(new Date(event.endsAt).getTime() > Date.now());

    const reward = await service.redeem(firstPlayer.id, event.id, NECRAT_CARD_PROMO_CODE.toUpperCase());
    assert.equal(reward.reward.cardId, "limited_necrat");
    assert.equal(reward.reward.code, "necrat");
    assert.equal(reward.reward.displayName, "Некрат");
    assert.equal(reward.reward.artKey, "necrat");
    assert.equal(reward.reward.element, "water");
    assert.equal(reward.reward.limited, true);

    const collectionState = await pool.query<{ instances: string; discoveries: string }>(
      `
        SELECT
          (SELECT COUNT(*) FROM player_card_instances WHERE player_id = $1 AND card_id = $2) AS instances,
          (SELECT COUNT(*) FROM player_card_discoveries WHERE player_id = $1 AND card_id = $2) AS discoveries
      `,
      [firstPlayer.id, "limited_necrat"],
    );
    assert.equal(collectionState.rows[0]?.instances, "1");
    assert.equal(collectionState.rows[0]?.discoveries, "1");

    const limitedCard = (await new CollectionRepository(pool).list(firstPlayer.id)).limitedCards?.find(
      (card) => card.id === "limited_necrat",
    );
    assert.deepEqual(limitedCard && {
      displayName: limitedCard.displayName,
      artKey: limitedCard.artKey,
      element: limitedCard.element,
      limited: limitedCard.limited,
      discovered: limitedCard.discovered,
      ownedCopies: limitedCard.ownedCopies,
    }, {
      displayName: "Некрат",
      artKey: "necrat",
      element: "water",
      limited: true,
      discovered: true,
      ownedCopies: 1,
    });
    assert.equal((await service.getActiveEvent(firstPlayer.id))?.redeemed, true);

    await assert.rejects(
      service.redeem(firstPlayer.id, event.id, NECRAT_CARD_PROMO_CODE),
      (error) => error instanceof LimitedCardAlreadyRedeemedError,
    );

    const secondReward = await service.redeem(secondPlayer.id, event.id, NECRAT_CARD_PROMO_CODE);
    assert.equal(secondReward.reward.cardId, "limited_necrat");

    const totalCards = await pool.query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM player_card_instances WHERE card_id = $1 AND player_id IN ($2, $3)",
      ["limited_necrat", firstPlayer.id, secondPlayer.id],
    );
    assert.equal(totalCards.rows[0]?.count, "2");
  } finally {
    await pool.query("DELETE FROM players WHERE id IN ($1, $2)", [firstPlayer.id, secondPlayer.id]);
    await pool.end();
  }
});
