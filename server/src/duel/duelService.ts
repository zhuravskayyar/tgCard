import { randomUUID } from "node:crypto";
import {
  applyAccountXp,
  applyDuelOutcomeToStats,
  chooseAutoDuelSlot,
  DUEL_AUTO_PACK_SIZE,
  calculateEquipmentSummary,
  calculateDuelReward,
  DUEL_GOLD_BASE_SHARE_PCT,
  getDuelGoldDailyLimit,
  getDuelGoldReward,
  getDeckPower,
  getEffectiveDeckPower,
  getElementMultiplier,
  getEquipmentBattleModifiers,
  getEquippedDefinitions,
  getRequiredAccountXp,
  getMatchmakingRange,
  getEquipmentCollectionElementPct,
  getPlayerCollectionModifiers,
  getStartingHp,
  initializeCyclicCardPool,
  isDeckPowerInMatchmakingRange,
  resolveDuelExchange,
  validateDeckElementBalance,
  type CyclicCardPool,
  type RandomSource,
} from "@cardastika/game-core";
import { applyLeagueProgression, getPlayerDisplayName } from "@cardastika/shared";
import type {
  CardElement,
  CollectionBonusScope,
  CollectionModifier,
  CollectionModifierType,
  DuelBattleModifiers,
  DuelAutoMode,
  DuelAutoResult,
  DuelAvailability,
  DuelCardSnapshot,
  DuelResetResponse,
  DuelExchange,
  DuelOpponentPreview,
  DuelOutcome,
  DuelResult,
  DuelSearchResponse,
  DuelSideSnapshot,
  DuelStatus,
  DuelView,
  PlayerCardInstance,
  PlayerSummary,
} from "@cardastika/shared";
import type { Pool, PoolClient } from "pg";
import { getAccountBoostStatus } from "../boosts/accountBoost.js";
import { getCurrencyBoostStatus } from "../boosts/currencyBoost.js";
import { getCompletedCollectionModifiers } from "../collections/discoveryService.js";
import { parseStoredEquipment } from "../equipment/equipmentState.js";
import type { CampaignService } from "../campaign/campaignService.js";
import { loadGuildCardForMember, type GuildActivityRecorder } from "../guild/guildService.js";
import {
  mapCardInstanceRow,
  type CardInstanceProjectionRow,
} from "../cards/cardInstanceMapper.js";
import {
  createBotOpponentSnapshot,
  type BotCardTemplate,
} from "./botOpponent.js";
import {
  getDuelAvailability,
  getDuelBreakMs,
  getDuelPaidPrices,
  spendDuel,
  type DuelCooldownState,
} from "./duelCooldown.js";

const SEARCH_LIFETIME_MS = 10 * 60 * 1_000;
const MAX_BATTLE_LOG_ENTRIES = 10;
const TUTORIAL_PLAYER_POWERS = [12, 12, 12, 12, 12, 12, 12, 12, 12] as const;
const TUTORIAL_ENEMY_POWERS = [12, 12, 12, 12, 12, 12, 12, 12, 12] as const;
const CARD_ELEMENTS: readonly CardElement[] = ["fire", "water", "air", "earth"];
/** Safety cap for one simulated fight; real fights end far sooner because HP only falls. */
const MAX_AUTO_DUEL_TURNS = 500;

interface AutoCounterRow {
  /** Read as `::text` (YYYY-MM-DD) for the same reason as duel_gold_day. */
  duel_auto_day: string | null;
  duel_auto_count: number;
}

function autoDuelsToday(row: AutoCounterRow, now: Date) {
  return row.duel_auto_day === now.toISOString().slice(0, 10) ? Number(row.duel_auto_count) : 0;
}

