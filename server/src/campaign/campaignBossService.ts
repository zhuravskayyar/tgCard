import { randomUUID } from "node:crypto";
import {
  applyAccountXp,
  calculateBattleReward,
  getBasePowerForLevel,
  getDeckPower,
  getRarityForLevel,
  getRequiredAccountXp,
  getPlayerCollectionModifiers,
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
import { getCompletedCollectionModifiers, recordCardDiscovery } from "../collections/discoveryService.js";
import { recalculateAutomaticDeck } from "../decks/automaticDeckService.js";
import { loadDuelParticipant } from "../duel/duelService.js";
import type { GuildActivityRecorder } from "../guild/guildService.js";
import { buildCampaignMap, type CampaignService } from "./campaignService.js";
import { getCampaignLocation, type CampaignLocation } from "./campaignLocations.js";


const MAX_BATTLE_LOG_ENTRIES = 10;

interface BossCardDefinitionRow {
  art_key: string | null;
  code: string;
  collection_id: string | null;
  description: string;
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
  player_damage_total: number | string;
  player_active_slots: DuelCardSnapshot[];
  player_hp: number;
  player_reserve_queue: DuelCardSnapshot[];
  result: CampaignBossResult | null;
  rewards_granted: boolean;
  status: DuelStatus;
  turn_number: number;
  version: number;
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
  battle_log, player_damage_total, turn_number, version, result, rewards_granted
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
    super("Complete this location’s trials before fighting its boss");
    this.name = "CampaignBossLockedError";
  }
}

export class CampaignBossAlreadyCompletedError extends Error {
  constructor() {
    super("This boss is respawning or outside the last three passed locations");
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
    accountXp: toSafeInteger(row.account_xp, "boss account XP"),
    accountXpRequired: getRequiredAccountXp(row.level),
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
    locationNumber: Number(row.campaign_id?.replace("location_", "")),
    version: row.version,
    status: row.status,
    turnNumber: row.turn_number,
    player: row.challenger_snapshot,
    opponent: {
      name: row.opponent_snapshot.name,
      photoUrl: null,
      level: row.opponent_snapshot.level,
      startingHp: row.opponent_snapshot.startingHp,
    },
    playerHp: row.player_hp,
    enemyHp: row.enemy_hp,
    playerMaxHp: row.challenger_snapshot.startingHp,
    enemyMaxHp: row.opponent_snapshot.startingHp,
    rewardsGranted: row.rewards_granted,
    introDialogues: [],
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
    description: row.description,
    displayName: row.display_name,
    artKey: row.art_key,
    element: row.element,
    collectionId: row.collection_id,
    minRarity: row.min_rarity,
    shopEligible: row.shop_eligible,
  };
}

async function loadBossSnapshot(client: Parameters<typeof loadDuelParticipant>[0], location: CampaignLocation) {
  const codes = location.boss.deck.map(({ code }) => code);
  const result = await client.query<BossCardDefinitionRow>(
    `
      SELECT id, code, display_name, art_key, element, collection_id, min_rarity, shop_eligible, description
      FROM cards
      WHERE code = ANY($1::text[])
    `,
    [codes],
  );
  const byCode = new Map(result.rows.map((row) => [row.code, row]));
  const cards: DuelCardSnapshot[] = location.boss.deck.map(({ code, power }, index) => {
    const level = location.boss.drop.level;
    const row = byCode.get(code);
    if (!row) {
      throw new CampaignBossConfigurationError(`Canonical Campaign boss card ${code} is missing`);
    }
    const basePower = getBasePowerForLevel(level);
    const bonusPower = 0;
    return {
      instanceId: `campaign-boss:${location.id}:${index + 1}`,
      cardId: row.id,
      code: row.code,
      displayName: row.display_name,
      artKey: row.art_key,
      element: row.element,
      level,
      basePower,
      bonusPower,
      finalPower: power,
      rarity: getRarityForLevel(level),
    };
  });
  if (!validateDeckElementBalance(cards).valid) {
    throw new CampaignBossConfigurationError("Campaign boss deck must use a valid 3/2/2/2 element mix");
  }
  const effectiveDeckPower = getDeckPower(cards);
  return {
    name: location.boss.name,
    photoUrl: null,
    level: location.boss.drop.level,
    cards,
    modifiers: {
      ...NO_BOSS_MODIFIERS,
      elementDamagePct: { ...NO_BOSS_MODIFIERS.elementDamagePct },
    },
    effectiveDeckPower,
    startingHp: effectiveDeckPower,
  } satisfies DuelSideSnapshot;
}

export class CampaignBossService {
  private readonly cardRandom: IntegerRandomSource;

