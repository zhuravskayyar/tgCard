import { randomUUID } from "node:crypto";
import {
  applyAccountXp,
  applyDuelOutcomeToStats,
  calculateDuelReward,
  getDeckPower,
  getEffectiveDeckPower,
  getElementMultiplier,
  getMatchmakingRange,
  getPlayerCollectionModifiers,
  getStartingHp,
  initializeCyclicCardPool,
  isDeckPowerInMatchmakingRange,
  resolveDuelExchange,
  validateDeckElementBalance,
  type CyclicCardPool,
  type RandomSource,
} from "@cardastika/game-core";
import type {
  CardElement,
  CollectionModifier,
  CollectionModifierType,
  DuelBattleModifiers,
  DuelCardSnapshot,
  DuelExchange,
  DuelOpponentPreview,
  DuelOutcome,
  DuelResult,
  DuelSearchResponse,
  DuelSideSnapshot,
  DuelStatus,
  DuelView,
  PlayerSummary,
} from "@cardastika/shared";
import type { Pool, PoolClient } from "pg";
import {
  mapCardInstanceRow,
  type CardInstanceProjectionRow,
} from "../cards/cardInstanceMapper.js";
import {
  createBotOpponentSnapshot,
  type BotCardTemplate,
} from "./botOpponent.js";

const SEARCH_LIFETIME_MS = 10 * 60 * 1_000;
const MAX_BATTLE_LOG_ENTRIES = 10;

interface ParticipantRow {
  account_xp: number;
  duel_losses: number;
  duel_win_streak: number;
  duel_wins: number;
  first_name: string;
  gold: string | number;
  id: string;
  level: number;
  photo_url: string | null;
  silver: string | number;
  username: string | null;
}

interface DeckCardRow extends CardInstanceProjectionRow {
  slot: number;
}

interface ModifierRow {
  buff_element: CardElement | null;
  buff_type: CollectionModifierType;
  buff_value: number | string;
}

interface BotCardRow {
  art_key: string | null;
  display_name: string | null;
  element: CardElement;
  id: string;
  code: string;
}

interface SearchRow {
  opponent_id: string | null;
  opponent_kind: "bot" | "real";
  opponent_snapshot: DuelSideSnapshot | null;
}

interface DuelRow {
  battle_log: DuelExchange[];
  challenger_id: string;
  challenger_snapshot: DuelSideSnapshot;
  enemy_active_slots: DuelCardSnapshot[];
  enemy_hp: number;
  enemy_reserve_queue: DuelCardSnapshot[];
  id: string;
  opponent_id: string | null;
  opponent_snapshot: DuelSideSnapshot;
  player_active_slots: DuelCardSnapshot[];
  player_hp: number;
  player_reserve_queue: DuelCardSnapshot[];
  result: DuelResult | null;
  rewards_granted: boolean;
  status: DuelStatus;
  turn_number: number;
  version: number;
}

interface LoadedParticipant {
  player: ParticipantRow;
  snapshot: DuelSideSnapshot;
}

const DUEL_COLUMNS = `
  id, challenger_id, opponent_id, status,
  challenger_snapshot, opponent_snapshot,
  player_hp, enemy_hp,
  player_active_slots, enemy_active_slots,
  player_reserve_queue, enemy_reserve_queue,
  battle_log, turn_number, version, result, rewards_granted
`;

export class DuelNoOpponentFoundError extends Error {
  constructor() {
    super("No eligible opponent was found");
    this.name = "DuelNoOpponentFoundError";
  }
}

export class DuelAlreadyActiveError extends Error {
  constructor() {
    super("Player already has an active Duel");
    this.name = "DuelAlreadyActiveError";
  }
}

export class DuelDeckInvalidError extends Error {
  constructor() {
    super("Player does not have a valid automatic battle deck");
    this.name = "DuelDeckInvalidError";
  }
}

