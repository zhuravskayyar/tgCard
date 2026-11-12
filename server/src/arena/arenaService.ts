import { randomUUID } from "node:crypto";
import {
  ARENA_BOT_ACTION_INTERVAL_MS,
  ARENA_IDLE_FINISH_MS,
  ARENA_MIN_COUNTED_MOVES,
  ARENA_NO_WINNERS_ALIVE_COUNT,
  ARENA_PARTICIPANT_COUNT,
  ARENA_SLOT_COOLDOWN_MS,
  calculateArenaDamage,
  calculateArenaRatingChange,
  compareArenaResults,
  cycleCardPoolSlotWithGuildCard,
  getArenaCardChangeCost,
  getArenaQueueDurationMs,
  getElementMultiplier,
  getStartingHp,
  initializeCyclicCardPool,
  shuffleCards,
  type RandomSource,
} from "@cardastika/game-core";
import {
  ARENA_LEAGUE_CONFIG,
  isArenaUnlocked,
  getArenaLeagueIndexAfter,
  getLeagueByRating,
  type ArenaActionRequest,
  type ActiveArenaResponse,
  type ArenaLeaderboardResponse,
  type ArenaBattleLogEntry,
  type ArenaLogArtifact,
  type ArenaBattleParticipantSnapshot,
  type ArenaCardSlot,
  type ChatMessage,
  type ChatView,
  type ArenaLeagueView,
  type ArenaPairInteractionSnapshot,
  type ArenaPresenceResponse,
  type ArenaProfileResponse,
  type ArenaQueueResponse,
  type ArenaQueueView,
  type ArenaResult,
  type ArenaVersionRequest,
  type ArenaView,
  type DuelCardSnapshot,
  type DuelSideSnapshot,
  type PlayerSummary,
} from "@cardastika/shared";
import type { Pool, PoolClient } from "pg";
import { loadDuelParticipant, toGuildDuelCard, DuelDeckInvalidError } from "../duel/duelService.js";
import { loadArenaDailyTasks } from "../battlePassService.js";
import { ChatChannel } from "../chat/chatChannel.js";

/** Each player sees the last seven strikes that concern them, as in the reference log. */
const MAX_ARENA_LOG_ENTRIES = 7;

/** The reference drops players from the arena top list after a day without an arena fight. */
const ARENA_RECENT_FIGHT_SQL = "EXISTS (SELECT 1 FROM arena_match_players mp WHERE mp.player_id = players.id AND mp.joined_at > NOW() - INTERVAL '1 day')";
const ARENA_PLAYER_PRESENCE_SYNC_MS = 8_000;
const ARENA_PLAYER_PRESENCE_TIMEOUT_MS = 15_000;
/** As in the reference, a bot is named "quality adjective + creature" or by a plain first name. */
const BOT_NAMES = [
  "Спритний солдат", "Обережний воїн", "Швидкий лучник", "Хитра принцеса", "Важкий здоровань",
  "Сміливий мандрівник", "Тихий вартовий", "Лютий найманець", "Мудра чарівниця", "Відважний лицар",
  "Похмурий мисливець", "Весела травниця", "Залізний страж", "Сонний велетень", "Бронзовий звір",
  "Пилова відьма", "Кришталевий страж", "Чорний гладіатор", "Остап", "Мирослава", "Тарас", "Олеся",
];
/** Five portraits per league, fixed for that league, so bots look the same within it as in the reference. */
const BOTS_PER_MATCH = 5;
const ARENA_BOT_AVATAR_COUNT = 20;

function arenaBotAvatar(leagueIndex: number, botIndex: number) {
  const avatar = ((leagueIndex * BOTS_PER_MATCH + botIndex) % ARENA_BOT_AVATAR_COUNT) + 1;
  return `avatar:${String(avatar).padStart(2, "0")}`;
}

function pickBotNames(count: number, random: RandomSource) {
  const pool = [...BOT_NAMES];
  return Array.from({ length: count }, () => pool.splice(Math.min(pool.length - 1, Math.floor(random() * pool.length)), 1)[0]!);
}

interface ArenaPlayerRow {
  account_xp: number;
  arena_highest_league_index: number;
  arena_league_index: number;
  arena_rating: number;
  arena_top3_count: number;
  arena_wins: number;
  card_shards: string | number;
  duel_highest_league_index: number;
  duel_rating: number;
  duel_wins: number;
  first_name: string;
  gold: string | number;
  id: string;
  level: number;
  photo_url: string | null;
  silver: string | number;
  username: string | null;
}

interface ArenaRow {
  id: string;
  player_id: string;
  result: ArenaResult | null;
  state: ArenaState;
  status: "active" | "finished";
  version: number;
}

interface ArenaState {
  /** Per-player request versions; other participants' actions do not invalidate an open action. */
  actionVersions?: Record<string, number>;
  battleLog: ArenaBattleLogEntry[];
  /** Shared clock origin for the nine-second battle cycles; absent only in legacy states. */
  cyclesStartAt?: string;
  lastPlayerActionAt?: string;
  /** Throttled page-presence heartbeats; only live human participants are stored here. */
  playerLastSeenAt?: Record<string, string>;
  matchId: string;
  participants: ArenaBattleParticipantSnapshot[];
  pairStates: Record<string, ArenaPairInteractionSnapshot>;
  playerId: string;
  /** Card changes are counted separately for each human participant. */
  rerollCountsByPlayer?: Record<string, number>;
  result: ArenaResult | null;
  resultsByPlayer?: Record<string, ArenaResult>;
  targetId: string | null;
  technicalFinish?: boolean;
}

