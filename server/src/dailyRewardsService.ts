import { randomInt } from "node:crypto";
import { applyAccountXp, STARTER_EQUIPMENT_DEFINITIONS } from "@cardastika/game-core";
import type {
  CardDefinition,
  CardRarity,
  LariskaDailyCalendarDay,
  LariskaDailyCardOption,
  LariskaDailyChoiceOption,
  LariskaDailyEquipmentOption,
  LariskaDailyGoldOption,
  LariskaDailyRewardGrant,
  LariskaDailyRewardPlayerState,
  LariskaDailyRewardSummary,
  LariskaDailyRewardView,
  LariskaStreakRewardView,
} from "@cardastika/shared";
import type { Pool, PoolClient } from "pg";
import { recordCardDiscovery } from "./collections/discoveryService.js";
import { ARENA_COSMETICS } from "./arena/arenaCatalog.js";
import {
  getLariskaDailyReward,
  getStreakReward,
  LARISKA_STREAK_REWARDS,
  type LariskaDailyRewardDefinition,
} from "./dailyRewardsConfig.js";
import { createStandardCardInstance, CryptoCardRandomSource } from "./cards/cardInstanceCreator.js";

type Database = Pick<Pool | PoolClient, "query">;

const RARITIES: readonly CardRarity[] = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];
const YESTERDAY_MS = 24 * 60 * 60 * 1_000;

interface DailyStateRow {
  current_streak: number;
  last_claim_date: string | null;
  streak_reward_7_claimed: boolean;
  streak_reward_14_claimed: boolean;
  streak_reward_30_claimed: boolean;
  total_claims: number;
}

interface CardDefinitionRow {
  art_key: string | null;
  code: string;
  collection_id: string | null;
  description: string;
  display_name: string | null;
  element: CardDefinition["element"];
  id: string;
  limited: boolean;
  min_rarity: CardRarity;
}

interface PlayerRewardRow {
  account_xp: number | string;
  arena_tokens: number | string;
  gold: number | string;
  level: number;
  silver: number | string;
}

interface StoredChoiceRow {
  options: unknown;
}

interface DailyRewardClaimResult {
  claimedCycle: number;
  claimedDay: number;
  grant: LariskaDailyRewardGrant;
  rewardPlayer: LariskaDailyRewardPlayerState;
  streakBonus?: LariskaDailyRewardGrant;
}

export class DailyRewardNotClaimableError extends Error {
  constructor() {
    super("Lariska daily reward is not claimable");
    this.name = "DailyRewardNotClaimableError";
  }
}

export class DailyRewardChoiceRequiredError extends Error {
  constructor() {
    super("A daily reward choice is required");
    this.name = "DailyRewardChoiceRequiredError";
  }
}