export class DuelSearchInvalidError extends Error {
  constructor() {
    super("Matchmaking search is missing, expired, or already used");
    this.name = "DuelSearchInvalidError";
  }
}

export class DuelMissingError extends Error {
  constructor() {
    super("Duel does not exist");
    this.name = "DuelMissingError";
  }
}

export class DuelStateConflictError extends Error {
  constructor() {
    super("Duel state version is stale or the Duel is already finished");
    this.name = "DuelStateConflictError";
  }
}

function toSafeInteger(value: string | number, field: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${field} returned by database`);
  return parsed;
}

function toBattleModifiers(modifiers: readonly CollectionModifier[]): DuelBattleModifiers {
  const aggregated = getPlayerCollectionModifiers(modifiers);
  return {
    battleDamagePct: aggregated.battleDamagePct,
    battleHpPct: aggregated.battleHpPct,
    deckPowerPct: aggregated.deckPowerPct,
    elementDamagePct: { ...aggregated.elementDamagePct },
    experienceRewardPct: aggregated.experienceRewardPct,
    silverRewardPct: aggregated.silverRewardPct,
  };
}

function toDuelCard(row: DeckCardRow): DuelCardSnapshot {
  const instance = mapCardInstanceRow(row);
  return {
    instanceId: instance.instanceId,
    cardId: instance.cardId,
    code: instance.code,
    displayName: instance.displayName,
    artKey: instance.artKey,
    element: instance.element,
    level: instance.level,
    basePower: instance.basePower,
    bonusPower: instance.bonusPower,
    finalPower: instance.finalPower,
    rarity: instance.rarity,
  };
}

function toPlayerSummary(row: ParticipantRow): PlayerSummary {
  return {
    id: row.id,
    username: row.username,
    firstName: row.first_name,
    photoUrl: row.photo_url,
    level: row.level,
    silver: toSafeInteger(row.silver, "Silver"),
    gold: toSafeInteger(row.gold, "Gold"),
  };
}

function toActiveCards(cards: DuelCardSnapshot[], field: string): [DuelCardSnapshot, DuelCardSnapshot, DuelCardSnapshot] {
  if (cards.length !== 3 || !cards[0] || !cards[1] || !cards[2]) {
    throw new Error(`Invalid ${field} stored for Duel`);
  }
  return [cards[0], cards[1], cards[2]];
}

function toDuelView(row: DuelRow): DuelView {
  const playerActiveCards = toActiveCards(row.player_active_slots, "player active slots");
  const enemyActiveCards = toActiveCards(row.enemy_active_slots, "enemy active slots");
  return {
    duelId: row.id,
    version: row.version,
    status: row.status,
    turnNumber: row.turn_number,
    player: row.challenger_snapshot,
    opponent: row.opponent_snapshot,
    playerHp: row.player_hp,
    enemyHp: row.enemy_hp,
    playerMaxHp: row.challenger_snapshot.startingHp,
    enemyMaxHp: row.opponent_snapshot.startingHp,
    playerActiveCards,
    enemyActiveCards,
    pairMultipliers: [
      getElementMultiplier(playerActiveCards[0].element, enemyActiveCards[0].element),
      getElementMultiplier(playerActiveCards[1].element, enemyActiveCards[1].element),
      getElementMultiplier(playerActiveCards[2].element, enemyActiveCards[2].element),
    ],
    battleLog: [...row.battle_log].reverse(),
    ...(row.result ? { result: row.result } : {}),
  };
}

async function loadParticipant(client: PoolClient, playerId: string): Promise<LoadedParticipant> {
  const playerResult = await client.query<ParticipantRow>(
    `
      SELECT id, username, first_name, photo_url, level, silver, gold,
        account_xp, duel_wins, duel_losses, duel_win_streak
      FROM players
      WHERE id = $1
    `,
    [playerId],
  );
  const player = playerResult.rows[0];
  if (!player) throw new DuelDeckInvalidError();

  const cardsResult = await client.query<DeckCardRow>(
    `
      SELECT
        deck_slots.slot,
        player_card_instances.id AS instance_id,
        cards.id AS card_id,
        cards.code,
        cards.display_name,
        cards.art_key,
        cards.element,
        player_card_instances.level,
        player_card_instances.bonus_power,
        player_card_instances.level_progress_elements,
        player_card_instances.stored_elements,
        cards.collection_id
      FROM player_decks
      INNER JOIN deck_slots ON deck_slots.deck_id = player_decks.id
      INNER JOIN player_card_instances ON player_card_instances.id = deck_slots.card_instance_id
      INNER JOIN cards ON cards.id = player_card_instances.card_id
      WHERE player_decks.player_id = $1
      ORDER BY deck_slots.slot
    `,
    [playerId],
  );
  const cards = cardsResult.rows.map(toDuelCard);
  const slotsAreSequential = cardsResult.rows.every(({ slot }, index) => slot === index + 1);
  if (!slotsAreSequential || !validateDeckElementBalance(cards).valid) throw new DuelDeckInvalidError();

  const modifiersResult = await client.query<ModifierRow>(
    `
      SELECT collections.buff_type, collections.buff_value, collections.buff_element
      FROM player_collection_completions
      INNER JOIN collections ON collections.id = player_collection_completions.collection_id
      WHERE player_collection_completions.player_id = $1
      ORDER BY collections.position
    `,
    [playerId],
  );
  const modifiers = toBattleModifiers(modifiersResult.rows.map((row) => ({
    type: row.buff_type,
    value: Number(row.buff_value),
    ...(row.buff_element ? { element: row.buff_element } : {}),
  })));
  const effectiveDeckPower = getEffectiveDeckPower(getDeckPower(cards), modifiers.deckPowerPct);
  return {
    player,
    snapshot: {
      name: player.first_name,
      photoUrl: player.photo_url,
      level: player.level,
      cards,
      modifiers,
      effectiveDeckPower,
      startingHp: getStartingHp(effectiveDeckPower, modifiers.battleHpPct),
    },
  };
}

async function loadBotCardTemplates(client: PoolClient): Promise<BotCardTemplate[]> {
  const result = await client.query<BotCardRow>(
    "SELECT id, code, display_name, art_key, element FROM cards ORDER BY element, id",
  );
  return result.rows.map((row) => ({
    cardId: row.id,
    code: row.code,
    displayName: row.display_name,
    artKey: row.art_key,
    element: row.element,
  }));
}

export class DuelService {
  constructor(
    private readonly pool: Pool,
    private readonly random: RandomSource = Math.random,
  ) {}

  async search(challengerId: string): Promise<DuelSearchResponse> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
      const active = await client.query("SELECT 1 FROM duels WHERE challenger_id = $1 AND status = 'active'", [challengerId]);
      if (active.rowCount) throw new DuelAlreadyActiveError();

      const challenger = await loadParticipant(client, challengerId);
      const range = getMatchmakingRange(
        challenger.snapshot.effectiveDeckPower,
        challenger.player.duel_win_streak,
      );
      const opponentSnapshot = createBotOpponentSnapshot(
        challenger.snapshot,
        range,
        await loadBotCardTemplates(client),
        this.random,
      );

      const searchId = randomUUID();
      await client.query(
        "DELETE FROM duel_matchmaking_searches WHERE challenger_id = $1",
        [challengerId],
      );
      await client.query(
        `
          INSERT INTO duel_matchmaking_searches (
            id, challenger_id, opponent_id, opponent_kind, opponent_snapshot, expires_at
          )
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          searchId,
          challengerId,
          null,
          "bot",
          JSON.stringify(opponentSnapshot),
          new Date(Date.now() + SEARCH_LIFETIME_MS),
        ],
      );
      await client.query("COMMIT");
      const preview: DuelOpponentPreview = {
        name: opponentSnapshot.name,
        photoUrl: opponentSnapshot.photoUrl,
        level: opponentSnapshot.level,
        effectiveDeckPower: opponentSnapshot.effectiveDeckPower,
        powerDifferencePct: Math.round(
          (opponentSnapshot.effectiveDeckPower - challenger.snapshot.effectiveDeckPower)
          / challenger.snapshot.effectiveDeckPower * 100,
        ),
      };
      return { searchId, opponent: preview };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async start(challengerId: string, searchId: string): Promise<DuelView> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
      const active = await client.query("SELECT 1 FROM duels WHERE challenger_id = $1 AND status = 'active'", [challengerId]);
      if (active.rowCount) throw new DuelAlreadyActiveError();
      const searchResult = await client.query<SearchRow>(
        `
          SELECT opponent_id, opponent_kind, opponent_snapshot
          FROM duel_matchmaking_searches
          WHERE id = $1 AND challenger_id = $2 AND used_at IS NULL AND expires_at > NOW()
          FOR UPDATE
        `,
        [searchId, challengerId],
      );
      const search = searchResult.rows[0];
      if (!search) throw new DuelSearchInvalidError();

      const challenger = await loadParticipant(client, challengerId);
      let opponentSnapshot: DuelSideSnapshot;
      if (search.opponent_kind === "bot") {
        if (!search.opponent_snapshot || search.opponent_id) throw new DuelSearchInvalidError();
        opponentSnapshot = search.opponent_snapshot;
      } else {
        if (!search.opponent_id || search.opponent_snapshot) throw new DuelSearchInvalidError();
        opponentSnapshot = (await loadParticipant(client, search.opponent_id)).snapshot;
      }
      const range = getMatchmakingRange(challenger.snapshot.effectiveDeckPower, challenger.player.duel_win_streak);
      if (!isDeckPowerInMatchmakingRange(opponentSnapshot.effectiveDeckPower, range)) {
        throw new DuelNoOpponentFoundError();
      }

      const playerPool = initializeCyclicCardPool(challenger.snapshot.cards, this.random);
      const enemyPool = initializeCyclicCardPool(opponentSnapshot.cards, this.random);
      const duelId = randomUUID();
      const inserted = await client.query<DuelRow>(
        `
          INSERT INTO duels (
            id, challenger_id, opponent_id, opponent_kind, status,
            challenger_snapshot, opponent_snapshot,
            player_hp, enemy_hp,
            player_active_slots, enemy_active_slots,
            player_reserve_queue, enemy_reserve_queue
          )
          VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING ${DUEL_COLUMNS}
        `,
        [
          duelId,
          challengerId,
          search.opponent_id,
          search.opponent_kind,
          JSON.stringify(challenger.snapshot),
          JSON.stringify(opponentSnapshot),
          challenger.snapshot.startingHp,
          opponentSnapshot.startingHp,
          JSON.stringify(playerPool.activeCards),
          JSON.stringify(enemyPool.activeCards),
          JSON.stringify(playerPool.reserveQueue),
          JSON.stringify(enemyPool.reserveQueue),
        ],
      );
      await client.query("UPDATE duel_matchmaking_searches SET used_at = NOW() WHERE id = $1", [searchId]);
      await client.query("COMMIT");
      return toDuelView(inserted.rows[0]!);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async findActive(challengerId: string): Promise<DuelView | null> {
    const result = await this.pool.query<DuelRow>(
      `SELECT ${DUEL_COLUMNS} FROM duels WHERE challenger_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
      [challengerId],
    );
    return result.rows[0] ? toDuelView(result.rows[0]) : null;
  }

  async findById(challengerId: string, duelId: string): Promise<DuelView> {
    const result = await this.pool.query<DuelRow>(
      `SELECT ${DUEL_COLUMNS} FROM duels WHERE id = $1 AND challenger_id = $2`,
      [duelId, challengerId],
    );
    if (!result.rows[0]) throw new DuelMissingError();
    return toDuelView(result.rows[0]);
  }

  async action(
    challengerId: string,
    duelId: string,
    input: { expectedVersion: number; slotIndex: 0 | 1 | 2 },
  ): Promise<DuelView> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const locked = await client.query<DuelRow>(
        `SELECT ${DUEL_COLUMNS} FROM duels WHERE id = $1 AND challenger_id = $2 FOR UPDATE`,
        [duelId, challengerId],
      );
      const duel = locked.rows[0];
      if (!duel) throw new DuelMissingError();
      if (duel.status !== "active" || duel.version !== input.expectedVersion) {
        throw new DuelStateConflictError();
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
      let result: DuelResult | null = null;
      let rewardsGranted = false;

      if (resolved.status !== "active") {
        const outcome: DuelOutcome = resolved.status === "won" ? "win" : "loss";
        const playerResult = await client.query<ParticipantRow>(
          `
            SELECT id, username, first_name, photo_url, level, silver, gold,
              account_xp, duel_wins, duel_losses, duel_win_streak
            FROM players
            WHERE id = $1
            FOR UPDATE
          `,
          [challengerId],
        );
        const player = playerResult.rows[0];
        if (!player) throw new DuelMissingError();
        const reward = calculateDuelReward(player.level, outcome, duel.challenger_snapshot.modifiers);
        const progression = applyAccountXp({
          level: player.level,
          xp: player.account_xp,
          gainedXp: reward.xp,
        });
        const stats = applyDuelOutcomeToStats({
          duelWins: player.duel_wins,
          duelLosses: player.duel_losses,
          duelWinStreak: player.duel_win_streak,
        }, outcome);
        const nextSilver = toSafeInteger(player.silver, "Silver") + reward.silver;
        const nextGold = toSafeInteger(player.gold, "Gold") + progression.goldReward;
        if (!Number.isSafeInteger(nextSilver) || !Number.isSafeInteger(nextGold)) {
          throw new Error("Duel reward exceeds safe currency limits");
        }
        const updatedPlayerResult = await client.query<ParticipantRow>(
          `
            UPDATE players
            SET level = $2,
              account_xp = $3,
              silver = $4,
              gold = $5,
              duel_wins = $6,
              duel_losses = $7,
              duel_win_streak = $8,
              updated_at = NOW()
            WHERE id = $1
            RETURNING id, username, first_name, photo_url, level, silver, gold,
              account_xp, duel_wins, duel_losses, duel_win_streak
          `,
          [
            challengerId,
            progression.newLevel,
            progression.remainingXp,
            nextSilver,
            nextGold,
            stats.duelWins,
            stats.duelLosses,
            stats.duelWinStreak,
          ],
        );
        result = {
          outcome,
          xp: reward.xp,
          silver: reward.silver,
          gold: progression.goldReward,
          reachedLevels: progression.reachedLevels,
          winStreak: stats.duelWinStreak,
          player: toPlayerSummary(updatedPlayerResult.rows[0]!),
        };
        rewardsGranted = true;
      }

      const updated = await client.query<DuelRow>(
        `
          UPDATE duels
          SET player_hp = $2,
            enemy_hp = $3,
            player_active_slots = $4,
            enemy_active_slots = $5,
            player_reserve_queue = $6,
            enemy_reserve_queue = $7,
            battle_log = $8,
            turn_number = $9,
            version = version + 1,
            status = $10,
            result = $11,
            rewards_granted = $12,
            updated_at = NOW(),
            finished_at = CASE WHEN $10 = 'active' THEN NULL ELSE NOW() END
          WHERE id = $1
          RETURNING ${DUEL_COLUMNS}
        `,
        [
          duelId,
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
        ],
      );
      await client.query("COMMIT");
      return toDuelView(updated.rows[0]!);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
