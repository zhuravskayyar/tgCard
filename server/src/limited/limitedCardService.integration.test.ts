import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import { LIMITED_CARD_EVENT_ID, LIMITED_CARD_PROMO_CODE, NECRAT_CARD_EVENT_ID, NECRAT_CARD_PROMO_CODE } from "./limitedCardConfig.js";
import { CollectionRepository } from "../collections/collectionRepository.js";
import { LimitedCardEventUnavailableError, LimitedCardService } from "./limitedCardService.js";
import { PlayerRepository } from "../users/playerRepository.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
for (const [index, [eventId, promoCode]] of [
  [LIMITED_CARD_EVENT_ID, LIMITED_CARD_PROMO_CODE],
  [NECRAT_CARD_EVENT_ID, NECRAT_CARD_PROMO_CODE],
].entries()) {
  test(`retired limited event ${eventId} is hidden and cannot grant cards`, { skip: !databaseUrl }, async () => {
    if (!databaseUrl) return;
    const pool = new Pool({ connectionString: databaseUrl });
    const player = await new PlayerRepository(pool).findOrCreateFromTelegram({
      id: String(BigInt(Date.now()) * 1_000_000n + BigInt(process.pid) * 100n + BigInt(index)),
      username: null, firstName: "Retired limited event test", lastName: null, photoUrl: null,
    });
    try {
      const service = new LimitedCardService(pool);
      assert.equal(await service.getActiveEvent(player.id), null);
      await assert.rejects(service.redeem(player.id, eventId!, promoCode!), LimitedCardEventUnavailableError);
      assert.deepEqual((await new CollectionRepository(pool).list(player.id)).limitedCards, []);
      assert.equal((await pool.query("SELECT COUNT(*) AS count FROM player_card_instances WHERE player_id = $1", [player.id])).rows[0]?.count, "9");
    } finally {
      await pool.query("DELETE FROM players WHERE id = $1", [player.id]);
      await pool.end();
    }
  });
}
