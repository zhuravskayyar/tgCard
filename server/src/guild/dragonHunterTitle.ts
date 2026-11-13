import { DRAGON_HUNTER_TITLE_POWER_PCT, DRAGON_HUNTER_TITLE_VICTORIES } from "@cardastika/game-core";
import type { DuelCardSnapshot, DuelSideSnapshot } from "@cardastika/shared";
import type { PoolClient } from "pg";

/**
 * Title «Мисливець на драконів» (reference «Охотник на драконов»): 1000 dragons beaten in guild raids,
 * counted across every guild. It gives +10% to all cards in guild raids, which raises both card power and HP.
 */
export async function hasDragonHunterTitle(client: Pick<PoolClient, "query">, playerId: string) {
  const result = await client.query<{ victories: string }>(
    "SELECT COUNT(*) AS victories FROM player_campaign_events WHERE player_id = $1 AND event_type = 'DRAGON_RAID_WON'",
    [playerId],
  );
  return Number(result.rows[0]?.victories ?? 0) >= DRAGON_HUNTER_TITLE_VICTORIES;
}

/** Applies the title to a raid snapshot (and the guild card, when the raid uses it). */
export function applyDragonHunterTitle(snapshot: DuelSideSnapshot, guildCard?: DuelCardSnapshot | null) {
  const scale = (value: number) => Math.round(value * (100 + DRAGON_HUNTER_TITLE_POWER_PCT) / 100);
  snapshot.cards = snapshot.cards.map((card) => ({ ...card, finalPower: scale(card.finalPower) }));
  if (guildCard) guildCard.finalPower = scale(guildCard.finalPower);
  snapshot.startingHp = scale(snapshot.startingHp);
}