  constructor(
    private readonly pool: Pool,
    private readonly campaign: Pick<CampaignService, "recordEvent">,
    private readonly random: RandomSource = Math.random,
    cardRandom?: IntegerRandomSource,
    private readonly guildActivity?: GuildActivityRecorder,
  ) {
    this.cardRandom = cardRandom ?? new CryptoCardRandomSource();
  }

  async start(playerId: string, locationNumber: number, now = new Date()): Promise<CampaignBossView> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const location = getCampaignLocation(locationNumber);
      if (!location) throw new CampaignBossLockedError();
      await client.query("SELECT id FROM players WHERE id = $1 FOR UPDATE", [playerId]);
      const activeResult = await client.query<BossDuelRow>(
        `SELECT ${BOSS_DUEL_COLUMNS} FROM duels
         WHERE challenger_id = $1 AND (
           status = 'active' OR (opponent_kind = 'campaign_boss' AND status <> 'active' AND rewards_granted = FALSE)
         ) FOR UPDATE`,
        [playerId],
      );
      const active = activeResult.rows[0];
      if (active) {
        if (active.opponent_kind !== "campaign_boss" || active.campaign_id !== location.id) throw new CampaignBossBattleConflictError();
        await client.query("COMMIT");
        return toBossView(active);
      }

      const map = await buildCampaignMap(client, playerId, now);
      const entry = map.locations.find(row => row.number === locationNumber);
      if (!entry) throw new CampaignBossLockedError();
      if (!entry.boss.canFight) {
        if (entry.state === "passed") throw new CampaignBossAlreadyCompletedError();
        throw new CampaignBossLockedError();
      }
      const challenger = await loadDuelParticipant(client, playerId, "campaign");
      const opponent = await loadBossSnapshot(client, location);
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
          location.id,
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
      `SELECT ${BOSS_DUEL_COLUMNS} FROM duels
       WHERE challenger_id = $1 AND opponent_kind = 'campaign_boss'
         AND (status = 'active' OR (status <> 'active' AND rewards_granted = FALSE))
       ORDER BY created_at DESC LIMIT 1`,
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

  async claimRewards(playerId: string, battleId: string, now = new Date()) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT id FROM players WHERE id = $1 FOR UPDATE", [playerId]);
      const locked = await client.query<BossDuelRow>(
        `SELECT ${BOSS_DUEL_COLUMNS} FROM duels WHERE id = $1 AND challenger_id = $2 AND opponent_kind = 'campaign_boss' FOR UPDATE`,
        [battleId, playerId],
      );
      const duel = locked.rows[0];
      if (!duel) throw new CampaignBossBattleMissingError();
      if (duel.status === "active") throw new CampaignBossBattleConflictError();
      if (duel.rewards_granted) {
        await client.query("COMMIT");
        return toBossView(duel);
      }

      const location = getCampaignLocation(Number(duel.campaign_id?.replace("location_", "")));
      if (!location) throw new CampaignBossBattleMissingError();
      const playerResult = await client.query<PlayerRewardRow>(
        `SELECT id, username, first_name, photo_url, level, silver, gold, account_xp
         FROM players WHERE id = $1 FOR UPDATE`,
        [playerId],
      );
      let player = playerResult.rows[0];
      if (!player) throw new CampaignBossBattleMissingError();
      const boost = await getAccountBoostStatus(client, playerId, now);
      const currentModifiers = getPlayerCollectionModifiers(
        await getCompletedCollectionModifiers(client, playerId),
        "campaign",
      );
      const won = duel.status === "won";
      const existingWin = await client.query(
        "SELECT first_win_at FROM player_campaign_locations WHERE player_id = $1 AND location_number = $2",
        [playerId, location.number],
      );
      const firstWin = won && existingWin.rowCount === 0;
      const reward = calculateBattleReward(toSafeInteger(duel.player_damage_total, "Boss player damage total"), 0, currentModifiers, boost.multiplier);
      const progression = applyAccountXp({ level: player.level, xp: toSafeInteger(player.account_xp, "boss account XP"), gainedXp: reward.xp });
      const silver = firstWin ? location.boss.firstWin.silver : 0;
      const gold = (firstWin ? location.boss.firstWin.gold : 0) + progression.goldReward;
      const updatedPlayer = await client.query<PlayerRewardRow>(`
        UPDATE players SET level = $2, account_xp = $3, silver = silver + $4, gold = gold + $5, updated_at = $6
        WHERE id = $1 RETURNING id, username, first_name, photo_url, level, silver, gold, account_xp
      `, [playerId, progression.newLevel, progression.remainingXp, silver, gold, now]);
      player = updatedPlayer.rows[0]!;
      await this.guildActivity?.recordActivity(client, playerId, won ? "campaign_win" : "campaign_loss", `campaign:${battleId}`, reward.xp, now);
      const result: CampaignBossResult = {
        outcome: won ? "win" : "loss", xp: reward.xp, silver, gold,
        reachedLevels: progression.reachedLevels, player: toPlayerSummary(player),
        accountBoostMultiplier: boost.multiplier, boostExpiresAt: boost.expiresAt,
        firstWin, respawnHours: location.boss.respawnHours,
        ...(won ? { thanks: location.boss.thanks } : {}),
      };

