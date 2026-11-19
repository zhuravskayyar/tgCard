import { grantRandomEquipment } from "./equipment/equipmentChestService.js";
import { randomUUID } from "node:crypto";
import { createStandardCardInstance, CryptoCardRandomSource } from "./cards/cardInstanceCreator.js";
import { recordCardDiscovery } from "./collections/discoveryService.js";
import {
  getArenaRewardCardLevelRange,
  getCardPower,
  getNextBattlePassThreshold,
  getRarityForLevel,
  isBattlePassCircleComplete,
} from "@cardastika/game-core";
import type {
  ArenaDailyTasksView,
  BattlePassClaimResponse,
  DailyLoginClaimResponse,
  BattlePassPageResponse,
  BattlePassReward,
  BattlePassView,
  BattlePassOwnedItem,
  BattlePassFinalCardPreview,
  BattlePassVipPurchaseResponse,
  DailyTaskClaimResponse,
  DailyTaskReward,
  PlayerBalance,
  PlayerCardInstance,
} from "@cardastika/shared";
import { isArenaUnlocked } from "@cardastika/shared";
import type { Pool, PoolClient } from "pg";
import { CURRENCY_BOOST_DURATION_MS, getCurrencyBoostStatus } from "./boosts/currencyBoost.js";
import {
  BATTLE_PASS_BROTHERHOOD_COLLECTION,
  BATTLE_PASS_DUPLICATE_ITEM_GOLD,
  BATTLE_PASS_MILESTONES,
  BATTLE_PASS_CATALOG,
  BATTLE_PASS_VIP_PRICE_GOLD,
  DAILY_TASK_EQUIPMENT_RARITY,
  DAILY_TASK_SILVER_PER_DIAMOND,
  DAILY_TASKS,
  getBattlePassMilestone,
  getDailyTask,
  getDayWindow,
  getMilestoneThreshold,
  getPlayerCircles,
  getSeasonWindow,
  isGrantableReward,
  type BattlePassMilestoneConfig,
} from "./battlePassConfig.js";
import { LariskaDailyRewardService } from "./dailyRewardsService.js";
import { grantGuildWarMagicCrystal } from "./guild/guildWarCrystal.js";

type Database = Pick<Pool | PoolClient, "query">;

interface BattlePassStateRow {
  diamonds: number | string;
  vip_purchased_at: Date | string | null;
}

interface EventProgressRow {
  amount: number | string;
  event_type: string;
  event_count: number | string;
}

interface CardDefinitionRow {
  art_key: string | null;
  code: string;
  collection_id: string | null;
  description: string;
  display_name: string | null;
  element: "air" | "earth" | "fire" | "water";
  id: string;
  limited: boolean;
  min_rarity: "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic";
}

interface BalanceRow {
  gold: number | string;
  silver: number | string;
}

interface LowestDeckCardLevelRow {
  level: number | string | null;
}

export class BattlePassMilestoneNotClaimableError extends Error {
  constructor() {
    super("Battle pass milestone is not claimable");
    this.name = "BattlePassMilestoneNotClaimableError";
  }
}

export class BattlePassVipUnavailableError extends Error {
  constructor() {
    super("Battle pass VIP is already bought or the season is finished");
    this.name = "BattlePassVipUnavailableError";
  }
}

export class BattlePassVipInsufficientGoldError extends Error {
  constructor() {
    super("Not enough gold for battle pass VIP");
    this.name = "BattlePassVipInsufficientGoldError";
  }
}

export class DailyTaskNotClaimableError extends Error {
  constructor() {
    super("Daily task is not claimable");
    this.name = "DailyTaskNotClaimableError";
  }
}

function toInteger(value: number | string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error("Battle pass stored integer is invalid");
  return parsed;
}

const ARENA_TASK_IDS: ReadonlySet<string> = new Set(["play-arenas", "win-arenas"]);

/** Arena tasks appear only once the arena is open (third epic duel league, 900 on our scale), as in the reference. */
async function loadAvailableDailyTasks(database: Database, playerId: string) {
  const result = await database.query<{ duel_highest_league_index: number | string; duel_rating: number | string }>(
    "SELECT duel_rating, duel_highest_league_index FROM players WHERE id = $1",
    [playerId],
  );
  const row = result.rows[0];
  const arenaOpen = row ? isArenaUnlocked(toInteger(row.duel_rating), toInteger(row.duel_highest_league_index)) : false;
  return arenaOpen ? DAILY_TASKS : DAILY_TASKS.filter((task) => !ARENA_TASK_IDS.has(task.id));
}