function toSafeInteger(value: number | string, field: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${field}`);
  return parsed;
}

function toLeagueView(index: number): ArenaLeagueView {
  const league = ARENA_LEAGUE_CONFIG.leagues[index];
  if (!league) throw new Error("Arena league is outside the configured range");
  return {
    accentColor: league.accentColor,
    division: league.division,
    iconKey: league.iconKey,
    index: league.index,
    key: league.key,
    maxRating: league.maxRating,
    minRating: league.minRating,
    name: league.name,
    promotionReward: league.promotionReward,
  };
}

function toPlayerSummary(row: ArenaPlayerRow): PlayerSummary {
  return {
    accountXp: toSafeInteger(row.account_xp, "account XP"),
    arenaLeagueIndex: toSafeInteger(row.arena_league_index, "arena league"),
    arenaRating: toSafeInteger(row.arena_rating, "arena rating"),
    arenaTop3Count: toSafeInteger(row.arena_top3_count, "arena top 3 count"),
    arenaWins: toSafeInteger(row.arena_wins, "arena wins"),
    cardShards: toSafeInteger(row.card_shards, "card shards"),
    duelHighestLeagueIndex: toSafeInteger(row.duel_highest_league_index, "duel league"),
    duelRating: toSafeInteger(row.duel_rating, "duel rating"),
    duelWins: toSafeInteger(row.duel_wins, "duel wins"),
    firstName: row.first_name,
    gold: toSafeInteger(row.gold, "gold"),
    id: row.id,
    level: row.level,
    photoUrl: row.photo_url,
    silver: toSafeInteger(row.silver, "silver"),
    username: row.username,
  };
}

function activeCards(cards: DuelCardSnapshot[]): [DuelCardSnapshot, DuelCardSnapshot, DuelCardSnapshot] {
  if (cards.length !== 3 || !cards[0] || !cards[1] || !cards[2]) throw new Error("Arena requires three active cards");
  return [cards[0], cards[1], cards[2]];
}

function copyActiveCards(cards: [DuelCardSnapshot, DuelCardSnapshot, DuelCardSnapshot]): [DuelCardSnapshot, DuelCardSnapshot, DuelCardSnapshot] {
  return [cards[0], cards[1], cards[2]];
}

function cloneModifiers(snapshot: DuelSideSnapshot) {
  return {
    ...snapshot.modifiers,
    elementDamagePct: { ...snapshot.modifiers.elementDamagePct },
  };
}

function createParticipant(snapshot: DuelSideSnapshot, id: string, isBot: boolean, random = Math.random, guildCard: DuelCardSnapshot | null = null): ArenaBattleParticipantSnapshot {
  const pool = initializeCyclicCardPool(snapshot.cards, random);
  const maxHp = getStartingHp(snapshot.effectiveDeckPower * 3, snapshot.modifiers.battleHpPct);
  return {
    ...(snapshot.artifactItemIds?.length ? { artifactItemIds: [...snapshot.artifactItemIds] } : {}),
    activeSlots: pool.activeCards,
    cards: snapshot.cards,
    cooldownUntil: [null, null, null],
    effectiveDeckPower: snapshot.effectiveDeckPower,
    guildCard,
    hp: maxHp,
    id,
    isBot,
    kills: 0,
    lastBotActionAt: null,
    level: snapshot.level,
    maxHp,
    modifiers: cloneModifiers(snapshot),
    name: snapshot.name,
    photoUrl: snapshot.photoUrl,
    reserveQueue: pool.reserveQueue,
    rotationSeenCardIds: pool.activeCards.map(({ instanceId }) => instanceId),
    targetId: null,
    totalDamageDealt: 0,
  };
}

interface QueuedArenaPlayer {
  createdAt: string | Date;
  id: string;
  playerId: string;
  snapshot: DuelSideSnapshot;
  guildCard: DuelCardSnapshot | null;
}

function createArenaState(players: QueuedArenaPlayer[], random: RandomSource = Math.random, now = Date.now(), leagueIndex = 0): ArenaState {
  const firstPlayer = players[0];
  if (!firstPlayer) throw new Error("Arena queue did not contain a player");
  const participants = [
    ...players.map(({ playerId, snapshot, guildCard }) => createParticipant(snapshot, playerId, false, random, guildCard)),
    ...(() => {
      const botCount = ARENA_PARTICIPANT_COUNT - players.length;
      const names = pickBotNames(botCount, random);
      return Array.from({ length: botCount }, (_, index) => createBot(players[index % players.length]!.snapshot, index, names[index]!, leagueIndex, random));
    })(),
  ];
  const cyclesStartAt = new Date(now).toISOString();
  for (const participant of participants) {
    participant.cooldownUntil = [null, null, null];
    if (participant.isBot) participant.lastBotActionAt = cyclesStartAt;
  }
  const state: ArenaState = {
    actionVersions: Object.fromEntries(participants.map(({ id }) => [id, 1])),
    battleLog: [],
    cyclesStartAt,
    lastPlayerActionAt: cyclesStartAt,
    matchId: randomUUID(),
    participants,
    pairStates: {},
    playerId: firstPlayer.playerId,
    playerLastSeenAt: Object.fromEntries(players.map(({ playerId }) => [playerId, cyclesStartAt])),
    rerollCountsByPlayer: Object.fromEntries(players.map(({ playerId }) => [playerId, 0])),
    result: null,
    resultsByPlayer: {},
    targetId: null,
  };
  setInitialTargets(state, random);
  for (const attacker of state.participants) {
    for (const target of state.participants) {
      if (attacker.id !== target.id) state.pairStates[pairKey(attacker.id, target.id)] = createPairState(attacker, target, random);
    }
  }
  return state;
}

function createBot(snapshot: DuelSideSnapshot, index: number, name: string, leagueIndex: number, random: RandomSource = Math.random): ArenaBattleParticipantSnapshot {
  const id = `arena-bot:${randomUUID()}`;
  const nonLimitedCards = snapshot.cards.filter(({ limited }) => !limited);
  if (nonLimitedCards.length < 3) throw new ArenaDeckInvalidError();
  const cards = snapshot.cards.map((card, cardIndex) => {
    if (!card.limited) return { ...card, instanceId: `arena-bot:${id}:${cardIndex + 1}`, limited: false };
    const replacement = nonLimitedCards.find(({ element }) => element === card.element) ?? nonLimitedCards[cardIndex % nonLimitedCards.length]!;
    return { ...replacement, instanceId: `arena-bot:${id}:${cardIndex + 1}`, limited: false };
  });
  return createParticipant({
    ...snapshot,
    cards,
    name,
    photoUrl: arenaBotAvatar(leagueIndex, index),
    level: Math.max(1, snapshot.level + (index % 3) - 1),
    modifiers: cloneModifiers(snapshot),
  }, id, true, random);
}

function aliveParticipants(state: ArenaState) {
  return state.participants.filter((participant) => participant.hp > 0);
}

function arenaIsOver(state: ArenaState) {
  // Once every live player has fallen, the bots' remaining fight ends at once.
  return state.technicalFinish === true
    || aliveParticipants(state).length <= 1
    || !state.participants.some((participant) => !participant.isBot && participant.hp > 0);
}

function findParticipant(state: ArenaState, id: string) {
  return state.participants.find((participant) => participant.id === id);
}

/** Next living participant after `afterId` in list order, as the manual cycles targets. */
function nextTarget(state: ArenaState, fromId: string, afterId = fromId) {
  const alive = aliveParticipants(state);
  const index = state.participants.findIndex((participant) => participant.id === afterId);
  for (let offset = 1; offset <= state.participants.length; offset += 1) {
    const candidate = state.participants[(index + offset + state.participants.length) % state.participants.length];
    if (candidate && candidate.id !== fromId && candidate.hp > 0) return candidate.id;
  }
  return alive.find((participant) => participant.id !== fromId)?.id ?? null;
}

function nextBotTarget(state: ArenaState, fromId: string, random: RandomSource = Math.random) {
  const candidates = aliveParticipants(state).filter((participant) => participant.id !== fromId);
  if (!candidates.length) return null;
  const targetCounts = new Map(candidates.map((candidate) => [candidate.id, 0]));
  state.participants.forEach((participant) => {
    if (participant.isBot && participant.hp > 0 && targetCounts.has(participant.targetId ?? "")) {
      const targetId = participant.targetId!;
      targetCounts.set(targetId, (targetCounts.get(targetId) ?? 0) + 1);
    }
  });
  const minimumTargetCount = Math.min(...candidates.map((candidate) => targetCounts.get(candidate.id) ?? 0));
  const leastTargeted = candidates.filter((candidate) => (targetCounts.get(candidate.id) ?? 0) === minimumTargetCount);
  const index = Math.min(leastTargeted.length - 1, Math.floor(random() * leastTargeted.length));
  return leastTargeted[index]?.id ?? candidates[0]!.id;
}

function normalizeTarget(state: ArenaState, attacker: ArenaBattleParticipantSnapshot, random: RandomSource = Math.random) {
  const target = attacker.targetId ? findParticipant(state, attacker.targetId) : undefined;
  if (!target || target.hp <= 0 || target.id === attacker.id) attacker.targetId = attacker.isBot ? nextBotTarget(state, attacker.id, random) : nextTarget(state, attacker.id, target?.id ?? attacker.id);
  const normalizedTarget = attacker.targetId ? findParticipant(state, attacker.targetId) ?? null : null;
  return normalizedTarget && normalizedTarget.id !== attacker.id ? normalizedTarget : null;
}

function readyAt(cooldownUntil: string | null, now: number) {
  return !cooldownUntil || new Date(cooldownUntil).getTime() <= now;
}

const PAIR_KEY_SEPARATOR = "::";

function pairKey(attackerId: string, targetId: string) {
  return `${attackerId}${PAIR_KEY_SEPARATOR}${targetId}`;
}

function createPairState(attacker: ArenaBattleParticipantSnapshot, target: ArenaBattleParticipantSnapshot, random: RandomSource = Math.random): ArenaPairInteractionSnapshot {
  const attackerPool = {
    activeCards: copyActiveCards(attacker.activeSlots),
    reserveQueue: [...attacker.reserveQueue],
  };
  const targetPool = initializeCyclicCardPool(target.cards, random);
  return {
    attackerActiveSlots: attackerPool.activeCards,
    attackerReserveQueue: attackerPool.reserveQueue,
    attackerRotationSeenCardIds: attackerPool.activeCards.map(({ instanceId }) => instanceId),
    targetActiveSlots: targetPool.activeCards,
    targetReserveQueue: targetPool.reserveQueue,
    targetRotationSeenCardIds: targetPool.activeCards.map(({ instanceId }) => instanceId),
  };
}

function createLegacyPairState(attacker: ArenaBattleParticipantSnapshot, target: ArenaBattleParticipantSnapshot): ArenaPairInteractionSnapshot {
  return {
    attackerActiveSlots: activeCards(attacker.activeSlots),
    attackerReserveQueue: [...attacker.reserveQueue],
    attackerRotationSeenCardIds: [...(attacker.rotationSeenCardIds ?? attacker.activeSlots.map(({ instanceId }) => instanceId))],
    targetActiveSlots: activeCards(target.activeSlots),
    targetReserveQueue: [...target.reserveQueue],
    targetRotationSeenCardIds: [...(target.rotationSeenCardIds ?? target.activeSlots.map(({ instanceId }) => instanceId))],
  };
}

function ensurePairStates(state: ArenaState) {
  state.pairStates ??= {};
  for (const attacker of state.participants) {
    for (const target of state.participants) {
      if (attacker.id === target.id) continue;
      const key = pairKey(attacker.id, target.id);
      if (!state.pairStates[key]) state.pairStates[key] = createLegacyPairState(attacker, target);
    }
  }
  return state.pairStates;
}

function getPairState(state: ArenaState, attacker: ArenaBattleParticipantSnapshot, target: ArenaBattleParticipantSnapshot) {
  const pairs = ensurePairStates(state);
  const key = pairKey(attacker.id, target.id);
  const pair = pairs[key];
  if (!pair) throw new Error("Arena pair interaction state is missing");
  return pair;
}

function syncParticipantAttackerState(
  participant: ArenaBattleParticipantSnapshot,
  pair: Pick<ArenaPairInteractionSnapshot, "attackerActiveSlots" | "attackerReserveQueue" | "attackerRotationSeenCardIds">,
) {
  participant.activeSlots = copyActiveCards(pair.attackerActiveSlots);
  participant.reserveQueue = [...pair.attackerReserveQueue];
  participant.rotationSeenCardIds = [...pair.attackerRotationSeenCardIds];
}

function syncPairAttackerState(
  pair: ArenaPairInteractionSnapshot,
  source: Pick<ArenaPairInteractionSnapshot, "attackerActiveSlots" | "attackerReserveQueue" | "attackerRotationSeenCardIds">,
) {
  pair.attackerActiveSlots = copyActiveCards(source.attackerActiveSlots);
  pair.attackerReserveQueue = [...source.attackerReserveQueue];
  pair.attackerRotationSeenCardIds = [...source.attackerRotationSeenCardIds];
}

function migrateLegacyPairCooldowns(state: ArenaState) {
  const pairs = ensurePairStates(state);
  let changed = false;
  for (const participant of state.participants) {
    const target = participant.targetId ? findParticipant(state, participant.targetId) : null;
    const legacyCooldown = target ? pairs[pairKey(participant.id, target.id)]?.cooldownUntil : undefined;
    if (legacyCooldown && participant.cooldownUntil.every((cooldown) => cooldown === null)) {
      participant.cooldownUntil = [...legacyCooldown];
      changed = true;
    }
  }
  for (const pair of Object.values(pairs)) {
    if (!pair.cooldownUntil?.some((cooldown) => cooldown !== null)) continue;
    pair.cooldownUntil = [null, null, null];
    changed = true;
  }
  return changed;
}

function rotateCardSide(
  cards: DuelCardSnapshot[],
  activeSlots: [DuelCardSnapshot, DuelCardSnapshot, DuelCardSnapshot],
  reserveQueue: DuelCardSnapshot[],
  rotationSeenCardIds: string[],
  slotIndex: 0 | 1 | 2,
  guildCard: DuelCardSnapshot | null | undefined,
  random: RandomSource,
) {
  let nextReserveQueue = reserveQueue;
  const deckCardIds = new Set(cards.map(({ instanceId }) => instanceId));
  let seenCardIds = new Set(rotationSeenCardIds.filter((instanceId) => deckCardIds.has(instanceId)));

  if (seenCardIds.size >= cards.length) {
    const activeCardIds = new Set(activeSlots.map(({ instanceId }) => instanceId));
    nextReserveQueue = shuffleCards(cards, random).filter(({ instanceId }) => !activeCardIds.has(instanceId));
    seenCardIds = new Set([...activeCardIds].filter((instanceId) => deckCardIds.has(instanceId)));
  }

  const result = cycleCardPoolSlotWithGuildCard({
    activeCards: activeSlots,
    reserveQueue: nextReserveQueue,
  }, slotIndex, guildCard, random);
  const pool = result.pool;
  if (pool.activeCards[slotIndex].source !== "guild") seenCardIds.add(pool.activeCards[slotIndex].instanceId);
  return {
    activeSlots: pool.activeCards,
    reserveQueue: pool.reserveQueue,
    rotationSeenCardIds: [...seenCardIds],
  };
}

function advanceCooldowns(state: ArenaState, now: number, random: RandomSource) {
  let changed = false;
  for (const attacker of state.participants) {
    for (const slotIndex of [0, 1, 2] as const) {
      const cooldownUntil = attacker.cooldownUntil[slotIndex];
      if (!cooldownUntil || !readyAt(cooldownUntil, now)) continue;

      const target = normalizeTarget(state, attacker, random);
      if (target) {
        const pair = getPairState(state, attacker, target);
        const nextAttacker = rotateCardSide(attacker.cards, pair.attackerActiveSlots, pair.attackerReserveQueue, pair.attackerRotationSeenCardIds, slotIndex, attacker.guildCard, random);
        const nextTarget = rotateCardSide(target.cards, pair.targetActiveSlots, pair.targetReserveQueue, pair.targetRotationSeenCardIds, slotIndex, target.guildCard, random);
        pair.attackerActiveSlots = nextAttacker.activeSlots;
        pair.attackerReserveQueue = nextAttacker.reserveQueue;
        pair.attackerRotationSeenCardIds = nextAttacker.rotationSeenCardIds;
        syncParticipantAttackerState(attacker, pair);
        pair.targetActiveSlots = nextTarget.activeSlots;
        pair.targetReserveQueue = nextTarget.reserveQueue;
        pair.targetRotationSeenCardIds = nextTarget.rotationSeenCardIds;
      } else {
        const nextAttacker = rotateCardSide(attacker.cards, attacker.activeSlots, attacker.reserveQueue, attacker.rotationSeenCardIds, slotIndex, attacker.guildCard, random);
        attacker.activeSlots = nextAttacker.activeSlots;
        attacker.reserveQueue = nextAttacker.reserveQueue;
        attacker.rotationSeenCardIds = nextAttacker.rotationSeenCardIds;
      }
      attacker.cooldownUntil[slotIndex] = null;
      changed = true;
    }
  }
  return changed;
}

function withoutArtifacts(modifiers: ArenaBattleParticipantSnapshot["modifiers"]): ArenaBattleParticipantSnapshot["modifiers"] {
  const { equipment: _equipment, ...rest } = modifiers;
  return rest;
}

/** At zero HP the amulet revives first; on the next death the doll curses the killer. Each works once. */
function applyDeathArtifacts(fallen: ArenaBattleParticipantSnapshot, killer: ArenaBattleParticipantSnapshot): ArenaLogArtifact | null {
  const equipment = fallen.modifiers.equipment;
  if (fallen.hp > 0 || !equipment) return null;
  const state = fallen.modifiers.equipmentState ?? { reviveUsed: false, voodooUsed: false };
  let slot: ArenaLogArtifact["slot"];
  if (!state.reviveUsed && equipment.reviveHpPct > 0) {
    fallen.hp = Math.max(1, Math.round(fallen.maxHp * equipment.reviveHpPct / 100));
    state.reviveUsed = true;
    slot = "amulet";
  } else if (!state.voodooUsed && equipment.voodooHpReductionPct > 0) {
    killer.hp = Math.max(0, killer.hp - Math.round(killer.maxHp * equipment.voodooHpReductionPct / 100));
    state.voodooUsed = true;
    slot = "voodoo";
  } else {
    return null;
  }
  fallen.modifiers.equipmentState = state;
  return { ownerId: fallen.id, slot };
}

/** A curse can kill its target, so the other side's artifacts get their turn too. */
function settleDeathArtifacts(first: ArenaBattleParticipantSnapshot, second: ArenaBattleParticipantSnapshot) {
  return [applyDeathArtifacts(first, second), applyDeathArtifacts(second, first), applyDeathArtifacts(first, second)]
    .filter((fired): fired is ArenaLogArtifact => fired !== null);
}

function attack(state: ArenaState, attacker: ArenaBattleParticipantSnapshot, slotIndex: 0 | 1 | 2, now: number, random: RandomSource) {
  const target = normalizeTarget(state, attacker, random);
  if (!target) return false;
  const pair = getPairState(state, attacker, target);
  if (!readyAt(attacker.cooldownUntil[slotIndex], now)) return false;
  const attackerCard = pair.attackerActiveSlots[slotIndex];
  const targetCard = pair.targetActiveSlots[slotIndex];
  const result = calculateArenaDamage({
    attacker: attackerCard,
    attackerModifiers: attacker.modifiers,
    defender: targetCard,
    defenderModifiers: target.modifiers,
  });
  target.hp = Math.max(0, target.hp - result.damage);
  const reflectedDamage = Math.round(attackerCard.finalPower * (target.modifiers.equipment?.damageReflectionPct ?? 0) / 100);
  attacker.hp = Math.max(0, attacker.hp - reflectedDamage);
  const artifacts = settleDeathArtifacts(target, attacker);
  // A strike is an exchange, as in a duel: the opposing card answers in the same lane.
  // The answer ignores artifacts: the spear does not raise it and the shield does not soften it.
  const attackerHpBeforeCounter = attacker.hp;
  const counter = attackerHpBeforeCounter > 0 ? calculateArenaDamage({
    attacker: targetCard,
    attackerModifiers: withoutArtifacts(target.modifiers),
    defender: attackerCard,
    defenderModifiers: withoutArtifacts(attacker.modifiers),
  }).damage : 0;
  attacker.hp = Math.max(0, attacker.hp - counter);
  artifacts.push(...settleDeathArtifacts(attacker, target));
  target.totalDamageDealt += counter;
  attacker.totalDamageDealt += result.damage;
  attacker.moves = (attacker.moves ?? 0) + 1;
  if (!attacker.isBot) state.lastPlayerActionAt = new Date(now).toISOString();
  // Each used card returns exactly one cooldown after its own strike.
  attacker.cooldownUntil[slotIndex] = new Date(now + ARENA_SLOT_COOLDOWN_MS).toISOString();
  const targetDefeated = target.hp === 0;
  if (targetDefeated) attacker.kills += 1;
  if (attacker.hp === 0 && attackerHpBeforeCounter > 0) target.kills += 1;
  for (const fallen of [target, attacker].filter(({ hp }) => hp === 0)) {
    for (const participant of state.participants) {
      if (participant.targetId === fallen.id) participant.targetId = participant.isBot ? nextBotTarget(state, participant.id, random) : nextTarget(state, participant.id, fallen.id);
    }
  }
  state.battleLog = [...state.battleLog, {
    ...(artifacts.length ? { artifacts } : {}),
    attackerCard,
    ...(attacker.hp === 0 ? { attackerDefeated: true } : {}),
    attackerId: attacker.id,
    attackerName: attacker.name,
    attackerPhotoUrl: attacker.photoUrl,
    counterDamage: counter,
    damage: result.damage,
    id: randomUUID(),
    multiplier: result.multiplier,
    slotIndex,
    targetCard,
    targetDefeated,
    targetId: target.id,
    targetName: target.name,
  }];
  pruneBattleLog(state);
  return true;
}

function selectBotSlot(state: ArenaState, bot: ArenaBattleParticipantSnapshot, now: number, random: RandomSource) {
  const target = normalizeTarget(state, bot, random);
  if (!target) return null;
  const pair = getPairState(state, bot, target);
  const candidates = ([0, 1, 2] as const)
    .filter((slotIndex) => readyAt(bot.cooldownUntil[slotIndex], now))
    .map((slotIndex) => ({
      slotIndex,
      damage: calculateArenaDamage({
        attacker: pair.attackerActiveSlots[slotIndex],
        attackerModifiers: bot.modifiers,
        defender: pair.targetActiveSlots[slotIndex],
        defenderModifiers: target.modifiers,
      }).damage,
      multiplier: getElementMultiplier(pair.attackerActiveSlots[slotIndex].element, pair.targetActiveSlots[slotIndex].element),
    }))
    .sort((left, right) => right.damage - left.damage || right.multiplier - left.multiplier);
  return candidates[0]?.slotIndex ?? null;
}

/** Align legacy active matches to one shared cycle clock once, then keep that clock fixed. */
function ensureCycleTiming(state: ArenaState, now: number) {
  if (state.cyclesStartAt && Number.isFinite(new Date(state.cyclesStartAt).getTime())) return false;
  const cycleStartAt = new Date(now).toISOString();
  const hasCombat = state.battleLog.length > 0 || state.participants.some((participant) => (participant.moves ?? 0) > 0);
  const nextCycleAt = new Date(now + ARENA_SLOT_COOLDOWN_MS).toISOString();
  state.cyclesStartAt = cycleStartAt;
  state.playerLastSeenAt ??= Object.fromEntries(state.participants.filter(({ isBot }) => !isBot).map(({ id }) => [id, cycleStartAt]));
  for (const participant of state.participants) {
    participant.lastBotActionAt = participant.isBot ? cycleStartAt : participant.lastBotActionAt;
    participant.cooldownUntil = participant.cooldownUntil.map((cooldown) => cooldown ? (hasCombat ? nextCycleAt : null) : null) as ArenaBattleParticipantSnapshot["cooldownUntil"];
  }
  if (!hasCombat) state.lastPlayerActionAt = cycleStartAt;
  return true;
}

function hasRecentLivingPlayerPresence(state: ArenaState, now: number) {
  return state.participants.some((participant) => {
    if (participant.isBot || participant.hp <= 0) return false;
    const lastSeenAt = state.playerLastSeenAt?.[participant.id];
    return Boolean(lastSeenAt && now - new Date(lastSeenAt).getTime() <= ARENA_PLAYER_PRESENCE_TIMEOUT_MS);
  });
}

/** Skip missed bot turns while humans are away; resume at the next cycle-aligned turn. */
function alignBotScheduleAfterPause(state: ArenaState, now: number) {
  if (!state.participants.some((participant) => !participant.isBot && participant.hp > 0)
    || hasRecentLivingPlayerPresence(state, now)) return false;
  const cycleStartAt = new Date(state.cyclesStartAt ?? new Date(now).toISOString()).getTime();
  const latestScheduledAt = now < cycleStartAt + ARENA_BOT_ACTION_INTERVAL_MS
    ? cycleStartAt
    : cycleStartAt + Math.floor((now - cycleStartAt) / ARENA_BOT_ACTION_INTERVAL_MS) * ARENA_BOT_ACTION_INTERVAL_MS;
  let changed = false;
  for (const bot of state.participants.filter((participant) => participant.isBot && participant.hp > 0)) {
    const scheduledAt = new Date(latestScheduledAt).toISOString();
    if (bot.lastBotActionAt === scheduledAt) continue;
    bot.lastBotActionAt = scheduledAt;
    changed = true;
  }
  return changed;
}

function advanceBots(state: ArenaState, now: number, random: RandomSource) {
  if (arenaIsOver(state)) return false;
  if (state.lastPlayerActionAt && now - new Date(state.lastPlayerActionAt).getTime() >= ARENA_IDLE_FINISH_MS) {
    state.technicalFinish = true;
    return true;
  }
  let changed = ensureCycleTiming(state, now);
  const pairStateCountBefore = state.pairStates ? Object.keys(state.pairStates).length : 0;
  ensurePairStates(state);
  const pairStateCountAfter = Object.keys(state.pairStates).length;
  const pairStatesChanged = pairStateCountAfter !== pairStateCountBefore;
  const legacyCooldownsMigrated = migrateLegacyPairCooldowns(state);
  const cooldownsAdvanced = advanceCooldowns(state, now, random);
  changed = pairStatesChanged || legacyCooldownsMigrated || cooldownsAdvanced || changed;
  const livingPlayers = state.participants.filter((participant) => !participant.isBot && participant.hp > 0);
  if (livingPlayers.length > 0 && !hasRecentLivingPlayerPresence(state, now)) return alignBotScheduleAfterPause(state, now) || changed;
  for (const bot of state.participants.filter((participant) => participant.isBot && participant.hp > 0)) {
    const cycleStartAt = new Date(state.cyclesStartAt!).getTime();
    const lastAction = bot.lastBotActionAt ? new Date(bot.lastBotActionAt).getTime() : cycleStartAt;
    const scheduledAt = lastAction + ARENA_BOT_ACTION_INTERVAL_MS;
    if (now < scheduledAt) continue;
    const slotIndex = selectBotSlot(state, bot, scheduledAt, random);
    bot.lastBotActionAt = new Date(scheduledAt).toISOString();
    changed = true;
    if (slotIndex === null) continue;
    changed = attack(state, bot, slotIndex, scheduledAt, random) || changed;
    if (arenaIsOver(state)) break;
  }
  return changed;
}

/** Avoid taking the match row lock for the common read-only poll between game events. */
function arenaNeedsAdvance(state: ArenaState, playerId: string, now: number) {
  if (arenaIsOver(state)) return true;
  if (!state.cyclesStartAt) return true;
  if (state.lastPlayerActionAt && now - new Date(state.lastPlayerActionAt).getTime() >= ARENA_IDLE_FINISH_MS) return true;
  const lastSeenAt = state.playerLastSeenAt?.[playerId];
  if (!lastSeenAt || now - new Date(lastSeenAt).getTime() >= ARENA_PLAYER_PRESENCE_SYNC_MS) return true;
  const participantCount = state.participants.length;
  if (Object.keys(state.pairStates ?? {}).length < participantCount * Math.max(0, participantCount - 1)) return true;
  if (Object.values(state.pairStates ?? {}).some((pair) => pair.cooldownUntil?.some((cooldown) => cooldown !== null))) return true;
  return state.participants.some((participant) =>
    participant.cooldownUntil.some((cooldown) => cooldown !== null && readyAt(cooldown, now))
    || (participant.isBot && participant.hp > 0 && (!participant.lastBotActionAt
      || now - new Date(participant.lastBotActionAt).getTime() >= ARENA_BOT_ACTION_INTERVAL_MS)),
  );
}

function currentActionVersion(state: ArenaState, playerId: string) {
  return state.actionVersions?.[playerId] ?? 1;
}

function currentRerollCount(state: ArenaState, playerId: string) {
  return state.rerollCountsByPlayer?.[playerId] ?? 0;
}

function setInitialTargets(state: ArenaState, random: RandomSource) {
  state.participants.forEach((participant) => {
    participant.targetId = participant.isBot ? nextBotTarget(state, participant.id, random) : nextTarget(state, participant.id);
  });
  state.targetId = findParticipant(state, state.playerId)?.targetId ?? null;
}

function resultPlacement(state: ArenaState) {
  const ordered = [...state.participants].sort((left, right) => compareArenaResults(
    { remainingHp: left.hp, kills: left.kills, totalDamageDealt: left.totalDamageDealt },
    { remainingHp: right.hp, kills: right.kills, totalDamageDealt: right.totalDamageDealt },
  ));
  ordered.forEach((participant, index) => { participant.placement = index + 1; });
  return ordered;
}

async function loadPlayer(client: Pick<PoolClient, "query">, playerId: string, lock = false) {
  const result = await client.query<ArenaPlayerRow>(
    `
      SELECT id, first_name, username, photo_url, level, silver, gold, account_xp,
        card_shards, duel_wins, duel_rating, duel_highest_league_index,
        arena_rating, arena_league_index, arena_wins, arena_top3_count, arena_highest_league_index
      FROM players WHERE id = $1 ${lock ? "FOR UPDATE" : ""}
    `,
    [playerId],
  );
  const player = result.rows[0];
  if (!player) throw new ArenaPlayerMissingError();
  return player;
}

async function finishMatch(client: PoolClient, row: ArenaRow, state: ArenaState) {
  const ordered = resultPlacement(state);
  state.resultsByPlayer = {};
  const noWinners = state.technicalFinish === true && aliveParticipants(state).length >= ARENA_NO_WINNERS_ALIVE_COUNT;
  const averageDamage = ordered.reduce((sum, participant) => sum + participant.totalDamageDealt, 0) / ordered.length;
  const liveRatings = await client.query<{ arena_rating: number; id: string }>("SELECT id, arena_rating FROM players WHERE id = ANY($1::uuid[])", [ordered.filter(({ isBot }) => !isBot).map(({ id }) => id)]);
  const ratingOf = new Map(liveRatings.rows.map((entry) => [entry.id, toSafeInteger(entry.arena_rating, "arena rating")]));
  for (const participant of ordered.filter(({ isBot }) => !isBot)) {
    if (!participant.placement) throw new Error("Arena player placement is missing");
    const player = await loadPlayer(client, participant.id, true);
    const placement = participant.placement;
    const moves = participant.moves ?? 0;
    const counted = moves >= ARENA_MIN_COUNTED_MOVES;
    const won = !noWinners && placement <= 3;
    const ratingBefore = toSafeInteger(player.arena_rating, "arena rating");
    // Bots are matched to the player's league, so they count at the player's own rating.
    const opponentRatings = ordered.filter(({ id }) => id !== participant.id).map(({ id }) => ratingOf.get(id) ?? ratingBefore);
    const averageOpponentRating = opponentRatings.reduce((sum, rating) => sum + rating, 0) / opponentRatings.length;
    const ratingChange = noWinners
      ? 0
      : calculateArenaRatingChange({ averageDamage, averageOpponentRating, damageDealt: participant.totalDamageDealt, placement, playerRating: ratingBefore });
    const leagueBeforeIndex = toSafeInteger(player.arena_league_index, "arena league");
    const highestBefore = toSafeInteger(player.arena_highest_league_index, "arena highest league");
    const ratingAfter = Math.max(0, ratingBefore + ratingChange);
    const leagueAfterIndex = getArenaLeagueIndexAfter(ratingAfter, leagueBeforeIndex);
    // Every league first reached on the way up pays its one-time silver.
    const promotionSilver = ARENA_LEAGUE_CONFIG.leagues
      .filter(({ index }) => index > highestBefore && index <= leagueAfterIndex)
      .reduce((sum, league) => sum + league.promotionReward, 0);
    const updated = await client.query<ArenaPlayerRow>(
      `
        UPDATE players SET
          silver = silver + $2,
          arena_rating = $3,
          arena_league_index = $4,
          arena_highest_league_index = GREATEST(arena_highest_league_index, $4),
          arena_wins = arena_wins + $5,
          arena_top3_count = arena_top3_count + $5,
          updated_at = NOW()
        WHERE id = $1
        RETURNING id, first_name, username, photo_url, level, silver, gold, account_xp,
          card_shards, duel_wins, duel_rating, duel_highest_league_index,
          arena_rating, arena_league_index, arena_highest_league_index, arena_wins, arena_top3_count
      `,
      [participant.id, promotionSilver, ratingAfter, leagueAfterIndex, won ? 1 : 0],
    );
    const updatedPlayer = updated.rows[0];
    if (!updatedPlayer) throw new Error("Arena reward update returned no player");
    state.resultsByPlayer[participant.id] = {
      leagueAfter: toLeagueView(leagueAfterIndex),
      leagueBefore: toLeagueView(leagueBeforeIndex),
      player: toPlayerSummary(updatedPlayer),
      reward: {
        counted,
        moves,
        placement,
        promotionSilver,
        ratingAfter,
        ratingBefore,
        ratingChange,
        status: won ? "win" : "loss",
      },
    };
    if (!counted) continue;
    await client.query("INSERT INTO player_campaign_events (player_id, event_type, payload) VALUES ($1, 'ARENA_FINISHED', $2)", [participant.id, JSON.stringify({ matchId: row.id })]);
    if (won) await client.query("INSERT INTO player_campaign_events (player_id, event_type, payload) VALUES ($1, 'ARENA_WON', $2)", [participant.id, JSON.stringify({ matchId: row.id })]);
    // The arena pays no player XP, so it adds nothing to the guild (reference: guild XP is the XP members earn).
  }
  state.result = state.resultsByPlayer[row.player_id] ?? null;
  state.targetId = null;
  await client.query(
    `UPDATE arena_matches SET status = 'finished', state = $2, result = $3, version = version + 1, updated_at = NOW(), finished_at = NOW() WHERE id = $1`,
    [row.id, JSON.stringify(state), state.result ? JSON.stringify(state.result) : null],
  );
  return state.result;
}

/**
 * The reference log shows the player's strikes, strikes on the player, other participants' strikes on
 * the player's current target, and every death with its killer.
 */
function concernsPlayer(entry: ArenaBattleLogEntry, player: ArenaBattleParticipantSnapshot) {
  return entry.attackerId === player.id
    || entry.targetId === player.id
    || (player.targetId !== null && entry.targetId === player.targetId)
    || entry.targetDefeated
    || entry.attackerDefeated === true
    || Boolean(entry.artifacts?.length);
}

function playerBattleLog(state: ArenaState, player: ArenaBattleParticipantSnapshot) {
  return state.battleLog.filter((entry) => concernsPlayer(entry, player)).slice(-MAX_ARENA_LOG_ENTRIES).reverse();
}

/** Keeps only strikes still among some live player's last seven, so the stored match state stays small. */
function pruneBattleLog(state: ArenaState) {
  const kept = new Set<string>();
  for (const player of state.participants.filter(({ isBot }) => !isBot)) {
    for (const entry of state.battleLog.filter((candidate) => concernsPlayer(candidate, player)).slice(-MAX_ARENA_LOG_ENTRIES)) kept.add(entry.id);
  }
  state.battleLog = state.battleLog.filter(({ id }) => kept.has(id));
}

function toView(row: ArenaRow, playerId: string, playerGold: number): ArenaView {
  const player = findParticipant(row.state, playerId);
  if (!player) throw new Error("Arena player participant is missing");
  const target = player.targetId && player.targetId !== player.id ? findParticipant(row.state, player.targetId) : null;
  const pair = target ? getPairState(row.state, player, target) : null;
  const noWinners = row.state.technicalFinish === true && aliveParticipants(row.state).length >= ARENA_NO_WINNERS_ALIVE_COUNT;
  const toSlot = (card: DuelCardSnapshot, cooldownUntil: string | null): ArenaCardSlot => ({
    // Expired lanes stay face down until advanceCooldowns rotates their cards.
    card: cooldownUntil === null ? card : null,
    cooldownUntil,
  });
  return {
    actionVersion: currentActionVersion(row.state, playerId),
    battleLog: playerBattleLog(row.state, player),
    changeCardsCost: getArenaCardChangeCost(currentRerollCount(row.state, playerId) + 1),
    matchId: row.id,
    participants: row.state.participants.map((participant) => ({
      alive: participant.hp > 0,
      cooldownUntil: participant.cooldownUntil,
      effectiveDeckPower: participant.effectiveDeckPower,
      hp: participant.hp,
      id: participant.id,
      isBot: participant.isBot,
      kills: participant.kills,
      level: participant.level,
      maxHp: participant.maxHp,
      moves: participant.moves ?? 0,
      name: participant.name,
      photoUrl: participant.photoUrl,
      ...(participant.artifactItemIds?.length ? { artifactItemIds: participant.artifactItemIds } : {}),
      ...(participant.placement ? { placement: participant.placement } : {}),
      totalDamageDealt: participant.totalDamageDealt,
    })),
    winnerIds: noWinners ? [] : row.state.participants.filter((participant) => (participant.placement ?? Infinity) <= 3).map(({ id }) => id),
    playerGold,
    playerId,
    playerSlots: pair
      ? [toSlot(pair.attackerActiveSlots[0], player.cooldownUntil[0]), toSlot(pair.attackerActiveSlots[1], player.cooldownUntil[1]), toSlot(pair.attackerActiveSlots[2], player.cooldownUntil[2])]
      : [toSlot(player.activeSlots[0], null), toSlot(player.activeSlots[1], null), toSlot(player.activeSlots[2], null)],
    ...((row.state.resultsByPlayer?.[playerId] ?? (playerId === row.player_id ? row.state.result : null)) ? { result: row.state.resultsByPlayer?.[playerId] ?? row.state.result! } : {}),
    status: row.status,
    targetId: player.targetId,
    targetSlots: pair && target
      ? [toSlot(pair.targetActiveSlots[0], player.cooldownUntil[0]), toSlot(pair.targetActiveSlots[1], player.cooldownUntil[1]), toSlot(pair.targetActiveSlots[2], player.cooldownUntil[2])]
      : null,
    version: row.version,
  };
}

async function loadBalance(client: PoolClient, playerId: string) {
  const result = await client.query<{ gold: string | number }>(
    "SELECT gold FROM players WHERE id = $1",
    [playerId],
  );
  const row = result.rows[0];
  if (!row) throw new ArenaPlayerMissingError();
  return { playerGold: toSafeInteger(row.gold, "gold") };
}

function rowToArena(row: { id: string; player_id: string; state: ArenaState; result: ArenaResult | null; status: "active" | "finished"; version: number }): ArenaRow {
  return row;
}

interface QueueHeadRow { arena_league_index: number; created_at: string | Date; id: string; participant_count: number | string; }
interface QueueHead { createdAt: number; leagueIndex: number; participantCount: number; queueId: string; startsAt: number; }

function toQueueHead(row: QueueHeadRow): QueueHead {
  const createdAt = new Date(row.created_at).getTime();
  const participantCount = Math.min(ARENA_PARTICIPANT_COUNT, toSafeInteger(row.participant_count, "arena queue size"));
  const leagueIndex = toSafeInteger(row.arena_league_index, "arena league");
  return { createdAt, leagueIndex, participantCount, queueId: row.id, startsAt: createdAt + getArenaQueueDurationMs(leagueIndex, participantCount) };
}

/** Queue timers and their participants are isolated by Arena league. */
async function loadQueueHead(client: Pick<PoolClient, "query">, leagueIndex: number) {
  const result = await client.query<QueueHeadRow>(
    `SELECT q.id, q.created_at, p.arena_league_index,
       (SELECT COUNT(*)::integer FROM arena_queue q2 JOIN players p2 ON p2.id = q2.player_id WHERE p2.arena_league_index = p.arena_league_index) AS participant_count
     FROM arena_queue q JOIN players p ON p.id = q.player_id
     WHERE p.arena_league_index = $1
     ORDER BY q.created_at ASC, q.id ASC LIMIT 1`,
    [leagueIndex],
  );
  return result.rows[0] ? toQueueHead(result.rows[0]) : null;
}

async function loadQueueHeads(client: Pick<PoolClient, "query">) {
  const result = await client.query<QueueHeadRow>(
    `SELECT DISTINCT ON (p.arena_league_index) q.id, q.created_at, p.arena_league_index,
       (SELECT COUNT(*)::integer FROM arena_queue q2 JOIN players p2 ON p2.id = q2.player_id WHERE p2.arena_league_index = p.arena_league_index) AS participant_count
     FROM arena_queue q JOIN players p ON p.id = q.player_id
     ORDER BY p.arena_league_index ASC, q.created_at ASC, q.id ASC`,
  );
  return result.rows.map(toQueueHead).sort((left, right) => left.startsAt - right.startsAt || left.createdAt - right.createdAt);
}

function toQueueView(queueId: string, head: QueueHead): ArenaQueueView {
  return {
    createdAt: new Date(head.createdAt).toISOString(),
    maxParticipants: ARENA_PARTICIPANT_COUNT,
    participantCount: head.participantCount,
    queueId,
    startsAt: new Date(head.startsAt).toISOString(),
  };
}

async function loadActiveArenaRow(client: Pick<PoolClient, "query">, playerId: string, lock = false) {
  const result = await client.query<ArenaRow>(
    `
      SELECT m.id, m.player_id, m.state, m.result, m.status, m.version
      FROM arena_matches m
      WHERE m.status = 'active'
        AND (m.player_id = $1 OR EXISTS (
          SELECT 1 FROM arena_match_players mp
          WHERE mp.match_id = m.id AND mp.player_id = $1
        ))
      ORDER BY m.created_at DESC
      LIMIT 1
      ${lock ? "FOR UPDATE" : ""}
    `,
    [playerId],
  );
  return result.rows[0] ?? null;
}

export class ArenaAlreadyActiveError extends Error {
  constructor() { super("Player already has an active Arena match"); this.name = "ArenaAlreadyActiveError"; }
}
export class ArenaMissingError extends Error {
  constructor() { super("Arena match does not exist"); this.name = "ArenaMissingError"; }
}
export class ArenaStateConflictError extends Error {
  constructor() { super("Arena state version is stale or the match is already finished"); this.name = "ArenaStateConflictError"; }
}
export class ArenaLockedError extends Error {
  constructor() { super("Arena opens at the required duel rating"); this.name = "ArenaLockedError"; }
}

function playerArenaUnlocked(player: Pick<ArenaPlayerRow, "duel_highest_league_index" | "duel_rating">) {
  return isArenaUnlocked(toSafeInteger(player.duel_rating, "duel rating"), toSafeInteger(player.duel_highest_league_index, "duel league"));
}

export class ArenaDeckInvalidError extends DuelDeckInvalidError {
  constructor() { super(); this.name = "ArenaDeckInvalidError"; }
}
export class ArenaPlayerMissingError extends Error {
  constructor() { super("Arena player does not exist"); this.name = "ArenaPlayerMissingError"; }
}
export class ArenaInsufficientGoldError extends Error {
  constructor() { super("Not enough Gold for this card change"); this.name = "ArenaInsufficientGoldError"; }
}
export class ArenaService {
  private readonly chat: ChatChannel;

  constructor(
    private readonly pool: Pool,
    private readonly random: RandomSource = Math.random,
  ) {
    this.chat = new ChatChannel(pool, "arena_chat_messages");
  }

  getChat(): Promise<ChatView> {
    return this.chat.read();
  }

  sendChatMessage(playerId: string, body: string): Promise<ChatMessage> {
    return this.chat.send(playerId, body);
  }

  async getProfile(playerId: string): Promise<ArenaProfileResponse> {
    const player = await loadPlayer(this.pool, playerId);
    const dailyTasks = await loadArenaDailyTasks(this.pool, playerId);
    return {
      dailyTasks,
      arenaLeague: toLeagueView(toSafeInteger(player.arena_league_index, "arena league")),
      nextArenaLeague: toSafeInteger(player.arena_league_index, "arena league") < ARENA_LEAGUE_CONFIG.leagues.length - 1 ? toLeagueView(toSafeInteger(player.arena_league_index, "arena league") + 1) : null,
      arenaRating: toSafeInteger(player.arena_rating, "arena rating"),
      arenaTop3Count: toSafeInteger(player.arena_top3_count, "arena top 3 count"),
      arenaWins: toSafeInteger(player.arena_wins, "arena wins"),
      cardShards: toSafeInteger(player.card_shards, "card shards"),
      unlocked: playerArenaUnlocked(player),
    };
  }

  async getLeaderboard(playerId: string): Promise<ArenaLeaderboardResponse> {
    const player = await loadPlayer(this.pool as unknown as Pick<PoolClient, "query">, playerId);
    const leagueIndex = toSafeInteger(player.arena_league_index, "arena league");
    const name = "COALESCE(NULLIF(nickname, ''), NULLIF(first_name, ''), username, 'Гравець')";
    const top = await this.pool.query<{ id: string; name: string; photo_url: string | null; arena_rating: number }>(
      `SELECT id, ${name} AS name, photo_url, arena_rating FROM players WHERE arena_league_index = $1 AND ${ARENA_RECENT_FIGHT_SQL} ORDER BY arena_rating DESC, id LIMIT 100`,
      [leagueIndex],
    );
    const rating = toSafeInteger(player.arena_rating, "arena rating");
    const ahead = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM players WHERE arena_league_index = $1 AND ${ARENA_RECENT_FIGHT_SQL} AND (arena_rating > $2 OR (arena_rating = $2 AND id < $3))`,
      [leagueIndex, rating, playerId],
    );
    const entries = top.rows.map((entry, index) => ({ name: entry.name, photoUrl: entry.photo_url, playerId: entry.id, rank: index + 1, rating: toSafeInteger(entry.arena_rating, "arena rating") }));
    return {
      entries,
      league: toLeagueView(leagueIndex),
      player: { name: player.first_name ?? player.username ?? "Гравець", photoUrl: player.photo_url, playerId, rank: Number(ahead.rows[0]?.count ?? 0) + 1, rating },
    };
  }

  private async startReadyQueue(client: PoolClient, now: number) {
    const heads = await loadQueueHeads(client);
    for (const head of heads) {
      if (now < head.startsAt) continue;
      const lockedHead = await client.query<{ id: string }>(
        "SELECT id FROM arena_queue WHERE id = $1 FOR UPDATE SKIP LOCKED",
        [head.queueId],
      );
      if (!lockedHead.rows[0]) continue;

      const queued = await client.query<{ created_at: string | Date; id: string; player_id: string }>(
        `SELECT q.id, q.player_id, q.created_at
         FROM arena_queue q JOIN players p ON p.id = q.player_id
         WHERE p.arena_league_index = $1
         ORDER BY q.created_at ASC, q.id ASC LIMIT $2 FOR UPDATE OF q SKIP LOCKED`,
        [head.leagueIndex, ARENA_PARTICIPANT_COUNT],
      );
      const players: QueuedArenaPlayer[] = [];
      for (const entry of queued.rows) {
        try {
          const loaded = await loadDuelParticipant(client, entry.player_id, "arena");
          players.push({
            createdAt: entry.created_at,
            guildCard: toGuildDuelCard(loaded.guildCard),
            id: entry.id,
            playerId: entry.player_id,
            snapshot: loaded.snapshot,
          });
        } catch {
          // A deck can become invalid while a player is waiting. It must not hold
          // the rest of this league's registration window hostage.
          await client.query("DELETE FROM arena_queue WHERE id = $1", [entry.id]);
        }
      }
      if (!players.length) continue;

      const state = createArenaState(players, this.random, now, head.leagueIndex);
      await client.query(
        `INSERT INTO arena_matches (id, player_id, status, state) VALUES ($1, $2, 'active', $3)`,
        [state.matchId, state.playerId, JSON.stringify(state)],
      );
      for (const player of players) {
        await client.query(
          "INSERT INTO arena_match_players (match_id, player_id, joined_at) VALUES ($1, $2, $3)",
          [state.matchId, player.playerId, player.createdAt],
        );
        await client.query("DELETE FROM arena_queue WHERE id = $1", [player.id]);
      }
      return rowToArena({ id: state.matchId, player_id: state.playerId, result: null, state, status: "active", version: 1 });
    }
    return null;
  }

  private async queueView(client: Pick<PoolClient, "query">, playerId: string) {
    const own = await client.query<{ arena_league_index: number; id: string }>(
      "SELECT q.id, p.arena_league_index FROM arena_queue q JOIN players p ON p.id = q.player_id WHERE q.player_id = $1",
      [playerId],
    );
    const ownRow = own.rows[0];
    if (!ownRow) return null;
    const head = await loadQueueHead(client, toSafeInteger(ownRow.arena_league_index, "arena league"));
    return head ? toQueueView(ownRow.id, head) : null;
  }

  async joinQueue(playerId: string): Promise<ArenaQueueResponse> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      if (await loadActiveArenaRow(client, playerId)) throw new ArenaAlreadyActiveError();
      if (!playerArenaUnlocked(await loadPlayer(client, playerId))) throw new ArenaLockedError();
      await loadDuelParticipant(client, playerId, "arena").catch(() => { throw new ArenaDeckInvalidError(); });
      const queued = await client.query<{ created_at: string | Date; id: string }>("SELECT id, created_at FROM arena_queue WHERE player_id = $1 FOR UPDATE", [playerId]);
      const queueId = queued.rows[0]?.id ?? randomUUID();
      if (!queued.rows[0]) {
        await client.query("INSERT INTO arena_queue (id, player_id) VALUES ($1, $2) ON CONFLICT (player_id) DO NOTHING", [queueId, playerId]);
      }
      const registered = await client.query<{ created_at: string | Date; id: string }>("SELECT id, created_at FROM arena_queue WHERE player_id = $1 FOR UPDATE", [playerId]);
      const registeredQueueId = registered.rows[0]?.id ?? queueId;
      const started = await this.startReadyQueue(client, Date.now());
      const queue = await this.queueView(client, playerId);
      const balance = await loadBalance(client, playerId);
      await client.query("COMMIT");
      if (started && findParticipant(started.state, playerId)) {
        return { match: toView(started, playerId, balance.playerGold), queue: null, queueId: registeredQueueId };
      }
      return { match: null, queue, queueId: registeredQueueId };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  async leaveQueue(playerId: string) {
    // The league's timer stays anchored to the first registration: when that player
    // leaves, the next one inherits the start, so leaving only adds the 5-second step.
    await this.pool.query(
      `WITH gone AS (
         DELETE FROM arena_queue WHERE player_id = $1
         RETURNING created_at, (SELECT arena_league_index FROM players WHERE id = $1) AS league
       ), next_head AS (
         SELECT q.id FROM arena_queue q JOIN players p ON p.id = q.player_id, gone
         WHERE p.arena_league_index = gone.league AND q.player_id <> $1
         ORDER BY q.created_at ASC, q.id ASC LIMIT 1
       )
       UPDATE arena_queue SET created_at = gone.created_at
       FROM gone, next_head
       WHERE arena_queue.id = next_head.id AND arena_queue.created_at > gone.created_at`,
      [playerId],
    );
    return { left: true };
  }

  /** "Someone is in the arena": unfinished arena tasks and another player of this league in the queue. */
  async getPresence(playerId: string): Promise<ArenaPresenceResponse> {
    if (!playerArenaUnlocked(await loadPlayer(this.pool, playerId))) return { someoneQueued: false };
    const tasks = await loadArenaDailyTasks(this.pool, playerId);
    if (tasks.play.progress >= tasks.play.target && tasks.win.progress >= tasks.win.target) return { someoneQueued: false };
    const queued = await this.pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM arena_queue q JOIN players p ON p.id = q.player_id
         WHERE q.player_id <> $1 AND p.arena_league_index = (SELECT arena_league_index FROM players WHERE id = $1)
       ) AS exists`,
      [playerId],
    );
    return { someoneQueued: queued.rows[0]?.exists === true };
  }

  async findActive(playerId: string): Promise<ActiveArenaResponse> {
    const active = await loadActiveArenaRow(this.pool, playerId);
    if (active) {
      if (!arenaNeedsAdvance(active.state, playerId, Date.now())) {
        const balance = await this.pool.query<{ gold: string | number }>("SELECT gold FROM players WHERE id = $1", [playerId]);
        const row = balance.rows[0];
        if (!row) throw new ArenaPlayerMissingError();
        return { arena: toView(active, playerId, toSafeInteger(row.gold, "gold")), queue: null };
      }
      return { arena: await this.advanceAndView(playerId, active), queue: null };
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.startReadyQueue(client, Date.now());
      const started = await loadActiveArenaRow(client, playerId);
      if (started) {
        const balance = await loadBalance(client, playerId);
        await client.query("COMMIT");
        return { arena: toView(started, playerId, balance.playerGold), queue: null };
      }
      const queue = await this.queueView(client, playerId);
      if (queue) {
        await client.query("COMMIT");
        return { arena: null, queue };
      }
      const finished = await client.query<ArenaRow>(
        `
          SELECT m.id, m.player_id, m.state, m.result, m.status, m.version
          FROM arena_matches m
          WHERE m.status = 'finished'
            AND (m.player_id = $1 OR EXISTS (
              SELECT 1 FROM arena_match_players mp
              WHERE mp.match_id = m.id AND mp.player_id = $1
            ))
          ORDER BY m.created_at DESC LIMIT 1
        `,
        [playerId],
      );
      const balance = await loadBalance(client, playerId);
      await client.query("COMMIT");
      return {
        arena: finished.rows[0] ? toView(finished.rows[0], playerId, balance.playerGold) : null,
        queue: null,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async advanceAndView(playerId: string, source: ArenaRow) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const locked = await client.query<ArenaRow>(
        `
          SELECT m.id, m.player_id, m.state, m.result, m.status, m.version
          FROM arena_matches m
          WHERE m.id = $1 AND (m.player_id = $2 OR EXISTS (
            SELECT 1 FROM arena_match_players mp
            WHERE mp.match_id = m.id AND mp.player_id = $2
          ))
          FOR UPDATE
        `,
        [source.id, playerId],
      );
      const row = locked.rows[0];
      if (!row) throw new ArenaMissingError();
      const now = Date.now();
      const pausedScheduleAligned = row.status === "active" && alignBotScheduleAfterPause(row.state, now);
      const previousSeenAt = row.state.playerLastSeenAt?.[playerId];
      const presenceChanged = row.status === "active" && (!previousSeenAt || now - new Date(previousSeenAt).getTime() >= ARENA_PLAYER_PRESENCE_SYNC_MS);
      if (presenceChanged) {
        row.state.playerLastSeenAt ??= {};
        row.state.playerLastSeenAt[playerId] = new Date(now).toISOString();
      }
      const changed = row.status === "active" ? advanceBots(row.state, now, this.random) : false;
      if (row.status === "active" && arenaIsOver(row.state)) {
        await finishMatch(client, row, row.state);
        row.status = "finished";
        row.version += 1;
      } else if (changed || presenceChanged || pausedScheduleAligned) {
        await client.query("UPDATE arena_matches SET state = $2, version = version + 1, updated_at = NOW() WHERE id = $1", [row.id, JSON.stringify(row.state)]);
        row.version += 1;
      }
      const balance = await loadBalance(client, playerId);
      await client.query("COMMIT");
      return toView(row, playerId, balance.playerGold);
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
    finally { client.release(); }
  }

  async action(playerId: string, matchId: string, input: ArenaActionRequest): Promise<ArenaView> {
    return this.mutate(playerId, matchId, input.expectedVersion, (state, now) => {
      const player = findParticipant(state, playerId);
      if (!player || player.hp <= 0) return false;
      if (!normalizeTarget(state, player, this.random)) return false;
      return attack(state, player, input.slotIndex, now, this.random);
    });
  }

  async changeTarget(playerId: string, matchId: string, input: ArenaVersionRequest): Promise<ArenaView> {
    return this.mutate(playerId, matchId, input.expectedVersion, (state) => {
      const player = findParticipant(state, playerId);
      if (!player || player.hp <= 0) return false;
      // The participant snapshot is the canonical player hand. Pair state is
      // target-specific and must never make a target switch reroll the hand.
      const currentAttackerState = {
        attackerActiveSlots: player.activeSlots,
        attackerReserveQueue: player.reserveQueue,
        attackerRotationSeenCardIds: player.rotationSeenCardIds,
      };
      const requestedTargetId = input.targetId?.trim();
      if (requestedTargetId) {
        const requestedTarget = findParticipant(state, requestedTargetId);
        if (!requestedTarget || requestedTarget.id === playerId || requestedTarget.hp <= 0 || requestedTarget.id === player.targetId) return false;
        player.targetId = requestedTarget.id;
        syncPairAttackerState(getPairState(state, player, requestedTarget), currentAttackerState);
        syncParticipantAttackerState(player, currentAttackerState);
        if (player.id === state.playerId) state.targetId = requestedTarget.id;
        return true;
      }
      const currentIndex = state.participants.findIndex((participant) => participant.id === player.targetId);
      for (let offset = 1; offset <= state.participants.length; offset += 1) {
        const candidate = state.participants[(currentIndex + offset + state.participants.length) % state.participants.length];
        if (candidate && candidate.id !== playerId && candidate.hp > 0) {
          player.targetId = candidate.id;
          syncPairAttackerState(getPairState(state, player, candidate), currentAttackerState);
          syncParticipantAttackerState(player, currentAttackerState);
          if (player.id === state.playerId) state.targetId = candidate.id;
          return true;
        }
      }
      return false;
    });
  }

  async changeCards(playerId: string, matchId: string, input: ArenaVersionRequest): Promise<ArenaView> {
    return this.mutate(playerId, matchId, input.expectedVersion, async (state, now, client) => {
      const player = findParticipant(state, playerId);
      if (!player || player.hp <= 0) return false;
      const target = normalizeTarget(state, player, this.random);
      if (!target) return false;
      const pair = getPairState(state, player, target);
      const changeNumber = currentRerollCount(state, playerId) + 1;
      const cost = getArenaCardChangeCost(changeNumber);
      const balance = await client.query<{ gold: string | number }>("SELECT gold FROM players WHERE id = $1 FOR UPDATE", [playerId]);
      const gold = toSafeInteger(balance.rows[0]?.gold ?? 0, "gold");
      if (gold < cost) throw new ArenaInsufficientGoldError();
      if (cost > 0) {
        const updated = await client.query("UPDATE players SET gold = gold - $2, updated_at = NOW() WHERE id = $1 AND gold >= $2", [playerId, cost]);
        if (updated.rowCount !== 1) throw new ArenaInsufficientGoldError();
      }
      ([0, 1, 2] as const).forEach((slotIndex) => {
        if (readyAt(player.cooldownUntil[slotIndex], now)) {
          const nextAttacker = rotateCardSide(player.cards, pair.attackerActiveSlots, pair.attackerReserveQueue, pair.attackerRotationSeenCardIds, slotIndex, player.guildCard, this.random);
          pair.attackerActiveSlots = nextAttacker.activeSlots;
          pair.attackerReserveQueue = nextAttacker.reserveQueue;
          pair.attackerRotationSeenCardIds = nextAttacker.rotationSeenCardIds;
        }
      });
      syncParticipantAttackerState(player, pair);
      state.rerollCountsByPlayer ??= {};
      state.rerollCountsByPlayer[playerId] = changeNumber;
      return true;
    });
  }

  private async mutate(
    playerId: string,
    matchId: string,
    expectedVersion: number,
    callback: (state: ArenaState, now: number, client: PoolClient) => boolean | Promise<boolean>,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const locked = await client.query<ArenaRow>(
        `
          SELECT m.id, m.player_id, m.state, m.result, m.status, m.version
          FROM arena_matches m
          WHERE m.id = $1 AND (m.player_id = $2 OR EXISTS (
            SELECT 1 FROM arena_match_players mp
            WHERE mp.match_id = m.id AND mp.player_id = $2
          ))
          FOR UPDATE
        `,
        [matchId, playerId],
      );
      const row = locked.rows[0];
      if (!row) throw new ArenaMissingError();
      const playerActionVersion = currentActionVersion(row.state, playerId);
      // Accept this player's revision across unrelated match updates, while still
      // accepting a current match revision from older clients.
      if (row.status !== "active" || (row.version !== expectedVersion && playerActionVersion !== expectedVersion)) throw new ArenaStateConflictError();
      const now = Date.now();
      const pausedScheduleAligned = alignBotScheduleAfterPause(row.state, now);
      const previousSeenAt = row.state.playerLastSeenAt?.[playerId];
      const presenceChanged = !previousSeenAt || now - new Date(previousSeenAt).getTime() >= ARENA_PLAYER_PRESENCE_SYNC_MS;
      if (presenceChanged) {
        row.state.playerLastSeenAt ??= {};
        row.state.playerLastSeenAt[playerId] = new Date(now).toISOString();
      }
      const advanced = advanceBots(row.state, now, this.random);
      const changed = await callback(row.state, now, client);
      if (changed) {
        row.state.actionVersions ??= {};
        row.state.actionVersions[playerId] = playerActionVersion + 1;
        row.state.lastPlayerActionAt = new Date(now).toISOString();
      }
      if (arenaIsOver(row.state)) {
        await finishMatch(client, row, row.state);
        row.status = "finished";
        row.version += 1;
      } else if (advanced || changed || presenceChanged || pausedScheduleAligned) {
        await client.query("UPDATE arena_matches SET state = $2, version = version + 1, updated_at = NOW() WHERE id = $1", [row.id, JSON.stringify(row.state)]);
        row.version += 1;
      }
      const balance = await loadBalance(client, playerId);
      await client.query("COMMIT");
      return toView(row, playerId, balance.playerGold);
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
    finally { client.release(); }
  }
}
