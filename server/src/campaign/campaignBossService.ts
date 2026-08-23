import { randomUUID } from "node:crypto";
import {
  applyAccountXp,
  calculateBattleReward,
  getBasePowerForLevel,
  getCardPower,
  getDeckPower,
  getRarityForLevel,
  getStartingHp,
  initializeCyclicCardPool,
  resolveDuelExchange,
  validateDeckElementBalance,
  type IntegerRandomSource,
  type RandomSource,
} from "@cardastika/game-core";
import type {
  CampaignBossResult,
  CampaignBossView,
  CardDefinition,
  CardElement,
  CardRarity,
  DuelBattleModifiers,
  DuelCardSnapshot,
  DuelExchange,
  DuelSideSnapshot,
  DuelStatus,
  PlayerSummary,
} from "@cardastika/shared";
import type { Pool } from "pg";
import { getAccountBoostStatus } from "../boosts/accountBoost.js";
import { createStandardCardInstance, CryptoCardRandomSource } from "../cards/cardInstanceCreator.js";
import { recordCardDiscovery } from "../collections/discoveryService.js";
import { recalculateAutomaticDeck } from "../decks/automaticDeckService.js";
import { loadDuelParticipant } from "../duel/duelService.js";
import type { CampaignService } from "./campaignService.js";
import {
  CAMPAIGN_BOSS_CARD_CONFIG,
  CAMPAIGN_ID,
  CAMPAIGN_STAGES,
  BOSS_VICTORY_DIALOGUES,
  BOSS_INTRO_DIALOGUES,
  MANTICORE_CARD_CODE,
} from "./campaignConfig.js";

const CAMPAIGN_BOSS_BASE_XP = 600;
const CAMPAIGN_BOSS_BASE_SILVER = 1_000;
const CAMPAIGN_BOSS_REWARD_LEVEL = 15;
const MAX_BATTLE_LOG_ENTRIES = 10;

interface BossCardDefinitionRow {
  art_key: string | null;
  code: string;
  collection_id: string | null;
  display_name: string | null;
  element: CardElement;
  id: string;
  min_rarity: CardRarity;
  shop_eligible: boolean;
}

interface BossDuelRow {
  battle_log: DuelExchange[];
  campaign_id: string | null;
  challenger_id: string;
  challenger_snapshot: DuelSideSnapshot;
  enemy_active_slots: DuelCardSnapshot[];
  enemy_hp: number;
  enemy_reserve_queue: DuelCardSnapshot[];
  id: string;
  opponent_kind: "bot" | "campaign_boss" | "real";
  opponent_snapshot: DuelSideSnapshot;
  player_active_slots: DuelCardSnapshot[];
  player_hp: number;
  player_reserve_queue: DuelCardSnapshot[];
  result: CampaignBossResult | null;
  rewards_granted: boolean;
  status: DuelStatus;
  turn_number: number;
  version: number;
}

interface CampaignStateRow {
  boss_reward_granted_at: Date | string | null;
  completed_at: Date | string | null;
}

interface PlayerRewardRow {
  account_xp: number;
  first_name: string;
  gold: string | number;
  id: string;
  level: number;
  photo_url: string | null;
  silver: string | number;
  username: string | null;
}

const BOSS_DUEL_COLUMNS = `
  id, challenger_id, opponent_kind, campaign_id, status,
  challenger_snapshot, opponent_snapshot,
  player_hp, enemy_hp,
  player_active_slots, enemy_active_slots,
  player_reserve_queue, enemy_reserve_queue,
  battle_log, turn_number, version, result, rewards_granted
`;

const NO_BOSS_MODIFIERS: Readonly<DuelBattleModifiers> = Object.freeze({
  battleDamagePct: 0,
  battleHpPct: 0,
  deckPowerPct: 0,
  elementDamagePct: Object.freeze({ fire: 0, water: 0, air: 0, earth: 0 }),
  experienceRewardPct: 0,
  silverRewardPct: 0,
});

export class CampaignBossLockedError extends Error {
  constructor() {
    super("Final boss unlocks only after all 36 Campaign quests are claimed");
    this.name = "CampaignBossLockedError";
  }
}