interface ParticipantRow {
  account_xp: number;
  /** Read as `::text` (YYYY-MM-DD): pg would turn a DATE into local midnight and shift the day. */
  duel_gold_day: string;
  duel_gold_earned_today: number;
  duel_gold_level: number;
  /** Finished Duels since the last Duel gold drop (reference: a drop comes by the 5th). */
  duel_gold_streak: number;
  duel_losses: number;
  duel_highest_league_index: number;
  duel_rating: number;
  duel_win_streak: number;
  duel_wins: number;
  first_name: string;
  gold: string | number;
  id: string;
  level: number;
  nickname: string | null;
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
  buff_scope: CollectionBonusScope;
  code: string;
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
  enemy_guild_card: DuelCardSnapshot | null;
  id: string;
  opponent_id: string | null;
  opponent_snapshot: DuelSideSnapshot;
  tutorial_mode: boolean;
  player_damage_total: number | string;
  player_active_slots: DuelCardSnapshot[];
  player_hp: number;
  player_reserve_queue: DuelCardSnapshot[];
  player_guild_card: DuelCardSnapshot | null;
  result: DuelResult | null;
  rewards_granted: boolean;
  status: DuelStatus;
  turn_number: number;
  version: number;
}

export interface LoadedParticipant {
  player: ParticipantRow;
  snapshot: DuelSideSnapshot;
  guildCard: PlayerCardInstance | null;
  deckPower: number;
  equipmentPowerBonus: number;
  duelCooldownMinutes: number;
}