function multiplierForCompletedTasks(completedCount: number): 1 | 2 | 3 {
  if (completedCount >= 7) return 3;
  if (completedCount >= 6) return 2;
  return 1;
}

function circleMilestones(circle: number) {
  return BATTLE_PASS_MILESTONES.filter((milestone) => milestone.circle === circle);
}

/** The final stop (the card) closes the circle, so it waits for every other reward on the way. */
function isFinalMilestone(milestone: BattlePassMilestoneConfig) {
  return circleMilestones(milestone.circle).at(-1)?.id === milestone.id;
}

/** Reward ids the final card waits for: grantable free ones, plus grantable VIP ones when VIP is bought. */
function rewardsBeforeFinal(milestone: BattlePassMilestoneConfig, vip: boolean) {
  return circleMilestones(milestone.circle).flatMap((candidate) => [
    ...(candidate.id !== milestone.id && isGrantableReward(candidate.reward) ? [candidate.id] : []),
    ...(vip && candidate.vip && isGrantableReward(candidate.vip.reward) ? [candidate.vip.id] : []),
  ]);
}

/** Only free rewards decide completion, so a player without VIP can always finish a circle. */
function isCircleComplete(circle: number, claimedIds: Set<string>) {
  return circleMilestones(circle).every((milestone) => !isGrantableReward(milestone.reward) || claimedIds.has(milestone.id));
}

function getActiveCircle(claimedIds: Set<string>, hasBrotherhood: boolean) {
  return getPlayerCircles(hasBrotherhood).find(({ circle }) => !isCircleComplete(circle, claimedIds))?.circle ?? null;
}

async function loadHasBrotherhood(database: Database, playerId: string) {
  const result = await database.query(
    `SELECT 1 FROM player_collection_completions completions
       INNER JOIN collections ON collections.id = completions.collection_id
       WHERE completions.player_id = $1 AND collections.code = $2 LIMIT 1`,
    [playerId, BATTLE_PASS_BROTHERHOOD_COLLECTION],
  );
  return result.rows.length > 0;
}

async function ensureState(database: Database, playerId: string, seasonId: string) {
  await database.query(
    `
      INSERT INTO player_battle_pass_state (player_id, season_id)
      VALUES ($1, $2)
      ON CONFLICT (player_id, season_id) DO NOTHING
    `,
    [playerId, seasonId],
  );
}

async function loadState(database: Database, playerId: string, seasonId: string) {
  const result = await database.query<BattlePassStateRow>(
    "SELECT diamonds, vip_purchased_at FROM player_battle_pass_state WHERE player_id = $1 AND season_id = $2",
    [playerId, seasonId],
  );
  const state = result.rows[0];
  if (!state) throw new Error("Battle pass state is missing");
  return { diamonds: toInteger(state.diamonds), vip: state.vip_purchased_at !== null };
}

async function loadEventProgress(database: Database, playerId: string, startsAt: Date, endsAt: Date) {
  const eventTypes = DAILY_TASKS.map((task) => task.eventType);
  const result = await database.query<EventProgressRow>(
    `
      SELECT
        event_type,
        COUNT(*)::integer AS event_count,
        COALESCE(SUM(
          CASE WHEN event_type = 'CARD_ABSORBED'
            THEN COALESCE((payload->>'absorbedCards')::integer, 0)
            ELSE 0
          END
        ), 0)::integer AS amount
      FROM player_campaign_events
      WHERE player_id = $1
        AND occurred_at >= $2
        AND occurred_at < $3
        AND event_type = ANY($4::text[])
      GROUP BY event_type
    `,
    [playerId, startsAt, endsAt, eventTypes],
  );
  const byType = new Map(result.rows.map((row) => [row.event_type, row]));
  return new Map(DAILY_TASKS.map((task) => {
    const row = byType.get(task.eventType);
    return [task.id, row
      ? task.eventType === "CARD_ABSORBED" ? toInteger(row.amount) : toInteger(row.event_count)
      : 0];
  }));
}

