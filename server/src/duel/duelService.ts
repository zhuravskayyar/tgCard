import { randomUUID } from "node:crypto";
import {
  applyAccountXp,
  applyDuelOutcomeToStats,
  calculateEquipmentSummary,
  calculateDuelReward,
  getDuelGoldReward,
  getDeckPower,
  getEffectiveDeckPower,
  getElementMultiplier,
  getEquipmentBattleModifiers,
  getEquippedDefinitions,
  getRequiredAccountXp,
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
import { applyLeagueProgression } from "@cardastika/shared";
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
import { getAccountBoostStatus } from "../boosts/accountBoost.js";
import { getCurrencyBoostStatus } from "../boosts/currencyBoost.js";
import { getCompletedCollectionModifiers } from "../collections/discoveryService.js";
import { parseStoredEquipment } from "../equipment/equipmentState.js";
import type { CampaignService } from "../campaign/campaignService.js";
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
const TUTORIAL_PLAYER_POWERS = [12, 12, 12, 12, 12, 12, 12, 12, 12] as const;
const TUTORIAL_ENEMY_POWERS = [12, 12, 12, 12, 12, 12, 12, 12, 12] as const;
const CARD_ELEMENTS: readonly CardElement[] = ["fire", "water", "air", "earth"];

interface ParticipantRow {
  account_xp: number;
  duel_gold_day: string | Date;
  duel_gold_earned_today: number;
  duel_gold_level: number;
  duel_losses: number;
  duel_highest_league_index: number;
  duel_rating: number;
  duel_win_streak: number;
  duel_wins: number;
  first_name: string;
  gold: string | number;
  id: string;
  level: number;
  photo_url: string | null;
  silver: string | number;
  tutorial_eligible: boolean;
  username: string | null;
  equipment: unknown;
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
  tutorial_mode: boolean;
  player_damage_total: number | string;
  player_active_slots: DuelCardSnapshot[];
  player_hp: number;
  player_reserve_queue: DuelCardSnapshot[];
  result: DuelResult | null;
  rewards_granted: boolean;
  status: DuelStatus;
  turn_number: number;
  version: number;
}

export interface LoadedParticipant {
  player: ParticipantRow;
  snapshot: DuelSideSnapshot;
}

const DUEL_COLUMNS = `
  id, challenger_id, opponent_id, status,
  tutorial_mode,
  challenger_snapshot, opponent_snapshot,
  player_hp, enemy_hp,
  player_active_slots, enemy_active_slots,
  player_reserve_queue, enemy_reserve_queue,
  battle_log, player_damage_total, turn_number, version, result, rewards_granted
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

export class DuelTutorialActionError extends Error {
  constructor() {
    super("This tutorial action is not available yet");
    this.name = "DuelTutorialActionError";
  }
}

function toSafeInteger(value: string | number, field: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${field} returned by database`);
  return parsed;
}

function toBattleModifiers(modifiers: readonly CollectionModifier[], equipmentSummary?: ReturnType<typeof calculateEquipmentSummary>): DuelBattleModifiers {
  const aggregated = getPlayerCollectionModifiers(modifiers);
  return {
    battleDamagePct: aggregated.battleDamagePct,
    battleHpPct: aggregated.battleHpPct,
    deckPowerPct: aggregated.deckPowerPct,
    elementDamagePct: { ...aggregated.elementDamagePct },
    experienceRewardPct: aggregated.experienceRewardPct,
    silverRewardPct: aggregated.silverRewardPct,
    ...(equipmentSummary ? {
      equipment: getEquipmentBattleModifiers(equipmentSummary),
      equipmentState: { reviveUsed: false, voodooUsed: false },
    } : {}),
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
    limited: instance.limited ?? false,
  };
}

function tutorialModifiers(): DuelBattleModifiers {
  return {
    battleDamagePct: 0,
    battleHpPct: 0,
    deckPowerPct: 0,
    elementDamagePct: { fire: 0, water: 0, air: 0, earth: 0 },
    experienceRewardPct: 0,
    silverRewardPct: 0,
  };
}

function elementForMultiplier(attacker: CardElement, multiplier: 0.5 | 1 | 1.5) {
  return CARD_ELEMENTS.find((defender) => getElementMultiplier(attacker, defender) === multiplier) ?? attacker;
}

function withTutorialPower(card: DuelCardSnapshot, finalPower: number, element = card.element): DuelCardSnapshot {
  return {
    ...card,
    basePower: finalPower,
    bonusPower: 0,
    element,
    finalPower,
  };
}