const DUEL_COLUMNS = `
  id, challenger_id, opponent_id, status,
  tutorial_mode,
  challenger_snapshot, opponent_snapshot,
  player_guild_card, enemy_guild_card,
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

export class DuelCooldownError extends Error {
  constructor(public readonly refillAt: string) {
    super("No duels remain until the cooldown ends");
    this.name = "DuelCooldownError";
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

export class DuelNotEnoughGoldError extends Error {
  constructor() {
    super("Not enough gold");
    this.name = "DuelNotEnoughGoldError";
  }
}

export class DuelPaidUnavailableError extends Error {
  constructor() {
    super("This paid Duel option is not available right now");
    this.name = "DuelPaidUnavailableError";
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

function toBattleModifiers(
  modifiers: readonly CollectionModifier[],
  equipmentSummary?: ReturnType<typeof calculateEquipmentSummary>,
  scope: CollectionBonusScope = "duel",
): DuelBattleModifiers {
  const aggregated = getPlayerCollectionModifiers(modifiers, scope);
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

export function toGuildDuelCard(card: PlayerCardInstance | null | undefined): DuelCardSnapshot | null {
  if (!card) return null;
  return {
    instanceId: card.instanceId,
    cardId: card.cardId,
    code: card.code,
    displayName: card.displayName,
    artKey: card.artKey,
    element: card.element,
    level: card.level,
    basePower: card.basePower,
    bonusPower: card.bonusPower,
    finalPower: card.finalPower,
    rarity: card.rarity,
    limited: card.limited ?? false,
    source: "guild",
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

/**
 * The tutorial lays out three cards of different strength. The first two hits are guided right to left
 * (weak ×0.5, then even ×1); for the third the player picks any card, and even a weak hit finishes the enemy.
 */
const TUTORIAL_SLOTS = [2, 1] as const;
/** Player multiplier per starting slot (left to right). */
const TUTORIAL_MULTIPLIERS = [1.5, 1, 0.5] as const;
const TUTORIAL_CARD_POWER = 12;
const TUTORIAL_ENEMY_HP = 24;
const TUTORIAL_PLAYER_HP = 180;
/** HP before each scripted turn; every hit deals 12 power × its multiplier. 24 → 18 → 6 → 0. */
const TUTORIAL_SCRIPT = [
  { playerHp: 180, enemyHp: 24 },
  { playerHp: 162, enemyHp: 18 },
  { playerHp: 150, enemyHp: 6 },
] as const;

function createTutorialSnapshot(snapshot: DuelSideSnapshot, powers: readonly number[], enemy = false, targetElements?: readonly CardElement[]): DuelSideSnapshot {
  const cards = snapshot.cards.map((card, index) => {
    const desiredMultiplier = TUTORIAL_MULTIPLIERS[index] ?? 1;
    const element = enemy && index < 3 && targetElements?.[index]
      ? elementForMultiplier(targetElements[index]!, desiredMultiplier)
      : card.element;
    return withTutorialPower(card, powers[index] ?? powers[powers.length - 1]!, element);
  });
  return {
    ...snapshot,
    cards,
    effectiveDeckPower: enemy ? TUTORIAL_ENEMY_HP : TUTORIAL_PLAYER_HP,
    modifiers: tutorialModifiers(),
    startingHp: enemy ? TUTORIAL_ENEMY_HP : TUTORIAL_PLAYER_HP,
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
    nickname: row.nickname,
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

export async function loadDuelParticipant(
  client: PoolClient,
  playerId: string,
  scope: CollectionBonusScope = "duel",
): Promise<LoadedParticipant> {
  const playerResult = await client.query<ParticipantRow>(
    `
      SELECT id, username, nickname, first_name, photo_url, level, silver, gold,
        account_xp, duel_wins, duel_losses, duel_win_streak,
        duel_rating, duel_highest_league_index,
        duel_gold_earned_today, duel_gold_day::text AS duel_gold_day, duel_gold_level, duel_gold_streak, tutorial_eligible, equipment
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
      SELECT collections.code, collections.buff_type, collections.buff_value, collections.buff_element, collections.buff_scope
      FROM player_collection_completions
      INNER JOIN collections ON collections.id = player_collection_completions.collection_id
      WHERE player_collection_completions.player_id = $1
      ORDER BY collections.position
    `,
    [playerId],
  );
  const equipment = parseStoredEquipment(player.id, player.equipment);
  const equippedDefinitions = getEquippedDefinitions(equipment);
  const equipmentSummary = calculateEquipmentSummary(
    equippedDefinitions,
    getEquipmentCollectionElementPct(modifiersResult.rows.map(({ code }) => code)),
  );
  const artifactItemIds = equippedDefinitions.filter(({ category }) => category === "artifacts").map(({ id }) => id);
  const collectionModifiers = modifiersResult.rows.map((row) => ({
    type: row.buff_type,
    value: Number(row.buff_value),
    ...(row.buff_element ? { element: row.buff_element } : {}),
    scope: row.buff_scope,
  }));
  const modifiers = toBattleModifiers(collectionModifiers, equipmentSummary, scope);
  const duelCooldownMinutes = getPlayerCollectionModifiers(collectionModifiers, "duel").duelCooldownMinutes;
  const cards = rawCards.map((card) => ({
    ...card,
    finalPower: card.finalPower + equipmentSummary.elementBonuses[card.element],
  }));
  const deckPower = getDeckPower(rawCards);
  const equippedDeckPower = getDeckPower(cards);
  const effectiveDeckPower = getEffectiveDeckPower(equippedDeckPower, modifiers.deckPowerPct);
  const guildCard = await loadGuildCardForMember(client, playerId);
  return {
    player,
    deckPower,
    equipmentPowerBonus: equippedDeckPower - deckPower,
    duelCooldownMinutes,
    snapshot: {
      playerId: player.id,
      name: getPlayerDisplayName({ firstName: player.first_name, nickname: player.nickname, username: player.username }),
      photoUrl: player.photo_url,
      level: player.level,
      cards,
      modifiers,
      effectiveDeckPower,
      startingHp: getStartingHp(effectiveDeckPower, modifiers.battleHpPct),
      ...(artifactItemIds.length ? { artifactItemIds } : {}),
    },
    guildCard,
  };
}

export async function loadBotCardTemplates(client: PoolClient): Promise<BotCardTemplate[]> {
  const result = await client.query<BotCardRow>(
    "SELECT id, code, display_name, art_key, element FROM cards WHERE limited = FALSE AND source = 'standard' ORDER BY element, id",
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
    private readonly guildActivity?: GuildActivityRecorder,
  ) {}

  async findAvailability(challengerId: string): Promise<DuelAvailability> {
    return this.readAvailability(this.pool, challengerId, new Date());
  }

  private async readAvailability(database: Pool | PoolClient, challengerId: string, now: Date): Promise<DuelAvailability> {
    const result = await database.query<DuelCooldownState & AutoCounterRow & Pick<ParticipantRow, "level" | "duel_gold_earned_today" | "duel_gold_day" | "duel_gold_level">>(
      `SELECT duel_remaining, duel_refill_at, level, duel_gold_earned_today, duel_gold_day::text AS duel_gold_day, duel_gold_level,
        duel_auto_day::text AS duel_auto_day, duel_auto_count
      FROM players WHERE id = $1`,
      [challengerId],
    );
    const row = result.rows[0];
    if (!row) throw new DuelMissingError();
    // Same reset rule as the Duel reward: the counter belongs to one UTC day; a level-up only raises the limit.
    const sameDay = row.duel_gold_day === now.toISOString().slice(0, 10);
    // Sequential: a transaction client runs one query at a time.
    const completed = await getCompletedCollectionModifiers(database, challengerId);
    const currencyBoost = await getCurrencyBoostStatus(database, challengerId, now);
    const { duelCooldownMinutes, duelGoldLimitBonus } = getPlayerCollectionModifiers(completed, "duel");
    const charges = getDuelAvailability(row, now);
    return {
      ...charges,
      ...getDuelPaidPrices(charges, autoDuelsToday(row, now), duelCooldownMinutes, now),
      goldEarnedToday: sameDay ? Number(row.duel_gold_earned_today) : 0,
      goldDailyLimit: getDuelGoldDailyLimit(row.level, currencyBoost.multiplier, duelGoldLimitBonus),
    };
  }

  async search(challengerId: string, tutorial = false): Promise<DuelSearchResponse> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
      const active = await client.query("SELECT 1 FROM duels WHERE challenger_id = $1 AND status = 'active'", [challengerId]);
      if (active.rowCount) throw new DuelAlreadyActiveError();

      const cooldown = await client.query<DuelCooldownState & { tutorial_eligible: boolean }>(
        "SELECT duel_remaining, duel_refill_at, tutorial_eligible FROM players WHERE id = $1",
        [challengerId],
      );
      if (!cooldown.rows[0]) throw new DuelMissingError();
      const availability = getDuelAvailability(cooldown.rows[0], new Date());
      if (availability.remaining === 0 && !(tutorial && cooldown.rows[0].tutorial_eligible)) {
        throw new DuelCooldownError(availability.refillAt!);
      }

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
      const player = {
        deckPower: challenger.deckPower,
        equipmentPowerBonus: challenger.equipmentPowerBonus,
        collectionPowerBonus: challenger.snapshot.effectiveDeckPower - challenger.deckPower - challenger.equipmentPowerBonus,
        effectiveDeckPower: challenger.snapshot.effectiveDeckPower,
      };
      return { searchId, opponent: preview, player };
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
      await client.query("BEGIN");
      const cooldown = await client.query<DuelCooldownState>(
        "SELECT duel_remaining, duel_refill_at FROM players WHERE id = $1 FOR UPDATE",
        [challengerId],
      );
      if (!cooldown.rows[0]) throw new DuelMissingError();
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
      const availability = getDuelAvailability(cooldown.rows[0], new Date());
      if (!tutorialMode && availability.remaining === 0) throw new DuelCooldownError(availability.refillAt!);
      let opponentSnapshot: DuelSideSnapshot;
      let opponentParticipant: LoadedParticipant | null = null;
      if (search.opponent_kind === "bot") {
        if (!search.opponent_snapshot || search.opponent_id) throw new DuelSearchInvalidError();
        opponentSnapshot = search.opponent_snapshot;
      } else {
        if (!search.opponent_id || search.opponent_snapshot) throw new DuelSearchInvalidError();
        opponentParticipant = await loadDuelParticipant(client, search.opponent_id);
        opponentSnapshot = opponentParticipant.snapshot;
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
      const playerGuildCard = tutorialMode ? null : toGuildDuelCard(challenger.guildCard);
      const enemyGuildCard = tutorialMode ? null : toGuildDuelCard(opponentParticipant?.guildCard);
      const duelId = randomUUID();
      const inserted = await client.query<DuelRow>(
        `
          INSERT INTO duels (
            id, challenger_id, opponent_id, opponent_kind, status,
            tutorial_mode,
            challenger_snapshot, opponent_snapshot,
            player_guild_card, enemy_guild_card,
            player_hp, enemy_hp,
            player_active_slots, enemy_active_slots,
            player_reserve_queue, enemy_reserve_queue
          )
          VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
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
          playerGuildCard ? JSON.stringify(playerGuildCard) : null,
          enemyGuildCard ? JSON.stringify(enemyGuildCard) : null,
          challengerSnapshot.startingHp,
          resolvedOpponentSnapshot.startingHp,
          JSON.stringify(playerPool.activeCards),
          JSON.stringify(enemyPool.activeCards),
          JSON.stringify(playerPool.reserveQueue),
          JSON.stringify(enemyPool.reserveQueue),
        ],
      );
      if (!tutorialMode) {
        const spent = spendDuel(availability, new Date(), challenger.duelCooldownMinutes);
        await client.query(
          "UPDATE players SET duel_remaining = $2, duel_refill_at = $3 WHERE id = $1",
          [challengerId, spent.remaining, spent.refillAt],
        );
      }
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
      const requiredTutorialSlot: number | null = duel.tutorial_mode ? TUTORIAL_SLOTS[duel.turn_number] ?? null : null;
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
        playerGuildCard: duel.player_guild_card,
        enemyGuildCard: duel.enemy_guild_card,
        // Artifacts work only in the arena, tournament and guild war (source rules).
        equipmentEnabled: false,
        random: this.random,
        slotIndex: input.slotIndex,
        turnNumber: duel.turn_number,
      });
      const scripted = duel.tutorial_mode ? TUTORIAL_SCRIPT[duel.turn_number] : undefined;
      if (scripted && duel.player_hp === scripted.playerHp && duel.enemy_hp === scripted.enemyHp) {
        const playerDamage = Math.round(TUTORIAL_CARD_POWER * resolved.exchange.playerMultiplier);
        const enemyDamage = Math.round(TUTORIAL_CARD_POWER * resolved.exchange.enemyMultiplier);
        const enemyHp = Math.max(0, scripted.enemyHp - playerDamage);
        resolved = {
          ...resolved,
          enemyHp,
          playerHp: scripted.playerHp - enemyDamage,
          status: enemyHp === 0 ? "won" : "active",
          exchange: { ...resolved.exchange, enemyDamage, playerDamage },
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
        if (resolved.status === "lost" && duel.tutorial_mode) {
          persistedPlayerHp = Math.max(1, resolved.playerHp);
          persistedEnemyHp = 0;
          persistedStatus = "won";
        }
        result = await this.grantDuelRewards(client, challengerId, {
          battleLog,
          duelId,
          now: actionNow,
          opponentStartingHp: duel.opponent_snapshot.startingHp,
          outcome: persistedStatus === "won" ? "win" : "loss",
          playerDamageTotal,
          tutorialMode: duel.tutorial_mode,
        });
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
  /** Reference: during the break, gold reopens ten manual Duels and the break timer resets. */
  async resetBreak(challengerId: string): Promise<DuelResetResponse> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const now = new Date();
      const availability = await this.lockPaidAvailability(client, challengerId, now);
      const price = availability.breakPrice;
      if (price === null) throw new DuelPaidUnavailableError();
      const gold = await this.payGold(client, challengerId, price);
      await client.query(
        "UPDATE players SET duel_remaining = $2, duel_refill_at = NULL, updated_at = NOW() WHERE id = $1",
        [challengerId, availability.max],
      );
      const next = await this.readAvailability(client, challengerId, now);
      await client.query("COMMIT");
      return { availability: next, gold };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Reference: the game picks the opponents, fights and shows the totals. "remaining" plays the charges
   * left for 1 gold each; "pack" plays ten during the break for the break price. Every fight is a real
   * finished Duel with the same rewards and events as a manual one, and the break starts afresh.
   */
  async autoPlay(challengerId: string, mode: DuelAutoMode): Promise<DuelAutoResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const now = new Date();
      const availability = await this.lockPaidAvailability(client, challengerId, now);
      const count = mode === "remaining" ? availability.remaining : DUEL_AUTO_PACK_SIZE;
      const price = mode === "remaining" ? availability.autoRemainingPrice : availability.breakPrice;
      if (count <= 0 || price === null || price <= 0) throw new DuelPaidUnavailableError();
      if (mode === "remaining") {
        // Reference: offered only after a won Duel that was not the last of the cycle.
        const latest = await client.query<{ status: DuelStatus }>(
          "SELECT status FROM duels WHERE challenger_id = $1 AND opponent_kind = 'bot' AND tutorial_mode = FALSE ORDER BY created_at DESC LIMIT 1",
          [challengerId],
        );
        if (availability.remaining >= availability.max || latest.rows[0]?.status !== "won") throw new DuelPaidUnavailableError();
      }
      await this.payGold(client, challengerId, price);

      const challenger = await loadDuelParticipant(client, challengerId);
      const templates = await loadBotCardTemplates(client);
      const playerGuildCard = toGuildDuelCard(challenger.guildCard);
      const ratingBefore = toSafeInteger(challenger.player.duel_rating, "Duel rating");
      let winStreak = challenger.player.duel_win_streak;
      const totals = { wins: 0, losses: 0, xp: 0, silver: 0, gold: 0 };
      const reachedLevels: number[] = [];
      let last: DuelResult | null = null;

      for (let index = 0; index < count; index += 1) {
        const range = getMatchmakingRange(challenger.snapshot.effectiveDeckPower, winStreak);
        const opponent = createBotOpponentSnapshot(challenger.snapshot, range, templates, this.random);
        const duelId = randomUUID();
        const fight = await this.simulateFight(client, challengerId, duelId, challenger.snapshot, opponent, playerGuildCard, now);
        const result = await this.grantDuelRewards(client, challengerId, {
          battleLog: fight.battleLog,
          duelId,
          now,
          opponentStartingHp: opponent.startingHp,
          outcome: fight.status === "won" ? "win" : "loss",
          playerDamageTotal: fight.playerDamageTotal,
          tutorialMode: false,
        });
        await client.query(
          `
            INSERT INTO duels (
              id, challenger_id, opponent_id, opponent_kind, status, tutorial_mode,
              challenger_snapshot, opponent_snapshot, player_guild_card, enemy_guild_card,
              player_hp, enemy_hp, player_active_slots, enemy_active_slots,
              player_reserve_queue, enemy_reserve_queue, battle_log, player_damage_total,
              turn_number, result, rewards_granted, finished_at
            )
            VALUES ($1, $2, NULL, 'bot', $3, FALSE, $4, $5, $6, NULL, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, TRUE, NOW())
          `,
          [
            duelId,
            challengerId,
            fight.status,
            JSON.stringify(challenger.snapshot),
            JSON.stringify(opponent),
            playerGuildCard ? JSON.stringify(playerGuildCard) : null,
            fight.playerHp,
            fight.enemyHp,
            JSON.stringify(fight.playerPool.activeCards),
            JSON.stringify(fight.enemyPool.activeCards),
            JSON.stringify(fight.playerPool.reserveQueue),
            JSON.stringify(fight.enemyPool.reserveQueue),
            JSON.stringify(fight.battleLog),
            fight.playerDamageTotal,
            fight.turnNumber,
            JSON.stringify(result),
          ],
        );
        if (result.outcome === "win") totals.wins += 1;
        else totals.losses += 1;
        totals.xp += result.xp;
        totals.silver += result.silver;
        totals.gold += (result.duelGoldReward ?? 0) + (result.levelUpGoldReward ?? 0);
        reachedLevels.push(...result.reachedLevels);
        winStreak = result.winStreak;
        last = result;
      }

      // All charges are spent and the break starts now, as after a tenth manual Duel.
      const counters = await client.query<AutoCounterRow>(
        "SELECT duel_auto_day::text AS duel_auto_day, duel_auto_count FROM players WHERE id = $1",
        [challengerId],
      );
      await client.query(
        `UPDATE players SET duel_remaining = 0, duel_refill_at = $2, duel_auto_day = $3, duel_auto_count = $4, updated_at = NOW()
        WHERE id = $1`,
        [
          challengerId,
          new Date(now.getTime() + getDuelBreakMs(challenger.duelCooldownMinutes)),
          now.toISOString().slice(0, 10),
          autoDuelsToday(counters.rows[0]!, now) + count,
        ],
      );
      const nextAvailability = await this.readAvailability(client, challengerId, now);
      await client.query("COMMIT");
      const player = last!.player;
      return {
        played: count,
        ...totals,
        goldSpent: price,
        ratingChange: (player.duelRating ?? ratingBefore) - ratingBefore,
        reachedLevels,
        player,
        availability: nextAvailability,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /** Locks the player row (same order as start) and reads charges and prices under that lock. */
  private async lockPaidAvailability(client: PoolClient, challengerId: string, now: Date) {
    const locked = await client.query("SELECT 1 FROM players WHERE id = $1 FOR UPDATE", [challengerId]);
    if (!locked.rowCount) throw new DuelMissingError();
    const active = await client.query("SELECT 1 FROM duels WHERE challenger_id = $1 AND status = 'active'", [challengerId]);
    if (active.rowCount) throw new DuelAlreadyActiveError();
    return this.readAvailability(client, challengerId, now);
  }

  private async payGold(client: PoolClient, challengerId: string, price: number) {
    const paid = await client.query<{ gold: string | number }>(
      "UPDATE players SET gold = gold - $2, updated_at = NOW() WHERE id = $1 AND gold >= $2 RETURNING gold",
      [challengerId, price],
    );
    if (!paid.rows[0]) throw new DuelNotEnoughGoldError();
    return toSafeInteger(paid.rows[0].gold, "Gold");
  }

  /** One automatic fight to the end with the same exchange rules as a manual Duel. */
  private async simulateFight(
    client: PoolClient,
    challengerId: string,
    duelId: string,
    player: DuelSideSnapshot,
    enemy: DuelSideSnapshot,
    playerGuildCard: DuelCardSnapshot | null,
    now: Date,
  ) {
    let playerPool = initializeCyclicCardPool(player.cards, this.random);
    let enemyPool = initializeCyclicCardPool(enemy.cards, this.random);
    let playerHp = player.startingHp;
    let enemyHp = enemy.startingHp;
    let turnNumber = 0;
    let playerDamageTotal = 0;
    let status: DuelStatus = "active";
    const exchanges: DuelExchange[] = [];
    while (status === "active") {
      if (turnNumber >= MAX_AUTO_DUEL_TURNS) {
        status = playerHp >= enemyHp ? "won" : "lost";
        break;
      }
      const resolved = resolveDuelExchange({
        playerHp,
        enemyHp,
        playerPool,
        enemyPool,
        playerModifiers: player.modifiers,
        enemyModifiers: enemy.modifiers,
        playerMaxHp: player.startingHp,
        enemyMaxHp: enemy.startingHp,
        playerGuildCard,
        enemyGuildCard: null,
        equipmentEnabled: false,
        random: this.random,
        slotIndex: chooseAutoDuelSlot(
          toActiveCards(playerPool.activeCards, "player active slots"),
          toActiveCards(enemyPool.activeCards, "enemy active slots"),
        ),
        turnNumber,
      });
      if (resolved.exchange.playerMultiplier === 1.5) {
        await this.campaign?.recordEvent(client, challengerId, "DUEL_STRONG_HIT", { duelId }, now);
      } else if (resolved.exchange.playerMultiplier === 1) {
        await this.campaign?.recordEvent(client, challengerId, "DUEL_NEUTRAL_HIT", { duelId }, now);
      }
      exchanges.push(resolved.exchange);
      playerDamageTotal += resolved.exchange.playerDamage;
      playerPool = resolved.playerPool;
      enemyPool = resolved.enemyPool;
      playerHp = resolved.playerHp;
      enemyHp = resolved.enemyHp;
      turnNumber = resolved.exchange.turnNumber;
      status = resolved.status;
    }
    return {
      status: status as "won" | "lost",
      playerHp,
      enemyHp,
      playerPool,
      enemyPool,
      turnNumber,
      playerDamageTotal,
      battleLog: exchanges.slice(-MAX_BATTLE_LOG_ENTRIES),
    };
  }

  /** Rewards, stats, league and events for one finished Duel; shared by manual and automatic fights. */
  private async grantDuelRewards(client: PoolClient, challengerId: string, input: {
    battleLog: DuelExchange[];
    duelId: string;
    now: Date;
    opponentStartingHp: number;
    outcome: DuelOutcome;
    playerDamageTotal: number;
    tutorialMode: boolean;
  }): Promise<DuelResult> {
    const { battleLog, duelId, now, opponentStartingHp, outcome, playerDamageTotal, tutorialMode } = input;
    const playerResult = await client.query<ParticipantRow>(
      `
      SELECT id, username, nickname, first_name, photo_url, level, silver, gold,
        account_xp, duel_wins, duel_losses, duel_win_streak,
          duel_rating, duel_highest_league_index,
          duel_gold_earned_today, duel_gold_day::text AS duel_gold_day, duel_gold_level, duel_gold_streak, tutorial_eligible
        FROM players
        WHERE id = $1
        FOR UPDATE
    `,
      [challengerId],
    );
    const player = playerResult.rows[0];
    if (!player) throw new DuelMissingError();
    const boost = await getAccountBoostStatus(client, challengerId, now);
    const currencyBoost = await getCurrencyBoostStatus(client, challengerId, now);
    const completedCollectionModifiers = await getCompletedCollectionModifiers(client, challengerId);
    const currentModifiers = toBattleModifiers(completedCollectionModifiers);
    const goldModifiers = getPlayerCollectionModifiers(completedCollectionModifiers, "duel");
    // Reference manual: a win pays XP equal to the defeated opponent's HP; overkill damage is not XP.
    const baseReward = calculateDuelReward(
      player.level,
      outcome,
      currentModifiers,
      boost.multiplier,
      Math.min(playerDamageTotal, opponentStartingHp),
    );
    const reward = {
      ...baseReward,
      silver: baseReward.silver * currencyBoost.multiplier,
      ...(tutorialMode ? { xp: 35, silver: 100 } : {}),
    };
    await this.guildActivity?.recordActivity(
      client,
      challengerId,
      outcome === "win" ? "duel_win" : "duel_loss",
      `duel:${duelId}`,
      reward.xp,
      now,
    );
    const calculatedLeagueProgression = applyLeagueProgression({
      highestLeagueIndex: toSafeInteger(player.duel_highest_league_index, "Duel highest league index"),
      ratingBefore: toSafeInteger(player.duel_rating, "Duel rating"),
      result: outcome,
      rewardMultiplier: boost.multiplier * currencyBoost.multiplier,
      silverBonus: currentModifiers.silverRewardPct / 100,
    });
    const leagueProgression = tutorialMode
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
    const actionDate = now.toISOString().slice(0, 10);
    const storedDuelGold = toSafeInteger(player.duel_gold_earned_today, "Duel daily gold");
    const storedDuelGoldDate = player.duel_gold_day;
    // As in the reference manual: the counter resets only with the next (UTC) day; a level-up
    // raises the limit (= new level) but keeps what was already earned today.
    const earnedDuelGold = storedDuelGoldDate === actionDate ? storedDuelGold : 0;
    const duelGoldReward = tutorialMode
      ? 0
      : getDuelGoldReward(
        progression.newLevel,
        outcome,
        earnedDuelGold,
        toSafeInteger(player.duel_gold_streak, "Duels since Duel gold"),
        this.random,
        currencyBoost.multiplier,
        {
          limitBonus: goldModifiers.duelGoldLimitBonus,
          sharePct: Math.max(DUEL_GOLD_BASE_SHARE_PCT, goldModifiers.duelGoldSharePct),
        },
      );
    const duelGoldEarnedToday = earnedDuelGold + duelGoldReward;
    const duelGoldStreak = tutorialMode ? player.duel_gold_streak : duelGoldReward > 0 ? 0 : player.duel_gold_streak + 1;
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
          duel_gold_streak = $14,
          updated_at = NOW()
        WHERE id = $1
        RETURNING id, username, nickname, first_name, photo_url, level, silver, gold,
          account_xp, duel_wins, duel_losses, duel_win_streak,
          duel_rating, duel_highest_league_index,
          duel_gold_earned_today, duel_gold_day::text AS duel_gold_day, duel_gold_level, duel_gold_streak
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
        duelGoldStreak,
      ],
    );
    const result: DuelResult = {
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
      gold: duelGoldReward,
      duelRating: leagueProgression.ratingAfter,
      winStreak: stats.duelWinStreak,
      neutralHits,
      strongHits,
    }, now);
    if (outcome === "win") {
      await this.campaign?.recordEvent(client, challengerId, "DUEL_WON", {
        duelId,
        winStreak: stats.duelWinStreak,
      }, now);
    }
    return result;
  }
}