/** Today's arena daily-task progress, shown in the arena lobby. */
export async function loadArenaDailyTasks(database: Database, playerId: string, now: Date = new Date()): Promise<ArenaDailyTasksView> {
  const day = getDayWindow(now);
  const progress = await loadEventProgress(database, playerId, day.startsAt, day.endsAt);
  const task = (id: "play-arenas" | "win-arenas") => {
    const definition = DAILY_TASKS.find((entry) => entry.id === id)!;
    return { progress: Math.min(definition.target, progress.get(id) ?? 0), target: definition.target };
  };
  return { play: task("play-arenas"), win: task("win-arenas") };
}

async function loadDailyClaims(database: Database, playerId: string, taskDate: string) {
  const result = await database.query<{ task_id: string }>(
    "SELECT task_id FROM player_daily_task_claims WHERE player_id = $1 AND task_date = $2",
    [playerId, taskDate],
  );
  return new Set(result.rows.map(({ task_id }) => task_id));
}

async function loadMilestoneClaims(database: Database, playerId: string, seasonId: string) {
  const result = await database.query<{ milestone_id: string }>(
    "SELECT milestone_id FROM player_battle_pass_claims WHERE player_id = $1 AND season_id = $2",
    [playerId, seasonId],
  );
  return new Set(result.rows.map(({ milestone_id }) => milestone_id));
}

async function loadCompletedTaskCount(database: Database, playerId: string, now: Date) {
  const day = getDayWindow(new Date(now.getTime() - 24 * 60 * 60 * 1_000));
  const progress = await loadEventProgress(database, playerId, day.startsAt, day.endsAt);
  const tasks = await loadAvailableDailyTasks(database, playerId);
  return tasks.filter((task) => (progress.get(task.id) ?? 0) >= task.target).length;
}

function toBalance(row: BalanceRow): PlayerBalance {
  return { gold: toInteger(row.gold), silver: toInteger(row.silver) };
}

async function loadBalance(database: Database, playerId: string) {
  const result = await database.query<BalanceRow>("SELECT gold, silver FROM players WHERE id = $1", [playerId]);
  const row = result.rows[0];
  if (!row) throw new Error("Battle pass player is missing");
  return toBalance(row);
}

/** Level of the weakest card in the battle deck (the reference's "9th card"). */
export async function loadLowestDeckCardLevel(database: Database, playerId: string) {
  const result = await database.query<LowestDeckCardLevelRow>(
    `
      SELECT MIN(player_card_instances.level)::integer AS level
      FROM player_decks
      INNER JOIN deck_slots ON deck_slots.deck_id = player_decks.id
      INNER JOIN player_card_instances ON player_card_instances.id = deck_slots.card_instance_id
      WHERE player_decks.player_id = $1
    `,
    [playerId],
  );
  const level = result.rows[0]?.level;
  if (level === null || level === undefined) throw new Error("Player deck has no cards for the battle pass reward");
  return toInteger(level);
}

/** A random standard shop card used as a reward card. */
export async function loadRewardCardDefinition(database: Database) {
  const result = await database.query<CardDefinitionRow>(
    `
      SELECT id, code, display_name, art_key, element, collection_id, description, limited, min_rarity
      FROM cards
      WHERE shop_eligible = TRUE AND limited = FALSE AND source = 'standard'
      ORDER BY random()
      LIMIT 1
    `,
  );
  const row = result.rows[0];
  if (!row) throw new Error("No free battle pass card reward is configured");
  return toRewardCardDefinition(row);
}

