import type { PoolClient } from "pg";
import { findActiveHolidayWindow, toHolidaySpan, type HolidaySpanRow } from "../shop/holidayCalendar.js";

type Queryable = Pick<PoolClient, "query">;

export const WINTER_REINFORCEMENT_COLLECTION_ID = "winter_reinforcement";
export const WINTER_FEAST_ID = "winter_feast";
const WINTER_CARD_POWER_MULTIPLIER = 1.2;

/** Uses the same enabled UTC window as the winter shop festival. */
export async function loadWinterFeastWindow(database: Queryable, now = new Date()) {
  const result = await database.query<HolidaySpanRow>(
    `SELECT start_month, start_day, end_month, end_day
     FROM shop_holidays WHERE id = $1 AND enabled`,
    [WINTER_FEAST_ID],
  );
  const holiday = result.rows[0];
  return holiday ? findActiveHolidayWindow(toHolidaySpan(holiday), now) : null;
}

export async function loadWinterFestivePlayers(database: Queryable, playerIds: readonly string[], now = new Date()) {
  if (!playerIds.length) return null;
  const result = await database.query<HolidaySpanRow & { player_ids: string[] }>(
    `SELECT start_month, start_day, end_month, end_day,
       ARRAY(SELECT player_id FROM player_collection_completions
         WHERE collection_id = $2 AND player_id = ANY($3::uuid[])) AS player_ids
     FROM shop_holidays WHERE id = $1 AND enabled`,
    [WINTER_FEAST_ID, WINTER_REINFORCEMENT_COLLECTION_ID, [...new Set(playerIds)]],
  );
  const holiday = result.rows[0];
  if (!holiday?.player_ids.length) return null;
  const window = findActiveHolidayWindow(toHolidaySpan(holiday), now);
  return window ? { endsAt: window.endsAt.toISOString(), playerIds: new Set(holiday.player_ids) } : null;
}

export interface WinterBattleBonus {
  cardIds: ReadonlySet<string>;
  playerIds: ReadonlySet<string>;
}

/** Load once for a fresh battle snapshot, using the battle clock. */
export async function loadWinterBattleBonus(
  database: Queryable,
  playerIds: readonly string[],
  now = new Date(),
): Promise<WinterBattleBonus | null> {
  const festive = await loadWinterFestivePlayers(database, playerIds, now);
  if (!festive) return null;

  const result = await database.query<{ card_id: string }>(
    "SELECT card_id FROM collection_cards WHERE collection_id = $1",
    [WINTER_REINFORCEMENT_COLLECTION_ID],
  );
  return { cardIds: new Set(result.rows.map(({ card_id }) => card_id)), playerIds: festive.playerIds };
}

/** Copies the battle card so the player's stored card and deck power stay unchanged. */
export function applyWinterCardPower<T extends { cardId: string; finalPower: number }>(
  card: T,
  playerId: string,
  bonus: WinterBattleBonus | null,
): T {
  if (isWinterReinforcementCard(card.cardId, playerId, bonus)) {
    return { ...card, finalPower: Math.round(card.finalPower * WINTER_CARD_POWER_MULTIPLIER) };
  }
  return card;
}

/** The seasonal Winter Reinforcement card receives its own +20% and ignores equipment bonuses. */
export function isWinterReinforcementCard(cardId: string, playerId: string, bonus: WinterBattleBonus | null) {
  return Boolean(bonus?.playerIds.has(playerId) && bonus.cardIds.has(cardId));
}