export class CampaignBossAlreadyCompletedError extends Error {
  constructor() {
    super("Campaign 1 has already been completed");
    this.name = "CampaignBossAlreadyCompletedError";
  }
}

export class CampaignBossBattleConflictError extends Error {
  constructor() {
    super("Campaign boss battle state is stale or another battle is active");
    this.name = "CampaignBossBattleConflictError";
  }
}

export class CampaignBossBattleMissingError extends Error {
  constructor() {
    super("Campaign boss battle does not exist");
    this.name = "CampaignBossBattleMissingError";
  }
}

export class CampaignBossConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CampaignBossConfigurationError";
  }
}

function toSafeInteger(value: string | number, field: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${field} returned by database`);
  return parsed;
}

function toPlayerSummary(row: PlayerRewardRow): PlayerSummary {
  return {
    id: row.id,
    username: row.username,
    firstName: row.first_name,
    photoUrl: row.photo_url,
    level: row.level,
    silver: toSafeInteger(row.silver, "boss silver"),
    gold: toSafeInteger(row.gold, "boss gold"),
  };
}

function toActiveCards(cards: DuelCardSnapshot[], field: string): [DuelCardSnapshot, DuelCardSnapshot, DuelCardSnapshot] {
  if (cards.length !== 3 || !cards[0] || !cards[1] || !cards[2]) {
    throw new Error(`Invalid ${field} stored for Campaign boss battle`);
  }
  return [cards[0], cards[1], cards[2]];
}

function toBossView(row: BossDuelRow): CampaignBossView {
  const result = row.result ?? undefined;
  return {
    battleId: row.id,
    version: row.version,
    status: row.status,
    turnNumber: row.turn_number,
    player: row.challenger_snapshot,
    opponent: {
      name: "Мантикора",
      photoUrl: null,
      level: row.opponent_snapshot.level,
      startingHp: row.opponent_snapshot.startingHp,
    },
    playerHp: row.player_hp,
    enemyHp: row.enemy_hp,
    playerMaxHp: row.challenger_snapshot.startingHp,
    enemyMaxHp: row.opponent_snapshot.startingHp,
    introDialogues: [...BOSS_INTRO_DIALOGUES],
    playerActiveCards: toActiveCards(row.player_active_slots, "player active slots"),
    enemyActiveCards: [
      { slotIndex: 0, hidden: true },
      { slotIndex: 1, hidden: true },
      { slotIndex: 2, hidden: true },
    ],
    battleLog: [...row.battle_log].reverse(),
    ...(result ? { result } : {}),
  };
}

function toCardDefinition(row: BossCardDefinitionRow): CardDefinition {
  return {
    id: row.id,
    code: row.code,
    displayName: row.display_name,
    artKey: row.art_key,
    element: row.element,
    collectionId: row.collection_id,
    minRarity: row.min_rarity,
    shopEligible: row.shop_eligible,
  };
}

async function loadBossSnapshot(client: Parameters<typeof loadDuelParticipant>[0]) {
  const codes = CAMPAIGN_BOSS_CARD_CONFIG.map(({ code }) => code);
  const result = await client.query<BossCardDefinitionRow>(
    `
      SELECT id, code, display_name, art_key, element, collection_id, min_rarity, shop_eligible
      FROM cards
      WHERE code = ANY($1::text[])
    `,
    [codes],
  );
  const byCode = new Map(result.rows.map((row) => [row.code, row]));
  const cards: DuelCardSnapshot[] = CAMPAIGN_BOSS_CARD_CONFIG.map(({ code, level }, index) => {
    const row = byCode.get(code);
    if (!row || !row.collection_id) {
      throw new CampaignBossConfigurationError(`Canonical Campaign boss card ${code} is missing`);
    }
    const basePower = getBasePowerForLevel(level);
    const bonusPower = 2;
    return {
      instanceId: `campaign-boss:${CAMPAIGN_ID}:${index + 1}`,
      cardId: row.id,
      code: row.code,
      displayName: row.display_name,
      artKey: row.art_key,
      element: row.element,
      level,
      basePower,
      bonusPower,
      finalPower: getCardPower({ level, bonusPower }),
      rarity: getRarityForLevel(level),
    };
  });
  if (!validateDeckElementBalance(cards).valid) {
    throw new CampaignBossConfigurationError("Campaign boss deck must use a valid 3/2/2/2 element mix");
  }
  const effectiveDeckPower = getDeckPower(cards);
  return {
    name: "Мантикора",
    photoUrl: null,
    level: Math.max(...CAMPAIGN_BOSS_CARD_CONFIG.map(({ level }) => level)),
    cards,
    modifiers: {
      ...NO_BOSS_MODIFIERS,
      elementDamagePct: { ...NO_BOSS_MODIFIERS.elementDamagePct },
    },
    effectiveDeckPower,
    startingHp: getStartingHp(effectiveDeckPower, 0),
  } satisfies DuelSideSnapshot;
}

export class CampaignBossService {
  private readonly cardRandom: IntegerRandomSource;

  constructor(
    private readonly pool: Pool,
    private readonly campaign: Pick<CampaignService, "recordEvent">,
    private readonly random: RandomSource = Math.random,
    cardRandom?: IntegerRandomSource,
  ) {
    this.cardRandom = cardRandom ?? new CryptoCardRandomSource();
  }

  async start(playerId: string): Promise<CampaignBossView> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
      const stateResult = await client.query<CampaignStateRow>(
        `SELECT completed_at, boss_reward_granted_at FROM player_campaign_state WHERE player_id = $1 FOR UPDATE`,
        [playerId],
      );
      const state = stateResult.rows[0];
      if (state?.completed_at || state?.boss_reward_granted_at) throw new CampaignBossAlreadyCompletedError();
      const claimedResult = await client.query<{ claimed: string }>(
        `
          SELECT COUNT(*) AS claimed
          FROM player_campaign_quest_progress
          WHERE player_id = $1 AND claimed_at IS NOT NULL AND quest_id = ANY($2::text[])
        `,
        [playerId, CAMPAIGN_STAGES.flatMap(({ quests }) => quests.map(({ id }) => id))],
      );
      if (Number(claimedResult.rows[0]?.claimed ?? 0) !== 36) throw new CampaignBossLockedError();

      const activeResult = await client.query<BossDuelRow>(
        `SELECT ${BOSS_DUEL_COLUMNS} FROM duels WHERE challenger_id = $1 AND status = 'active' FOR UPDATE`,
        [playerId],
      );
      const active = activeResult.rows[0];
      if (active) {
        if (active.opponent_kind !== "campaign_boss") throw new CampaignBossBattleConflictError();
        await client.query("COMMIT");
        return toBossView(active);
      }

      const challenger = await loadDuelParticipant(client, playerId);
      const opponent = await loadBossSnapshot(client);
      const playerPool = initializeCyclicCardPool(challenger.snapshot.cards, this.random);
      const enemyPool = initializeCyclicCardPool(opponent.cards, this.random);
      const battleId = randomUUID();
      const inserted = await client.query<BossDuelRow>(
        `
          INSERT INTO duels (
            id, challenger_id, opponent_id, opponent_kind, campaign_id, status,
            challenger_snapshot, opponent_snapshot,
            player_hp, enemy_hp,
            player_active_slots, enemy_active_slots,
            player_reserve_queue, enemy_reserve_queue
          )
          VALUES ($1, $2, NULL, 'campaign_boss', $3, 'active', $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING ${BOSS_DUEL_COLUMNS}
        `,
        [
          battleId,
          playerId,
          CAMPAIGN_ID,
          JSON.stringify(challenger.snapshot),
          JSON.stringify(opponent),
          challenger.snapshot.startingHp,
          opponent.startingHp,
          JSON.stringify(playerPool.activeCards),
          JSON.stringify(enemyPool.activeCards),
          JSON.stringify(playerPool.reserveQueue),
          JSON.stringify(enemyPool.reserveQueue),
        ],
      );
      await client.query("COMMIT");
      return toBossView(inserted.rows[0]!);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async findActive(playerId: string) {
    const result = await this.pool.query<BossDuelRow>(
      `SELECT ${BOSS_DUEL_COLUMNS} FROM duels WHERE challenger_id = $1 AND opponent_kind = 'campaign_boss' AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
      [playerId],
    );
    return result.rows[0] ? toBossView(result.rows[0]) : null;
  }

  async findById(playerId: string, battleId: string) {
    const result = await this.pool.query<BossDuelRow>(
      `SELECT ${BOSS_DUEL_COLUMNS} FROM duels WHERE id = $1 AND challenger_id = $2 AND opponent_kind = 'campaign_boss'`,
      [battleId, playerId],
    );
    if (!result.rows[0]) throw new CampaignBossBattleMissingError();
    return toBossView(result.rows[0]);
  }

  async action(
    playerId: string,
    battleId: string,
    input: { expectedVersion: number; slotIndex: 0 | 1 | 2 },
    now: Date = new Date(),
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const locked = await client.query<BossDuelRow>(
        `SELECT ${BOSS_DUEL_COLUMNS} FROM duels WHERE id = $1 AND challenger_id = $2 AND opponent_kind = 'campaign_boss' FOR UPDATE`,
        [battleId, playerId],
      );
      const duel = locked.rows[0];
      if (!duel) throw new CampaignBossBattleMissingError();
      if (duel.status !== "active" || duel.version !== input.expectedVersion) {
        throw new CampaignBossBattleConflictError();
      }
      const resolved = resolveDuelExchange({
        playerHp: duel.player_hp,
        enemyHp: duel.enemy_hp,
        playerPool: {
          activeCards: toActiveCards(duel.player_active_slots, "player active slots"),
          reserveQueue: duel.player_reserve_queue,
        },
        enemyPool: {
          activeCards: toActiveCards(duel.enemy_active_slots, "enemy active slots"),
          reserveQueue: duel.enemy_reserve_queue,
        },
        playerModifiers: duel.challenger_snapshot.modifiers,
        enemyModifiers: duel.opponent_snapshot.modifiers,
        slotIndex: input.slotIndex,
        turnNumber: duel.turn_number,
      });
      const battleLog = [...duel.battle_log, resolved.exchange].slice(-MAX_BATTLE_LOG_ENTRIES);
      let result: CampaignBossResult | null = null;
      let rewardsGranted = false;

      if (resolved.status !== "active") {
        const playerResult = await client.query<PlayerRewardRow>(
          `
            SELECT id, username, first_name, photo_url, level, silver, gold, account_xp
            FROM players WHERE id = $1 FOR UPDATE
          `,
          [playerId],
        );
        let player = playerResult.rows[0];
        if (!player) throw new CampaignBossBattleMissingError();
        const boost = await getAccountBoostStatus(client, playerId, now);
        if (resolved.status === "won") {
          const stateResult = await client.query<CampaignStateRow>(
            `SELECT completed_at, boss_reward_granted_at FROM player_campaign_state WHERE player_id = $1 FOR UPDATE`,
            [playerId],
          );
          const state = stateResult.rows[0];
          if (!state || state.completed_at || state.boss_reward_granted_at) {
            throw new CampaignBossBattleConflictError();
          }
          const reward = calculateBattleReward(
            CAMPAIGN_BOSS_BASE_XP,
            CAMPAIGN_BOSS_BASE_SILVER,
            duel.challenger_snapshot.modifiers,
            boost.multiplier,
          );
          const progression = applyAccountXp({
            level: player.level,
            xp: player.account_xp,
            gainedXp: reward.xp,
          });
          const nextSilver = toSafeInteger(player.silver, "boss silver") + reward.silver;
          const nextGold = toSafeInteger(player.gold, "boss gold") + progression.goldReward;
          if (!Number.isSafeInteger(nextSilver) || !Number.isSafeInteger(nextGold)) {
            throw new Error("Campaign boss reward exceeds safe balance limits");
          }
          const updatedPlayer = await client.query<PlayerRewardRow>(
            `
              UPDATE players
              SET level = $2, account_xp = $3, silver = $4, gold = $5, updated_at = $6
              WHERE id = $1
              RETURNING id, username, first_name, photo_url, level, silver, gold, account_xp
            `,
            [playerId, progression.newLevel, progression.remainingXp, nextSilver, nextGold, now],
          );
          player = updatedPlayer.rows[0]!;
          const manticoreDefinitionResult = await client.query<BossCardDefinitionRow>(
            `
              SELECT id, code, display_name, art_key, element, collection_id, min_rarity, shop_eligible
              FROM cards WHERE code = $1
            `,
            [MANTICORE_CARD_CODE],
          );
          const manticoreRow = manticoreDefinitionResult.rows[0];
          if (!manticoreRow || manticoreRow.display_name !== "Мантикора") {
            throw new CampaignBossConfigurationError("Canonical Мантикора card is missing");
          }
          const rewardCard = await createStandardCardInstance(
            client,
            playerId,
            toCardDefinition(manticoreRow),
            CAMPAIGN_BOSS_REWARD_LEVEL,
            this.cardRandom,
          );
          if (rewardCard.rarity !== "rare") {
            throw new CampaignBossConfigurationError("Lv15 Мантикора must derive Rare rarity");
          }
          const discovery = await recordCardDiscovery(client, playerId, manticoreRow.id);
          await recalculateAutomaticDeck(client, playerId);
          await this.campaign.recordEvent(client, playerId, "CARD_ACQUIRED", { rarity: rewardCard.rarity }, now);
          if (discovery.newDiscovery) {
            await this.campaign.recordEvent(client, playerId, "CARD_DISCOVERED", {}, now);
          }
          const campaignFinalized = await client.query(
            `
              UPDATE player_campaign_state
              SET completed_at = $2, boss_reward_granted_at = $2, updated_at = $2
              WHERE player_id = $1 AND completed_at IS NULL AND boss_reward_granted_at IS NULL
            `,
            [playerId, now],
          );
          if (campaignFinalized.rowCount !== 1) throw new CampaignBossBattleConflictError();
          result = {
            outcome: "win",
            xp: reward.xp,
            silver: reward.silver,
            gold: progression.goldReward,
            reachedLevels: progression.reachedLevels,
            player: toPlayerSummary(player),
            accountBoostMultiplier: boost.multiplier,
            boostExpiresAt: boost.expiresAt,
            dialogues: [...BOSS_VICTORY_DIALOGUES],
            rewardCard,
            newDiscovery: discovery.newDiscovery,
            ...(discovery.collectionCompleted ? { collectionCompleted: discovery.collectionCompleted } : {}),
          };
          rewardsGranted = true;
        } else {
          result = {
            outcome: "loss",
            xp: 0,
            silver: 0,
            gold: 0,
            reachedLevels: [],
            player: toPlayerSummary(player),
            accountBoostMultiplier: boost.multiplier,
            boostExpiresAt: boost.expiresAt,
          };
        }
      }

      const updated = await client.query<BossDuelRow>(
        `
          UPDATE duels
          SET player_hp = $2, enemy_hp = $3,
            player_active_slots = $4, enemy_active_slots = $5,
            player_reserve_queue = $6, enemy_reserve_queue = $7,
            battle_log = $8, turn_number = $9, version = version + 1,
            status = $10, result = $11, rewards_granted = $12,
            updated_at = $13::timestamptz,
            finished_at = CASE WHEN $10 = 'active' THEN NULL ELSE $13::timestamptz END
          WHERE id = $1
          RETURNING ${BOSS_DUEL_COLUMNS}
        `,
        [
          battleId,
          resolved.playerHp,
          resolved.enemyHp,
          JSON.stringify(resolved.playerPool.activeCards),
          JSON.stringify(resolved.enemyPool.activeCards),
          JSON.stringify(resolved.playerPool.reserveQueue),
          JSON.stringify(resolved.enemyPool.reserveQueue),
          JSON.stringify(battleLog),
          resolved.exchange.turnNumber,
          resolved.status,
          result ? JSON.stringify(result) : null,
          rewardsGranted,
          now,
        ],
      );
      await client.query("COMMIT");
      return toBossView(updated.rows[0]!);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