async function loadCardDefinitionById(database: Database, cardId: string) {
  const result = await database.query<CardDefinitionRow>(
    "SELECT id, code, display_name, art_key, element, collection_id, description, limited, min_rarity FROM cards WHERE id = $1",
    [cardId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Battle pass preview card is missing");
  return toRewardCardDefinition(row);
}

/** Reference: the final card takes the element of the weakest deck card; any element when none fits. */
async function pickPreviewCardId(database: Database, playerId: string) {
  const weakest = await database.query<{ element: string }>(
    `SELECT cards.element FROM player_decks
       INNER JOIN deck_slots ON deck_slots.deck_id = player_decks.id
       INNER JOIN player_card_instances ON player_card_instances.id = deck_slots.card_instance_id
       INNER JOIN cards ON cards.id = player_card_instances.card_id
       WHERE player_decks.player_id = $1
       ORDER BY player_card_instances.level ASC, player_card_instances.bonus_power ASC
       LIMIT 1`,
    [playerId],
  );
  const pick = (element: string | null) => database.query<{ id: string }>(
    `SELECT id FROM cards
       WHERE shop_eligible = TRUE AND limited = FALSE AND source = 'standard' AND ($1::text IS NULL OR element = $1)
       ORDER BY random() LIMIT 1`,
    [element],
  );
  const id = (await pick(weakest.rows[0]?.element ?? null)).rows[0]?.id ?? (await pick(null)).rows[0]?.id;
  if (!id) throw new Error("No free battle pass card reward is configured");
  return id;
}

/** The circle's final card: chosen once, then the same card is shown and granted until it is claimed. */
export async function getOrCreateCardPreview(database: Database, playerId: string, seasonId: string, circle: number) {
  const select = () => database.query<{ card_id: string }>(
    "SELECT card_id FROM player_battle_pass_card_previews WHERE player_id = $1 AND season_id = $2 AND circle = $3",
    [playerId, seasonId, circle],
  );
  let cardId = (await select()).rows[0]?.card_id;
  if (!cardId) {
    await database.query(
      `INSERT INTO player_battle_pass_card_previews (player_id, season_id, circle, card_id) VALUES ($1, $2, $3, $4)
         ON CONFLICT (player_id, season_id, circle) DO NOTHING`,
      [playerId, seasonId, circle, await pickPreviewCardId(database, playerId)],
    );
    // A concurrent load may have won the insert; both then show and grant its card.
    cardId = (await select()).rows[0]?.card_id;
  }
  if (!cardId) throw new Error("Battle pass card preview was not stored");
  return loadCardDefinitionById(database, cardId);
}

/** The preview shown on the track; never throws, so a player without a deck just sees the card back. */
async function loadFinalCardPreview(database: Database, playerId: string, seasonId: string, circle: number, vip: boolean): Promise<BattlePassFinalCardPreview | null> {
  // Without a deck there is no weakest card to match, so no preview is stored yet: the track shows the card back.
  const hasDeck = await database.query("SELECT 1 FROM player_decks INNER JOIN deck_slots ON deck_slots.deck_id = player_decks.id WHERE player_decks.player_id = $1 LIMIT 1", [playerId]);
  if (!hasDeck.rowCount) return null;
  try {
    const level = await loadLowestDeckCardLevel(database, playerId);
    const definition = await getOrCreateCardPreview(database, playerId, seasonId, circle);
    return {
      artKey: definition.artKey,
      cardId: definition.id,
      code: definition.code,
      displayName: definition.displayName,
      element: definition.element,
      finalPower: getCardPower({ level, bonusPower: 0 }),
      level,
      rarity: getRarityForLevel(level),
      vip,
    };
  } catch (error) {
    // The page still loads; the log tells a missing table or a database error apart from an empty deck.
    console.warn("Battle pass final card preview failed", error);
    return null;
  }
}

function toRewardCardDefinition(row: CardDefinitionRow) {
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
  } as const;
}

type DailyTaskConfig = (typeof DAILY_TASKS)[number];

/** Today's payout of one task: currencies take the day multiplier, the item and the card do not. */
function dailyTaskReward(task: DailyTaskConfig, multiplier: 1 | 2 | 3, arenaLeagueIndex: number): DailyTaskReward {
  const [minLevel, maxLevel] = getArenaRewardCardLevelRange(arenaLeagueIndex);
  return {
    card: task.card ? { maxLevel, minLevel } : null,
    diamonds: task.rewardDiamonds * multiplier,
    equipment: DAILY_TASK_EQUIPMENT_RARITY,
    gold: task.rewardGold * multiplier,
    silver: task.rewardDiamonds * DAILY_TASK_SILVER_PER_DIAMOND * multiplier,
  };
}

async function loadArenaLeagueIndex(database: Database, playerId: string) {
  const result = await database.query<{ arena_league_index: number | string }>("SELECT arena_league_index FROM players WHERE id = $1", [playerId]);
  return toInteger(result.rows[0]?.arena_league_index ?? 0);
}

async function grantReward(
  database: PoolClient,
  playerId: string,
  reward: BattlePassReward,
  rewardId: string,
  seasonId: string,
  now: Date,
  circle: number,
  vipCard: boolean,
): Promise<{ balance: PlayerBalance; card?: PlayerCardInstance; convertedToGold?: number; equipmentItemId?: string }> {
  let card: PlayerCardInstance | undefined;
  if (reward.kind === "boost") {
    // Reference: durations stack, multipliers do not. The new boost lasts until the current one ends plus 24 hours.
    const active = await database.query<{ expires_at: Date | string | null }>(
      `SELECT MAX(expires_at) AS expires_at FROM player_boosts
         WHERE player_id = $1 AND boost_type LIKE 'currency_x%' AND starts_at <= $2 AND expires_at > $2`,
      [playerId, now],
    );
    const activeUntil = active.rows[0]?.expires_at ? new Date(active.rows[0].expires_at).getTime() : now.getTime();
    const expiresAt = new Date(Math.max(now.getTime(), activeUntil) + CURRENCY_BOOST_DURATION_MS);
    await database.query(
      `
        INSERT INTO player_boosts (id, player_id, boost_type, starts_at, expires_at, source)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [randomUUID(), playerId, `currency_x${reward.multiplier}`, now, expiresAt, `battle_pass:${seasonId}:${rewardId}`],
    );
    return { balance: await loadBalance(database, playerId) };
  }
  if (reward.kind === "item") {
    if (!reward.available) throw new BattlePassMilestoneNotClaimableError();
    let granted = false;
    if (reward.item === "hunting_permit") {
      // Max one item of each kind: a second permit turns into gold.
      const result = await database.query(
        `INSERT INTO player_invasion_items (player_id, hunting_permits) VALUES ($1, 1)
           ON CONFLICT (player_id) DO UPDATE SET hunting_permits = 1 WHERE player_invasion_items.hunting_permits = 0`,
        [playerId],
      );
      granted = result.rowCount === 1;
    } else if (reward.item === "magic_crystal") {
      granted = await grantGuildWarMagicCrystal(database, playerId);
    } else {
      throw new BattlePassMilestoneNotClaimableError();
    }
    if (granted) return { balance: await loadBalance(database, playerId) };
    const result = await database.query<BalanceRow>(
      "UPDATE players SET gold = gold + $2, updated_at = NOW() WHERE id = $1 RETURNING gold, silver",
      [playerId, BATTLE_PASS_DUPLICATE_ITEM_GOLD],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Battle pass player is missing");
    return { balance: toBalance(row), convertedToGold: BATTLE_PASS_DUPLICATE_ITEM_GOLD };
  }
  if (reward.kind === "silver" || reward.kind === "gold") {
    const result = await database.query<BalanceRow>(
      `UPDATE players SET ${reward.kind} = ${reward.kind} + $2, updated_at = NOW() WHERE id = $1 RETURNING gold, silver`,
      [playerId, reward.amount],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Battle pass player is missing");
    return { balance: toBalance(row) };
  }

  if (reward.kind === "equipment") {
    const item = await grantRandomEquipment(database, playerId, reward.rarity);
    return { balance: await loadBalance(database, playerId), equipmentItemId: item.id };
  }

  const level = await loadLowestDeckCardLevel(database, playerId);
  // The card shown on the track since the circle began, not a fresh random one.
  const definition = await getOrCreateCardPreview(database, playerId, seasonId, circle);
  card = await createStandardCardInstance(database, playerId, definition, level, new CryptoCardRandomSource());
  if (vipCard) {
    await database.query("UPDATE player_card_instances SET vip_frame = TRUE WHERE id = $1", [card.instanceId]);
    card = { ...card, vip: true };
  }
  await recordCardDiscovery(database, playerId, definition.id);
  return { balance: await loadBalance(database, playerId), card };
}

/** Magic items the player holds now; only kinds whose game system stores them can appear. */
async function loadOwnedItems(database: Database, playerId: string): Promise<BattlePassOwnedItem[]> {
  const result = await database.query<{ hunting_permits: number | string | null; magic_crystals: number | string | null }>(
    `SELECT
       (SELECT hunting_permits FROM player_invasion_items WHERE player_id = $1) AS hunting_permits,
       (SELECT quantity FROM guild_war_magic_crystals WHERE player_id = $1) AS magic_crystals`,
    [playerId],
  );
  const row = result.rows[0];
  const owned: BattlePassOwnedItem[] = [];
  const permits = toInteger(row?.hunting_permits ?? 0);
  const crystals = toInteger(row?.magic_crystals ?? 0);
  if (permits > 0) owned.push({ item: "hunting_permit", quantity: permits });
  if (crystals > 0) owned.push({ item: "magic_crystal", quantity: crystals });
  return owned;
}

export class BattlePassService {
  private readonly dailyRewards: LariskaDailyRewardService;

  constructor(private readonly pool: Pool) {
    this.dailyRewards = new LariskaDailyRewardService(pool);
  }

  private async buildPage(database: Database, playerId: string, now: Date): Promise<BattlePassPageResponse> {
    const season = getSeasonWindow(now);
    await ensureState(database, playerId, season.seasonId);
    const state = await loadState(database, playerId, season.seasonId);
    const hasBrotherhood = await loadHasBrotherhood(database, playerId);
    const currencyBoost = await getCurrencyBoostStatus(database, playerId, now);
    const milestoneClaims = await loadMilestoneClaims(database, playerId, season.seasonId);
    const day = getDayWindow(now);
    const dailyLogin = await this.dailyRewards.getView(database, playerId, now);
    const dailyClaims = await loadDailyClaims(database, playerId, day.taskDate);
    const progress = await loadEventProgress(database, playerId, day.startsAt, day.endsAt);
    const availableTasks = await loadAvailableDailyTasks(database, playerId);
    const completedCount = availableTasks.filter((task) => (progress.get(task.id) ?? 0) >= task.target).length;
    const currentRewardMultiplier = multiplierForCompletedTasks(await loadCompletedTaskCount(database, playerId, now));
    const arenaLeagueIndex = await loadArenaLeagueIndex(database, playerId);
    const circles = getPlayerCircles(hasBrotherhood);
    const activeCircle = getActiveCircle(milestoneClaims, hasBrotherhood);
    const allThresholds: number[] = [];
    const allCircleViews = circles.map(({ circle }, circleIndex) => {
      const previous = circles[circleIndex - 1];
      const fromDiamonds = previous ? getMilestoneThreshold(circleMilestones(previous.circle).at(-1)!, hasBrotherhood) : 0;
      const isActive = activeCircle === circle;
      const milestones = circleMilestones(circle).map((config) => {
        const threshold = getMilestoneThreshold(config, hasBrotherhood);
        allThresholds.push(threshold);
        const reached = state.diamonds >= threshold;
        const claimed = milestoneClaims.has(config.id);
        const previousRewardsPending = isFinalMilestone(config)
          && rewardsBeforeFinal(config, state.vip).some((id) => !milestoneClaims.has(id));
        const vipClaimed = config.vip ? milestoneClaims.has(config.vip.id) : false;
        return {
          claimable: isActive && isGrantableReward(config.reward) && !claimed && reached && !previousRewardsPending,
          claimed,
          circle,
          id: config.id,
          reward: config.reward,
          threshold,
          vip: config.vip ? {
            claimable: isActive && state.vip && isGrantableReward(config.vip.reward) && !vipClaimed && reached,
            claimed: vipClaimed,
            id: config.vip.id,
            reward: config.vip.reward,
          } : null,
        };
      });
      return {
        completed: isCircleComplete(circle, milestoneClaims),
        circle,
        fromDiamonds,
        milestones,
        threshold: milestones.at(-1)!.threshold,
      };
    });
    const activeCircleIndex = allCircleViews.findIndex(({ completed }) => !completed);
    const visibleCircles = activeCircleIndex >= 0
      ? [{ ...allCircleViews[activeCircleIndex]!, finalCard: await loadFinalCardPreview(database, playerId, season.seasonId, allCircleViews[activeCircleIndex]!.circle, state.vip) }]
      : allCircleViews.length ? [allCircleViews[allCircleViews.length - 1]!] : [];
    const battlePass: BattlePassView = {
      catalog: BATTLE_PASS_CATALOG,
      ownedItems: await loadOwnedItems(database, playerId),
      circles: visibleCircles,
      currencyBoost,
      currentCircle: visibleCircles.find(({ completed }) => !completed)?.circle ?? null,
      diamonds: state.diamonds,
      endsAt: season.endsAt.toISOString(),
      nextThreshold: getNextBattlePassThreshold(state.diamonds, allThresholds.map((threshold, index) => ({
        circle: index,
        threshold,
      }))),
      seasonId: season.seasonId,
      startsAt: season.startsAt.toISOString(),
      totalCircles: circles.length,
      vip: { active: state.vip, price: BATTLE_PASS_VIP_PRICE_GOLD, purchasable: !state.vip && activeCircle !== null },
    };
    return {
      battlePass,
      daily: {
        completedCount,
        currentRewardMultiplier,
        multiplierForTomorrow: multiplierForCompletedTasks(completedCount),
        taskDate: day.taskDate,
        tasks: availableTasks.map((task) => {
          const taskProgress = Math.min(task.target, progress.get(task.id) ?? 0);
          return {
            claimed: dailyClaims.has(task.id),
            completed: taskProgress >= task.target,
            id: task.id,
            kind: "daily" as const,
            progress: taskProgress,
            reward: dailyTaskReward(task, currentRewardMultiplier, arenaLeagueIndex),
            target: task.target,
            title: task.title,
          };
        }),
      },
      dailyLogin,
    };
  }

  async getPage(playerId: string, now: Date = new Date()) {
    return this.buildPage(this.pool, playerId, now);
  }

  async claimMilestone(playerId: string, rewardId: string, now: Date = new Date()): Promise<BattlePassClaimResponse> {
    const found = getBattlePassMilestone(rewardId);
    if (!found) throw new BattlePassMilestoneNotClaimableError();
    const { milestone, vip } = found;
    const reward = vip ? milestone.vip?.reward : milestone.reward;
    if (!isGrantableReward(reward)) throw new BattlePassMilestoneNotClaimableError();
    const season = getSeasonWindow(now);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await ensureState(client, playerId, season.seasonId);
      const stateResult = await client.query<BattlePassStateRow>(
        "SELECT diamonds, vip_purchased_at FROM player_battle_pass_state WHERE player_id = $1 AND season_id = $2 FOR UPDATE",
        [playerId, season.seasonId],
      );
      const state = stateResult.rows[0];
      const hasBrotherhood = await loadHasBrotherhood(client, playerId);
      if (!state || toInteger(state.diamonds) < getMilestoneThreshold(milestone, hasBrotherhood)) throw new BattlePassMilestoneNotClaimableError();
      const hasVip = state.vip_purchased_at !== null;
      if (vip && !hasVip) throw new BattlePassMilestoneNotClaimableError();
      const claimedIds = await loadMilestoneClaims(client, playerId, season.seasonId);
      // VIP rewards of a finished circle are lost, as in the reference: only the active circle pays.
      if (getActiveCircle(claimedIds, hasBrotherhood) !== milestone.circle) throw new BattlePassMilestoneNotClaimableError();
      if (!vip && isFinalMilestone(milestone) && rewardsBeforeFinal(milestone, hasVip).some((id) => !claimedIds.has(id))) {
        throw new BattlePassMilestoneNotClaimableError();
      }
      const claim = await client.query(
        `
          INSERT INTO player_battle_pass_claims (player_id, season_id, milestone_id)
          VALUES ($1, $2, $3)
          ON CONFLICT (player_id, season_id, milestone_id) DO NOTHING
        `,
        [playerId, season.seasonId, rewardId],
      );
      if (claim.rowCount !== 1) throw new BattlePassMilestoneNotClaimableError();
      const granted = await grantReward(client, playerId, reward, rewardId, season.seasonId, now, milestone.circle, hasVip);
      await client.query("COMMIT");
      return {
        ...(await this.getPage(playerId, now)),
        ...(granted.card ? { card: granted.card } : {}),
        ...(granted.convertedToGold ? { convertedToGold: granted.convertedToGold } : {}),
        ...(granted.equipmentItemId ? { equipmentItemId: granted.equipmentItemId } : {}),
        reward,
        updatedBalance: granted.balance,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /** VIP for the current season; rewards of the active circle already reached become claimable at once. */
  async purchaseVip(playerId: string, now: Date = new Date()): Promise<BattlePassVipPurchaseResponse> {
    const season = getSeasonWindow(now);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await ensureState(client, playerId, season.seasonId);
      const stateResult = await client.query<BattlePassStateRow>(
        "SELECT diamonds, vip_purchased_at FROM player_battle_pass_state WHERE player_id = $1 AND season_id = $2 FOR UPDATE",
        [playerId, season.seasonId],
      );
      if (!stateResult.rows[0] || stateResult.rows[0].vip_purchased_at !== null) throw new BattlePassVipUnavailableError();
      const claimedIds = await loadMilestoneClaims(client, playerId, season.seasonId);
      if (getActiveCircle(claimedIds, await loadHasBrotherhood(client, playerId)) === null) throw new BattlePassVipUnavailableError();
      const paid = await client.query<BalanceRow>(
        "UPDATE players SET gold = gold - $2, updated_at = NOW() WHERE id = $1 AND gold >= $2 RETURNING gold, silver",
        [playerId, BATTLE_PASS_VIP_PRICE_GOLD],
      );
      const row = paid.rows[0];
      if (!row) throw new BattlePassVipInsufficientGoldError();
      await client.query(
        "UPDATE player_battle_pass_state SET vip_purchased_at = $3, updated_at = NOW() WHERE player_id = $1 AND season_id = $2",
        [playerId, season.seasonId, now],
      );
      await client.query("COMMIT");
      return { ...(await this.getPage(playerId, now)), updatedBalance: toBalance(row) };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async claimDailyTask(playerId: string, taskId: string, now: Date = new Date()): Promise<DailyTaskClaimResponse> {
    const task = getDailyTask(taskId);
    if (!task) throw new DailyTaskNotClaimableError();
    if (!(await loadAvailableDailyTasks(this.pool, playerId)).some(({ id }) => id === task.id)) throw new DailyTaskNotClaimableError();
    const season = getSeasonWindow(now);
    const day = getDayWindow(now);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const progress = await loadEventProgress(client, playerId, day.startsAt, day.endsAt);
      if ((progress.get(task.id) ?? 0) < task.target) throw new DailyTaskNotClaimableError();
      const previousCompletedCount = await loadCompletedTaskCount(client, playerId, now);
      const reward = dailyTaskReward(task, multiplierForCompletedTasks(previousCompletedCount), await loadArenaLeagueIndex(client, playerId));
      const claim = await client.query(
        `
          INSERT INTO player_daily_task_claims (player_id, task_date, task_id, reward_diamonds)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (player_id, task_date, task_id) DO NOTHING
        `,
        [playerId, day.taskDate, task.id, reward.diamonds],
      );
      if (claim.rowCount !== 1) throw new DailyTaskNotClaimableError();
      await ensureState(client, playerId, season.seasonId);
      await client.query(
        `
          UPDATE player_battle_pass_state
          SET diamonds = diamonds + $3, updated_at = NOW()
          WHERE player_id = $1 AND season_id = $2
        `,
        [playerId, season.seasonId, reward.diamonds],
      );
      await client.query(
        "UPDATE players SET gold = gold + $2, silver = silver + $3, updated_at = NOW() WHERE id = $1",
        [playerId, reward.gold, reward.silver],
      );
      const equipmentItemId = reward.equipment ? (await grantRandomEquipment(client, playerId, reward.equipment)).id : undefined;
      let card: PlayerCardInstance | undefined;
      if (reward.card) {
        const level = reward.card.minLevel + Math.floor(Math.random() * (reward.card.maxLevel - reward.card.minLevel + 1));
        const definition = await loadRewardCardDefinition(client);
        card = await createStandardCardInstance(client, playerId, definition, level, new CryptoCardRandomSource());
        await recordCardDiscovery(client, playerId, definition.id);
      }
      const updatedBalance = await loadBalance(client, playerId);
      await client.query("COMMIT");
      return {
        ...(await this.getPage(playerId, now)),
        ...(card ? { card } : {}),
        claimedTaskId: task.id,
        ...(equipmentItemId ? { equipmentItemId } : {}),
        updatedBalance,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async claimDailyLogin(playerId: string, choiceIndex?: number, now: Date = new Date()): Promise<DailyLoginClaimResponse> {
    const claimed = await this.dailyRewards.claim(playerId, choiceIndex, now);
    return {
      ...(await this.getPage(playerId, now)),
      claimedCycle: claimed.claimedCycle,
      claimedDay: claimed.claimedDay,
      grant: claimed.grant,
      rewardPlayer: claimed.rewardPlayer,
      ...(claimed.streakBonus ? { streakBonus: claimed.streakBonus } : {}),
    };
  }
}
