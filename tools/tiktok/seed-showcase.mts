// Local-only showcase account for TikTok capture: all cards at varied levels on dev_regular.
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { recalculateAutomaticDeckForPlayer } from "../../server/src/decks/automaticDeckService.ts";

if (process.env.NODE_ENV === "production") throw new Error("Local only");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const playerId = "00000000-0000-4000-8000-000000000001";
try {
  const inserted = await pool.query(
    `INSERT INTO player_card_instances (id, player_id, card_id, level, bonus_power)
     SELECT md5('cardastika:tiktok-showcase:' || $1::text || ':' || cards.id)::uuid, $1::uuid, cards.id,
            1 + (abs(hashtext(cards.id::text)) % 75), 3
     FROM cards
     WHERE NOT EXISTS (SELECT 1 FROM player_card_instances e WHERE e.player_id = $1::uuid AND e.card_id = cards.id)
     ON CONFLICT (id) DO NOTHING`, [playerId]);
  await pool.query(`INSERT INTO player_card_discoveries (player_id, card_id) SELECT $1::uuid, id FROM cards ON CONFLICT DO NOTHING`, [playerId]);
  await pool.query(`INSERT INTO player_collection_completions (player_id, collection_id) SELECT $1::uuid, collection_id FROM cards WHERE collection_id IS NOT NULL GROUP BY collection_id ON CONFLICT DO NOTHING`, [playerId]);
  // Painted cards lead the deck; unpainted ones stay weak so no empty art slot reaches the video.
  const painted = readFileSync(new URL("../../client/public/card-art/card-art-map.txt", import.meta.url), "utf8")
    .split(/\r?\n/).filter((line) => line.trim() && !line.startsWith("#")).map((line) => line.split("|")[0].trim());
  await pool.query(
    `UPDATE player_card_instances SET level = CASE WHEN card_id::text = ANY($2::text[]) THEN 35 + (abs(hashtext(card_id::text)) % 41) ELSE 1 + (abs(hashtext(card_id::text)) % 25) END
     WHERE player_id = $1::uuid AND id = md5('cardastika:tiktok-showcase:' || $1::text || ':' || card_id)::uuid`, [playerId, painted]);
  await pool.query(
    `UPDATE players SET silver = GREATEST(silver, 24750), gold = GREATEST(gold, 2000), level = 42, account_xp = 0,
       nickname = 'Arkanis', first_name = 'Arkanis', photo_url = '/card-art/air_mage.webp' WHERE id = $1`, [playerId]);
  const deck = await recalculateAutomaticDeckForPlayer(pool, playerId);
  console.log(JSON.stringify({ inserted: inserted.rowCount, deck }));
} finally {
  await pool.end();
}