function createTutorialSnapshot(snapshot: DuelSideSnapshot, powers: readonly number[], enemy = false, targetElements?: readonly CardElement[]): DuelSideSnapshot {
  const cards = snapshot.cards.map((card, index) => {
    const desiredMultiplier: 0.5 | 1 | 1.5 = index === 0 ? 1.5 : index === 1 ? 1 : 0.5;
    const element = enemy && index < 3 && targetElements?.[index]
      ? elementForMultiplier(targetElements[index]!, desiredMultiplier)
      : card.element;
    return withTutorialPower(card, powers[index] ?? powers[powers.length - 1]!, element);
  });
  return {
    ...snapshot,
    cards,
    effectiveDeckPower: enemy ? 35 : 180,
    modifiers: tutorialModifiers(),
    startingHp: enemy ? 35 : 180,
  };
}

function createTutorialPool(cards: DuelCardSnapshot[]): CyclicCardPool<DuelCardSnapshot> {
  if (cards.length !== 9 || !cards[0] || !cards[1] || !cards[2]) {
    throw new DuelDeckInvalidError();
  }
  return {
    activeCards: [cards[0], cards[1], cards[2]],
    reserveQueue: cards.slice(3),
  };
}

function toPlayerSummary(row: ParticipantRow): PlayerSummary {
  return {
    accountXp: toSafeInteger(row.account_xp, "Account XP"),
    duelWins: toSafeInteger(row.duel_wins, "Duel wins"),
    accountXpRequired: getRequiredAccountXp(row.level),
    duelHighestLeagueIndex: toSafeInteger(row.duel_highest_league_index, "Duel highest league index"),
    duelRating: toSafeInteger(row.duel_rating, "Duel rating"),
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

export async function loadDuelParticipant(client: PoolClient, playerId: string): Promise<LoadedParticipant> {
  const playerResult = await client.query<ParticipantRow>(
    `
      SELECT id, username, first_name, photo_url, level, silver, gold,
        account_xp, duel_wins, duel_losses, duel_win_streak,
        duel_rating, duel_highest_league_index,
        duel_gold_earned_today, duel_gold_day, duel_gold_level, tutorial_eligible, equipment
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
        cards.collection_id,
        cards.limited
      FROM player_decks
      INNER JOIN deck_slots ON deck_slots.deck_id = player_decks.id
      INNER JOIN player_card_instances ON player_card_instances.id = deck_slots.card_instance_id
      INNER JOIN cards ON cards.id = player_card_instances.card_id
      WHERE player_decks.player_id = $1
      ORDER BY deck_slots.slot
    `,
    [playerId],
  );
  const rawCards = cardsResult.rows.map(toDuelCard);
  const slotsAreSequential = cardsResult.rows.every(({ slot }, index) => slot === index + 1);
  if (!slotsAreSequential || !validateDeckElementBalance(rawCards).valid) throw new DuelDeckInvalidError();

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
  const equipment = parseStoredEquipment(player.id, player.equipment);
  const equipmentSummary = calculateEquipmentSummary(getEquippedDefinitions(equipment));
  const modifiers = toBattleModifiers(modifiersResult.rows.map((row) => ({
    type: row.buff_type,
    value: Number(row.buff_value),
    ...(row.buff_element ? { element: row.buff_element } : {}),
  })), equipmentSummary);
  const cards = rawCards.map((card) => ({
    ...card,
    finalPower: card.finalPower + equipmentSummary.elementBonuses[card.element],
  }));
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
    "SELECT id, code, display_name, art_key, element FROM cards WHERE limited = FALSE ORDER BY element, id",
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
    private readonly campaign?: Pick<CampaignService, "recordEvent">,
  ) {}

  async search(challengerId: string): Promise<DuelSearchResponse> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
      const active = await client.query("SELECT 1 FROM duels WHERE challenger_id = $1 AND status = 'active'", [challengerId]);
      if (active.rowCount) throw new DuelAlreadyActiveError();

      const challenger = await loadDuelParticipant(client, challengerId);
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

  async start(challengerId: string, searchId: string, tutorial = false): Promise<DuelView> {
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

      const challenger = await loadDuelParticipant(client, challengerId);
      const tutorialMode = tutorial && challenger.player.tutorial_eligible;
      let opponentSnapshot: DuelSideSnapshot;
      if (search.opponent_kind === "bot") {
        if (!search.opponent_snapshot || search.opponent_id) throw new DuelSearchInvalidError();
        opponentSnapshot = search.opponent_snapshot;
      } else {
        if (!search.opponent_id || search.opponent_snapshot) throw new DuelSearchInvalidError();
        opponentSnapshot = (await loadDuelParticipant(client, search.opponent_id)).snapshot;
      }
      const range = getMatchmakingRange(challenger.snapshot.effectiveDeckPower, challenger.player.duel_win_streak);
      if (!tutorialMode && !isDeckPowerInMatchmakingRange(opponentSnapshot.effectiveDeckPower, range)) {
        throw new DuelNoOpponentFoundError();
      }

      const challengerSnapshot = tutorialMode
        ? createTutorialSnapshot(challenger.snapshot, TUTORIAL_PLAYER_POWERS)
        : challenger.snapshot;
      const resolvedOpponentSnapshot = tutorialMode
        ? createTutorialSnapshot(opponentSnapshot, TUTORIAL_ENEMY_POWERS, true, challengerSnapshot.cards.map((card) => card.element))
        : opponentSnapshot;

      const playerPool = tutorialMode
        ? createTutorialPool(challengerSnapshot.cards)
        : initializeCyclicCardPool(challengerSnapshot.cards, this.random);
      const enemyPool = tutorialMode
        ? createTutorialPool(resolvedOpponentSnapshot.cards)
        : initializeCyclicCardPool(resolvedOpponentSnapshot.cards, this.random);
      const duelId = randomUUID();
      const inserted = await client.query<DuelRow>(
        `
          INSERT INTO duels (
            id, challenger_id, opponent_id, opponent_kind, status,
            tutorial_mode,
            challenger_snapshot, opponent_snapshot,
            player_hp, enemy_hp,
            player_active_slots, enemy_active_slots,
            player_reserve_queue, enemy_reserve_queue
          )
          VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING ${DUEL_COLUMNS}
        `,
        [
          duelId,
          challengerId,
          search.opponent_id,
          search.opponent_kind,
          tutorialMode,
          JSON.stringify(challengerSnapshot),
          JSON.stringify(resolvedOpponentSnapshot),
          challengerSnapshot.startingHp,
          resolvedOpponentSnapshot.startingHp,
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
      const actionNow = new Date();
      const locked = await client.query<DuelRow>(
        `SELECT ${DUEL_COLUMNS} FROM duels WHERE id = $1 AND challenger_id = $2 FOR UPDATE`,
        [duelId, challengerId],
      );
      const duel = locked.rows[0];
      if (!duel) throw new DuelMissingError();
      if (duel.status !== "active" || duel.version !== input.expectedVersion) {
        throw new DuelStateConflictError();
      }
      const requiredTutorialSlot = duel.tutorial_mode
        ? duel.turn_number === 0 ? 0 : duel.turn_number === 1 ? 1 : null
        : null;
      if (requiredTutorialSlot !== null && input.slotIndex !== requiredTutorialSlot) {
        throw new DuelTutorialActionError();
      }

      let resolved = resolveDuelExchange({
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
        playerMaxHp: duel.challenger_snapshot.startingHp,
        enemyMaxHp: duel.opponent_snapshot.startingHp,
        slotIndex: input.slotIndex,
        turnNumber: duel.turn_number,
      });
      const referenceTutorialState = duel.tutorial_mode
        && ((duel.turn_number === 0 && duel.player_hp === 180 && duel.enemy_hp === 35)
          || (duel.turn_number === 1 && duel.player_hp === 168 && duel.enemy_hp === 23)
          || (duel.turn_number === 2 && duel.player_hp === 162 && duel.enemy_hp === 5));
      if (referenceTutorialState) {
        const tutorialPlayerDamage = duel.turn_number === 0 ? 12 : duel.turn_number === 1 ? 18 : 5;
        const tutorialEnemyDamage = duel.turn_number === 0 ? 12 : 6;
        resolved = {
          ...resolved,
          enemyHp: duel.turn_number === 0 ? 23 : duel.turn_number === 1 ? 5 : 0,
          playerHp: duel.turn_number === 0 ? 168 : duel.turn_number === 1 ? 162 : 156,
          status: duel.turn_number === 2 ? "won" : "active",
          exchange: {
            ...resolved.exchange,
            enemyDamage: tutorialEnemyDamage,
            playerDamage: tutorialPlayerDamage,
          },
        };
      }
      const battleLog = [...duel.battle_log, resolved.exchange].slice(-MAX_BATTLE_LOG_ENTRIES);
      const previousPlayerDamage = toSafeInteger(duel.player_damage_total, "Player damage total");
      const playerDamageTotal = previousPlayerDamage + resolved.exchange.playerDamage;
      if (!Number.isSafeInteger(playerDamageTotal)) throw new Error("Player damage total exceeds safe integer limits");
      if (resolved.exchange.playerMultiplier === 1.5) {
        await this.campaign?.recordEvent(client, challengerId, "DUEL_STRONG_HIT", { duelId }, actionNow);
      } else if (resolved.exchange.playerMultiplier === 1) {
        await this.campaign?.recordEvent(client, challengerId, "DUEL_NEUTRAL_HIT", { duelId }, actionNow);
      }
      let result: DuelResult | null = null;
      let rewardsGranted = false;
      let persistedPlayerHp = resolved.playerHp;
      let persistedEnemyHp = resolved.enemyHp;
      let persistedStatus = resolved.status;
      const challengerSnapshot: DuelSideSnapshot = duel.challenger_snapshot.modifiers.equipment
        ? {
          ...duel.challenger_snapshot,
          modifiers: {
            ...duel.challenger_snapshot.modifiers,
            equipmentState: resolved.playerEquipmentState,
          },
        }
        : duel.challenger_snapshot;
      const opponentSnapshot: DuelSideSnapshot = duel.opponent_snapshot.modifiers.equipment
        ? {
          ...duel.opponent_snapshot,
          modifiers: {
            ...duel.opponent_snapshot.modifiers,
            equipmentState: resolved.enemyEquipmentState,
          },
        }
        : duel.opponent_snapshot;

      if (resolved.status !== "active") {
        const playerResult = await client.query<ParticipantRow>(
          `
          SELECT id, username, first_name, photo_url, level, silver, gold,
            account_xp, duel_wins, duel_losses, duel_win_streak,
              duel_rating, duel_highest_league_index,
              duel_gold_earned_today, duel_gold_day, duel_gold_level, tutorial_eligible
            FROM players
            WHERE id = $1
            FOR UPDATE
        `,
          [challengerId],
        );
        const player = playerResult.rows[0];
        if (!player) throw new DuelMissingError();
        const tutorialVictory = resolved.status === "lost"
          && duel.tutorial_mode;
        if (tutorialVictory) {
          persistedPlayerHp = Math.max(1, resolved.playerHp);
          persistedEnemyHp = 0;
          persistedStatus = "won";
        }
        const outcome: DuelOutcome = persistedStatus === "won" ? "win" : "loss";
        const boost = await getAccountBoostStatus(client, challengerId, actionNow);
        const currencyBoost = await getCurrencyBoostStatus(client, challengerId, actionNow);
        const currentModifiers = toBattleModifiers(await getCompletedCollectionModifiers(client, challengerId));
        const baseReward = calculateDuelReward(
          player.level,
          outcome,
          currentModifiers,
          boost.multiplier,
          playerDamageTotal,
        );
        const reward = {
          ...baseReward,
          silver: baseReward.silver * currencyBoost.multiplier,
          ...(duel.tutorial_mode ? { xp: 35, silver: 100 } : {}),
        };
        const calculatedLeagueProgression = applyLeagueProgression({
          highestLeagueIndex: toSafeInteger(player.duel_highest_league_index, "Duel highest league index"),
          ratingBefore: toSafeInteger(player.duel_rating, "Duel rating"),
          result: outcome,
          rewardMultiplier: boost.multiplier * currencyBoost.multiplier,
          silverBonus: currentModifiers.silverRewardPct / 100,
        });
        const leagueProgression = duel.tutorial_mode
          ? {
            ...calculatedLeagueProgression,
            promotionReward: 0,
            silverReward: 100,
            totalSilverEarned: 100,
          }
          : calculatedLeagueProgression;
        const progression = applyAccountXp({
          level: player.level,
          xp: toSafeInteger(player.account_xp, "Account XP"),
          gainedXp: reward.xp,
        });
        const actionDate = actionNow.toISOString().slice(0, 10);
        const storedDuelGold = toSafeInteger(player.duel_gold_earned_today, "Duel daily gold");
        const storedDuelGoldDate = typeof player.duel_gold_day === "string"
          ? player.duel_gold_day.slice(0, 10)
          : player.duel_gold_day.toISOString().slice(0, 10);
        const sameDayAndLevel = storedDuelGoldDate === actionDate && player.duel_gold_level === player.level;
        const earnedDuelGold = sameDayAndLevel ? Math.min(storedDuelGold, player.level) : 0;
        const levelChanged = progression.newLevel !== player.level;
        const duelGoldReward = getDuelGoldReward(
          progression.newLevel,
          outcome,
          levelChanged ? 0 : earnedDuelGold,
          this.random,
          currencyBoost.multiplier,
        );
        const duelGoldEarnedToday = levelChanged ? duelGoldReward : earnedDuelGold + duelGoldReward;
        const levelUpGoldReward = progression.goldReward * currencyBoost.multiplier;
        const stats = applyDuelOutcomeToStats({
          duelWins: player.duel_wins,
          duelLosses: player.duel_losses,
          duelWinStreak: player.duel_win_streak,
        }, outcome);
        const nextSilver = toSafeInteger(player.silver, "Silver") + leagueProgression.totalSilverEarned;
        const nextGold = toSafeInteger(player.gold, "Gold") + levelUpGoldReward + duelGoldReward;
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
              duel_rating = $9,
              rating = $9,
              duel_highest_league_index = $10,
              duel_gold_earned_today = $11,
              duel_gold_day = $12,
              duel_gold_level = $13,
              updated_at = NOW()
            WHERE id = $1
            RETURNING id, username, first_name, photo_url, level, silver, gold,
              account_xp, duel_wins, duel_losses, duel_win_streak,
              duel_rating, duel_highest_league_index,
              duel_gold_earned_today, duel_gold_day, duel_gold_level
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
            leagueProgression.ratingAfter,
            leagueProgression.highestLeagueIndexAfter,
            duelGoldEarnedToday,
            actionDate,
            progression.newLevel,
          ],
        );
        result = {
          outcome,
          accountBoostMultiplier: boost.multiplier,
          boostExpiresAt: boost.expiresAt,
          xp: reward.xp,
          leagueProgression,
          promotionReward: leagueProgression.promotionReward,
          silver: leagueProgression.totalSilverEarned,
          silverReward: leagueProgression.silverReward,
          totalSilverEarned: leagueProgression.totalSilverEarned,
          gold: levelUpGoldReward,
          duelGoldReward,
          levelUpGoldReward,
          reachedLevels: progression.reachedLevels,
          winStreak: stats.duelWinStreak,
          player: toPlayerSummary(updatedPlayerResult.rows[0]!),
        };
        let neutralHits = battleLog.filter(({ playerMultiplier }) => playerMultiplier === 1).length;
        if (this.campaign) {
          const neutralHitResult = await client.query<{ count: string }>(
            `
              SELECT COUNT(*) AS count
              FROM player_campaign_events
              WHERE player_id = $1 AND event_type = 'DUEL_NEUTRAL_HIT'
                AND payload->>'duelId' = $2
            `,
            [challengerId, duelId],
          );
          neutralHits = Number(neutralHitResult.rows[0]?.count ?? 0);
        }
        const strongHits = battleLog.filter(({ playerMultiplier }) => playerMultiplier === 1.5).length;
        await this.campaign?.recordEvent(client, challengerId, "DUEL_FINISHED", {
          duelId,
          outcome,
          winStreak: stats.duelWinStreak,
          neutralHits,
          strongHits,
        }, actionNow);
        if (outcome === "win") {
          await this.campaign?.recordEvent(client, challengerId, "DUEL_WON", {
            duelId,
            winStreak: stats.duelWinStreak,
          }, actionNow);
        }
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
            challenger_snapshot = $8,
            opponent_snapshot = $9,
            battle_log = $10,
            player_damage_total = $11,
            turn_number = $12,
            version = version + 1,
            status = $13,
            result = $14,
            rewards_granted = $15,
            updated_at = NOW(),
            finished_at = CASE WHEN $13 = 'active' THEN NULL ELSE NOW() END
          WHERE id = $1
          RETURNING ${DUEL_COLUMNS}
        `,
        [
          duelId,
          persistedPlayerHp,
          persistedEnemyHp,
          JSON.stringify(resolved.playerPool.activeCards),
          JSON.stringify(resolved.enemyPool.activeCards),
          JSON.stringify(resolved.playerPool.reserveQueue),
          JSON.stringify(resolved.enemyPool.reserveQueue),
          JSON.stringify(challengerSnapshot),
          JSON.stringify(opponentSnapshot),
          JSON.stringify(battleLog),
          playerDamageTotal,
          resolved.exchange.turnNumber,
          persistedStatus,
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