function toInteger(value: number | string, field: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${field}`);
  return parsed;
}

function dateKey(value: string | null | undefined) {
  if (!value) return null;
  return value.slice(0, 10);
}

function utcDate(now: Date) {
  return now.toISOString().slice(0, 10);
}

function previousUtcDate(now: Date) {
  return utcDate(new Date(now.getTime() - YESTERDAY_MS));
}

function cycleAndDay(totalClaims: number) {
  return {
    cycle: Math.floor(totalClaims / 7) + 1,
    day: totalClaims % 7 + 1,
  };
}

function rarityAtLeast(actual: CardRarity, minimum: CardRarity) {
  return RARITIES.indexOf(actual) >= RARITIES.indexOf(minimum);
}

function toCardDefinition(row: CardDefinitionRow): CardDefinition {
  return {
    artKey: row.art_key,
    code: row.code,
    collectionId: row.collection_id,
    description: row.description,
    displayName: row.display_name,
    element: row.element,
    id: row.id,
    limited: row.limited,
    minRarity: row.min_rarity,
    shopEligible: true,
  };
}

function toCardOption(row: CardDefinitionRow, rarity: CardRarity, level: number): LariskaDailyCardOption {
  return {
    artKey: row.art_key,
    cardId: row.id,
    code: row.code,
    displayName: row.display_name,
    element: row.element,
    kind: "card",
    level,
    rarity,
  };
}

function selectEquipment(rarity: CardRarity): LariskaDailyEquipmentOption {
  const candidates = STARTER_EQUIPMENT_DEFINITIONS.filter((definition) => (
    definition.isEnabled && rarityAtLeast(definition.rarity, rarity)
  ));
  const definition = candidates[randomInt(candidates.length)];
  if (!definition) throw new Error(`No Lariska equipment reward is configured for ${rarity}`);
  return {
    itemId: definition.id,
    kind: "equipment",
    name: definition.name,
    rarity: definition.rarity,
    slot: definition.slot,
  };
}

function parseChoiceOptions(value: unknown): LariskaDailyChoiceOption[] {
  if (!Array.isArray(value) || value.length !== 3) throw new Error("Stored Lariska choice options are invalid");
  return value as LariskaDailyChoiceOption[];
}

async function ensureState(database: Database, playerId: string) {
  await database.query(
    `INSERT INTO player_lariska_daily_state (player_id) VALUES ($1) ON CONFLICT (player_id) DO NOTHING`,
    [playerId],
  );
}

async function loadState(database: Database, playerId: string, lock = false) {
  const result = await database.query<DailyStateRow>(
    `SELECT total_claims, current_streak, last_claim_date::text AS last_claim_date, streak_reward_7_claimed,
       streak_reward_14_claimed, streak_reward_30_claimed
     FROM player_lariska_daily_state
     WHERE player_id = $1${lock ? " FOR UPDATE" : ""}`,
    [playerId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Lariska daily reward state is missing");
  return {
    currentStreak: toInteger(row.current_streak, "Lariska streak"),
    lastClaimDate: dateKey(row.last_claim_date),
    streakReward7Claimed: row.streak_reward_7_claimed,
    streakReward14Claimed: row.streak_reward_14_claimed,
    streakReward30Claimed: row.streak_reward_30_claimed,
    totalClaims: toInteger(row.total_claims, "Lariska total claims"),
  };
}

async function selectCardRows(database: Database, rarity: CardRarity, limit: number) {
  const result = await database.query<CardDefinitionRow>(
    `
      SELECT id, code, display_name, art_key, element, collection_id, description, limited, min_rarity
      FROM cards
      WHERE limited = FALSE
        AND source = 'standard'
        AND array_position(
          ARRAY['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic']::text[],
          min_rarity
        ) <= array_position(
          ARRAY['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic']::text[],
          $1::text
        )
      ORDER BY random()
      LIMIT $2
    `,
    [rarity, limit],
  );
  if (result.rows.length < limit) throw new Error(`Not enough canonical cards for Lariska ${rarity} reward`);
  return result.rows;
}

async function loadCard(database: Database, cardId: string) {
  const result = await database.query<CardDefinitionRow>(
    `SELECT id, code, display_name, art_key, element, collection_id, description, limited, min_rarity FROM cards WHERE id = $1 AND source = 'standard'`,
    [cardId],
  );
  const row = result.rows[0];
  if (!row || row.limited) throw new Error("Selected Lariska card is unavailable");
  return row;
}

async function ensureChoiceOptions(
  database: Database,
  playerId: string,
  cycle: number,
  day: number,
  definition: Extract<LariskaDailyRewardDefinition, { kind: "choice" }>,
) {
  const existing = await database.query<StoredChoiceRow>(
    "SELECT options FROM player_lariska_daily_options WHERE player_id = $1 AND cycle_number = $2 AND day = $3",
    [playerId, cycle, day],
  );
  if (existing.rows[0]) return parseChoiceOptions(existing.rows[0].options);

  let options: LariskaDailyChoiceOption[];
  if (definition.optionKind === "card") {
    options = (await selectCardRows(database, "rare", 3)).map((row) => toCardOption(row, "rare", 10));
  } else {
    const [card] = await selectCardRows(database, "legendary", 1);
    const equipment = selectEquipment("epic");
    const gold: LariskaDailyGoldOption = { amount: 30, kind: "gold", label: "30 золота" };
    options = [toCardOption(card!, "legendary", 35), equipment, gold];
  }

  await database.query(
    `INSERT INTO player_lariska_daily_options (player_id, cycle_number, day, options)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (player_id, cycle_number, day) DO NOTHING`,
    [playerId, cycle, day, JSON.stringify(options)],
  );
  const stored = await database.query<StoredChoiceRow>(
    "SELECT options FROM player_lariska_daily_options WHERE player_id = $1 AND cycle_number = $2 AND day = $3",
    [playerId, cycle, day],
  );
  return parseChoiceOptions(stored.rows[0]?.options ?? options);
}

function summaryFor(
  definition: LariskaDailyRewardDefinition,
  options?: LariskaDailyChoiceOption[],
): LariskaDailyRewardSummary {
  if (definition.kind === "card") {
    return {
      description: definition.description,
      kind: definition.kind,
      label: definition.label,
      legendaryChancePct: definition.legendaryChancePct,
      rarity: definition.rarity,
    };
  }
  if (definition.kind === "equipment") return { description: definition.description, kind: definition.kind, label: definition.label, rarity: definition.rarity };
  if (definition.kind === "gold") return { description: definition.description, kind: definition.kind, label: definition.label };
  if (definition.kind === "arena_tokens_xp") return { arenaTokens: definition.arenaTokens, description: definition.description, kind: definition.kind, label: definition.label, xp: definition.xp };
  return { description: definition.description, kind: definition.kind, label: definition.label, options };
}

function dialogueFor(day: number, claimable: boolean, cycle: number) {
  if (!claimable) return { emotion: "happy" as const, text: "Сьогодні вже забрала. Завтра подивимось, чи ти не передумаєш." };
  if (day === 7 && cycle >= 4) return { emotion: "surprised" as const, text: "Це я тягнула сюди весь місяць. Обирай уважно — вдруге не понесу." };
  if (day === 7) return { emotion: "happy" as const, text: "Це я тягнула сюди весь тиждень. Тож хоча б зроби вигляд, що вражений." };
  if (day === 6) return { emotion: "sly" as const, text: "Три карти. Одна кнопка. Не кажи потім, що я не дала вибору." };
  if (day === 4) return { emotion: "sly" as const, text: "Трохи золота. Не витрать усе на першу блискучу дурницю." };
  return { emotion: "neutral" as const, text: "Я сьогодні дещо знайшла. Не питай де." };
}

export class LariskaDailyRewardService {
  constructor(private readonly pool: Pool) {}

  async getView(database: Database, playerId: string, now: Date): Promise<LariskaDailyRewardView> {
    await ensureState(database, playerId);
    const state = await loadState(database, playerId);
    const claimDate = utcDate(now);
    const { cycle, day } = cycleAndDay(state.totalClaims);
    const definition = getLariskaDailyReward(cycle, day);
    const options = definition.kind === "choice" ? await ensureChoiceOptions(database, playerId, cycle, day, definition) : undefined;
    const claimedDayCount = state.totalClaims % 7;
    const calendar: LariskaDailyCalendarDay[] = Array.from({ length: 7 }, (_, index) => {
      const calendarDay = index + 1;
      const calendarDefinition = getLariskaDailyReward(cycle, calendarDay);
      return {
        claimed: calendarDay <= claimedDayCount,
        day: calendarDay,
        isCurrent: calendarDay === day,
        reward: summaryFor(calendarDefinition, calendarDay === day && calendarDefinition.kind === "choice" ? options : undefined),
      };
    });
    const streakRewards: LariskaStreakRewardView[] = LARISKA_STREAK_REWARDS.map((reward) => ({
      claimed: reward.threshold === 7 ? state.streakReward7Claimed : reward.threshold === 14 ? state.streakReward14Claimed : state.streakReward30Claimed,
      label: reward.label,
      threshold: reward.threshold,
    }));
    return {
      calendar,
      claimDate,
      claimable: state.lastClaimDate !== claimDate,
      cycle,
      day,
      dialogue: dialogueFor(day, state.lastClaimDate !== claimDate, cycle),
      reward: summaryFor(definition, options),
      streak: state.currentStreak,
      streakRewards,
      totalClaims: state.totalClaims,
    };
  }

  async claim(playerId: string, choiceIndex: number | undefined, now: Date = new Date()): Promise<DailyRewardClaimResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await ensureState(client, playerId);
      const state = await loadState(client, playerId, true);
      const claimDate = utcDate(now);
      if (state.lastClaimDate === claimDate) throw new DailyRewardNotClaimableError();
      const { cycle, day } = cycleAndDay(state.totalClaims);
      const definition = getLariskaDailyReward(cycle, day);
      const options = definition.kind === "choice" ? await ensureChoiceOptions(client, playerId, cycle, day, definition) : undefined;
      if (definition.kind === "choice" && (choiceIndex === undefined || !Number.isSafeInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= options!.length)) {
        throw new DailyRewardChoiceRequiredError();
      }

      const playerResult = await client.query<PlayerRewardRow>(
        "SELECT level, account_xp, silver, gold, arena_tokens FROM players WHERE id = $1 FOR UPDATE",
        [playerId],
      );
      const player = playerResult.rows[0];
      if (!player) throw new Error("Player is missing for Lariska reward");
      let goldDelta = 0;
      let arenaTokensDelta = 0;
      let xpDelta = 0;
      let grant: LariskaDailyRewardGrant;

      const grantCard = async (row: CardDefinitionRow, rarity: CardRarity, level: number, label: string) => {
        const rewardCard = await createStandardCardInstance(client, playerId, toCardDefinition(row), level, new CryptoCardRandomSource());
        if (rewardCard.rarity !== rarity) throw new Error("Lariska card reward rarity does not match its configuration");
        await recordCardDiscovery(client, playerId, row.id);
        return { card: rewardCard, kind: "card" as const, label };
      };

      if (definition.kind === "card") {
        const actualRarity = definition.legendaryChancePct && randomInt(100) < definition.legendaryChancePct ? "legendary" : definition.rarity;
        const level = actualRarity === "legendary" ? 35 : definition.level;
        const [row] = await selectCardRows(client, actualRarity, 1);
        const grantedCard = await grantCard(row!, actualRarity, level, definition.label);
        grant = grantedCard;
        if (definition.label.includes("15 золота")) goldDelta += 15;
      } else if (definition.kind === "equipment") {
        const equipment = selectEquipment(definition.rarity);
        await addEquipment(client, playerId, equipment);
        grant = { equipment, kind: "equipment", label: definition.label };
      } else if (definition.kind === "gold") {
        const amount = definition.minAmount + randomInt(definition.maxAmount - definition.minAmount + 1);
        goldDelta += amount;
        grant = { amount, kind: "gold", label: `${amount} золота` };
      } else if (definition.kind === "arena_tokens_xp") {
        arenaTokensDelta += definition.arenaTokens;
        xpDelta += definition.xp;
        grant = { arenaTokens: definition.arenaTokens, kind: "arena_tokens_xp", label: definition.label, xp: definition.xp };
      } else {
        const selected = options![choiceIndex!];
        if (!selected) throw new DailyRewardChoiceRequiredError();
        if (selected.kind === "card") {
          const row = await loadCard(client, selected.cardId);
          const grantedCard = await grantCard(row, selected.rarity, selected.level, selected.displayName ?? "Обрана карта");
          grant = grantedCard;
        } else if (selected.kind === "equipment") {
          await addEquipment(client, playerId, selected);
          grant = { equipment: selected, kind: "equipment", label: selected.name };
        } else {
          goldDelta += selected.amount;
          grant = { amount: selected.amount, kind: "gold", label: selected.label };
        }
      }

      const nextStreak = state.lastClaimDate === previousUtcDate(now) ? state.currentStreak + 1 : 1;
      let streakBonus: LariskaDailyRewardGrant | undefined;
      let streak7Claimed = state.streakReward7Claimed;
      let streak14Claimed = state.streakReward14Claimed;
      let streak30Claimed = state.streakReward30Claimed;
      if (nextStreak >= 7 && !streak7Claimed) {
        const [row] = await selectCardRows(client, "common", 1);
        const grantedCard = await grantCard(row!, "common", 1, getStreakReward(7).label);
        streakBonus = grantedCard;
        streak7Claimed = true;
      } else if (nextStreak >= 14 && !streak14Claimed) {
        goldDelta += 5;
        streakBonus = { amount: 5, kind: "gold", label: getStreakReward(14).label };
        streak14Claimed = true;
      } else if (nextStreak >= 30 && !streak30Claimed) {
        const owned = await client.query<{ cosmetic_id: string }>("SELECT cosmetic_id FROM player_arena_cosmetics WHERE player_id = $1", [playerId]);
        const ownedIds = new Set(owned.rows.map(({ cosmetic_id }) => cosmetic_id));
        const title = ARENA_COSMETICS.find((cosmetic) => cosmetic.type === "title" && !ownedIds.has(cosmetic.id));
        if (title) {
          await client.query(
            "INSERT INTO player_arena_cosmetics (player_id, cosmetic_id, cosmetic_type) VALUES ($1, $2, $3)",
            [playerId, title.id, title.type],
          );
          streakBonus = { cosmetic: { id: title.id, label: title.displayName }, kind: "cosmetic", label: getStreakReward(30).label };
        } else {
          goldDelta += 30;
          streakBonus = { amount: 30, kind: "gold", label: "30 золота замість титулу" };
        }
        streak30Claimed = true;
      }

      const progression = applyAccountXp({
        gainedXp: xpDelta,
        level: player.level,
        xp: toInteger(player.account_xp, "account XP"),
      });
      goldDelta += progression.goldReward;
      const updatedResult = await client.query<PlayerRewardRow>(
        `UPDATE players
         SET level = $2, account_xp = $3, silver = silver, gold = gold + $4,
             arena_tokens = arena_tokens + $5, updated_at = $6
         WHERE id = $1
         RETURNING level, account_xp, silver, gold, arena_tokens`,
        [playerId, progression.newLevel, progression.remainingXp, goldDelta, arenaTokensDelta, now],
      );
      const updated = updatedResult.rows[0];
      if (!updated) throw new Error("Lariska reward player update failed");
      await client.query(
        `INSERT INTO player_lariska_daily_claims (player_id, claim_date, cycle_number, day, reward)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [playerId, claimDate, cycle, day, JSON.stringify({ definition, selectedOption: definition.kind === "choice" ? options![choiceIndex!] : null, grant, streakBonus })],
      );
      await client.query(
        `UPDATE player_lariska_daily_state
         SET total_claims = total_claims + 1, current_streak = $2, last_claim_date = $3,
             streak_reward_7_claimed = $4, streak_reward_14_claimed = $5,
             streak_reward_30_claimed = $6, updated_at = $7
         WHERE player_id = $1`,
        [playerId, nextStreak, claimDate, streak7Claimed, streak14Claimed, streak30Claimed, now],
      );
      await client.query("COMMIT");
      return {
        claimedCycle: cycle,
        claimedDay: day,
        grant,
        rewardPlayer: {
          accountXp: toInteger(updated.account_xp, "account XP"),
          arenaTokens: toInteger(updated.arena_tokens, "arena tokens"),
          gold: toInteger(updated.gold, "gold"),
          level: updated.level,
          silver: toInteger(updated.silver, "silver"),
        },
        ...(streakBonus ? { streakBonus } : {}),
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

async function addEquipment(client: PoolClient, playerId: string, equipment: LariskaDailyEquipmentOption) {
  await client.query(
    `INSERT INTO player_equipment_inventory (player_id, item_id, quantity)
     VALUES ($1, $2, 1)
     ON CONFLICT (player_id, item_id)
     DO UPDATE SET quantity = player_equipment_inventory.quantity + 1, updated_at = NOW()`,
    [playerId, equipment.itemId],
  );
}