      if (won) {
        const definitions = await client.query<BossCardDefinitionRow>(`
          SELECT id, code, display_name, art_key, element, collection_id, min_rarity, shop_eligible, description
          FROM cards WHERE shop_eligible = TRUE ORDER BY code
        `);
        if (!definitions.rows.length) throw new CampaignBossConfigurationError("No eligible campaign drop cards");
        const definition = definitions.rows[this.cardRandom.nextInt(definitions.rows.length)]!;
        const rewardCard = await createStandardCardInstance(client, playerId, toCardDefinition(definition), location.boss.drop.level, this.cardRandom);
        if (rewardCard.rarity !== location.boss.drop.rarity) throw new CampaignBossConfigurationError("Campaign drop level and rarity disagree");
        const discovery = await recordCardDiscovery(client, playerId, definition.id);
        const deckResult = await recalculateAutomaticDeck(client, playerId);
        const inDeck = await client.query("SELECT 1 FROM deck_slots WHERE card_instance_id = $1", [rewardCard.instanceId]);
        await this.campaign.recordEvent(client, playerId, "CARD_ACQUIRED", { rarity: rewardCard.rarity, location: location.number }, now);
        await this.campaign.recordEvent(client, playerId, "CAMPAIGN_CARD_DROP", { rarity: rewardCard.rarity, location: location.number }, now);
        if (discovery.newDiscovery) await this.campaign.recordEvent(client, playerId, "CARD_DISCOVERED", {}, now);
        await client.query(`
          INSERT INTO player_campaign_locations (player_id, location_number, first_win_at, last_win_at) VALUES ($1, $2, $3, $3)
          ON CONFLICT (player_id, location_number) DO UPDATE SET last_win_at = EXCLUDED.last_win_at
        `, [playerId, location.number, now]);
        Object.assign(result, {
          rewardCard, cardIsWeak: inDeck.rowCount === 0, newDiscovery: discovery.newDiscovery,
          ...(deckResult.status !== "insufficient_valid_cards" ? { deckPower: deckResult.totalPower } : {}),
          ...(discovery.collectionCompleted ? { collectionCompleted: discovery.collectionCompleted } : {}),
        });
      }

      const updated = await client.query<BossDuelRow>(
        `UPDATE duels SET result = $2, rewards_granted = TRUE, updated_at = $3
         WHERE id = $1 RETURNING ${BOSS_DUEL_COLUMNS}`,
        [battleId, JSON.stringify(result), now],
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

  async action(
    playerId: string,
    battleId: string,
    input: { expectedVersion: number; slotIndex: 0 | 1 | 2 },
    now: Date = new Date(),
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT id FROM players WHERE id = $1 FOR UPDATE", [playerId]);
      const locked = await client.query<BossDuelRow>(
        `SELECT ${BOSS_DUEL_COLUMNS} FROM duels WHERE id = $1 AND challenger_id = $2 AND opponent_kind = 'campaign_boss' FOR UPDATE`,
        [battleId, playerId],
      );
      const duel = locked.rows[0];
      if (!duel) throw new CampaignBossBattleMissingError();
      const location = getCampaignLocation(Number(duel.campaign_id?.replace("location_", "")));
      if (!location) throw new CampaignBossBattleMissingError();
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
        // Artifacts work only in the arena, tournament and guild war (source rules).
        equipmentEnabled: false,
        slotIndex: input.slotIndex,
        turnNumber: duel.turn_number,
      });
      const battleLog = [...duel.battle_log, resolved.exchange].slice(-MAX_BATTLE_LOG_ENTRIES);
      const previousPlayerDamage = toSafeInteger(duel.player_damage_total, "Boss player damage total");
      const playerDamageTotal = previousPlayerDamage + resolved.exchange.playerDamage;
      if (!Number.isSafeInteger(playerDamageTotal)) throw new Error("Boss player damage total exceeds safe integer limits");
      const result: CampaignBossResult | null = null;
      const rewardsGranted = false;

      const updated = await client.query<BossDuelRow>(
        `
          UPDATE duels
          SET player_hp = $2, enemy_hp = $3,
            player_active_slots = $4, enemy_active_slots = $5,
            player_reserve_queue = $6, enemy_reserve_queue = $7,
            battle_log = $8, player_damage_total = $9, turn_number = $10, version = version + 1,
            status = $11, result = $12, rewards_granted = $13,
            updated_at = $14::timestamptz,
            finished_at = CASE WHEN $11 = 'active' THEN NULL ELSE $14::timestamptz END
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
          playerDamageTotal,
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
