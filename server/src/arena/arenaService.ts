import { randomUUID } from "node:crypto";
import {
  ARENA_BOT_ACTION_INTERVAL_MS,
  ARENA_GOLD_DAILY_CAP,
  ARENA_PARTICIPANT_COUNT,
  ARENA_QUEUE_DURATION_MS,
  ARENA_SLOT_COOLDOWN_MS,
  calculateArenaDamage,
  compareArenaResults,
  cycleCardPoolSlotWithGuildCard,
  getArenaCardChangeCost,
  getArenaReward,
  getElementMultiplier,
  getPlayerCollectionModifiers,
  getStartingHp,
  initializeCyclicCardPool,
  shuffleCards,
  STARTER_EQUIPMENT_DEFINITIONS,
  type RandomSource,
} from "@cardastika/game-core";
import {
  DUEL_LEAGUE_CONFIG,
  getLeagueByRating,
  getLeagueIndexByRating,
  type ArenaActionRequest,
  type ActiveArenaResponse,
  type ArenaBattleLogEntry,
  type ArenaBattleParticipantSnapshot,
  type ArenaCardSlot,
  type ArenaCosmetic,
  type ArenaCosmeticType,
  type ArenaLeagueView,
  type ArenaPairInteractionSnapshot,
  type ArenaProfileResponse,
  type ArenaQueueResponse,
  type ArenaQueueView,
  type ArenaResult,
  type ArenaShopCatalogResponse,
  type ArenaShopPurchaseResponse,
  type ArenaVersionRequest,
  type ArenaView,
  type CardRarity,
  type CollectionCompletionNotice,
  type DuelCardSnapshot,
  type DuelSideSnapshot,
  type PlayerSummary,
} from "@cardastika/shared";
import type { Pool, PoolClient } from "pg";
import type { GuildActivityRecorder } from "../guild/guildService.js";
import { getCompletedCollectionModifiers, recordCardDiscovery } from "../collections/discoveryService.js";
import { getCurrencyBoostStatus } from "../boosts/currencyBoost.js";
import { recalculateAutomaticDeck } from "../decks/automaticDeckService.js";
import { createStandardCardInstance, CryptoCardRandomSource } from "../cards/cardInstanceCreator.js";
import { loadDuelParticipant, toGuildDuelCard, DuelDeckInvalidError } from "../duel/duelService.js";
import { getBotCardArtAvatarUrl } from "../duel/botOpponent.js";
import { getArenaCosmetic, getArenaShopItem, ARENA_COSMETICS, ARENA_SHOP_ITEMS } from "./arenaCatalog.js";

const MAX_ARENA_LOG_ENTRIES = 7;
const BOT_NAMES = ["Бронзовий звір", "Пилова відьма", "Штормовий спис", "Кришталевий страж", "Чорний гладіатор"];
// Bots mostly fight each other; only a small share of target selections may focus the player.
const BOT_PLAYER_TARGET_CHANCE = 0.1;

interface ArenaPlayerRow {
  account_xp: number;
  arena_gold_day: string | Date;
  arena_gold_earned_today: number;
  arena_league_index: number;
  arena_rating: number;
  arena_tokens: string | number;
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
  battleLog: ArenaBattleLogEntry[];
  matchId: string;
  participants: ArenaBattleParticipantSnapshot[];
  pairStates: Record<string, ArenaPairInteractionSnapshot>;
  playerId: string;
  rerollCount: number;
  result: ArenaResult | null;
  resultsByPlayer?: Record<string, ArenaResult>;
  targetId: string | null;
}

interface CosmeticRow {
  cosmetic_id: string;
  cosmetic_type: ArenaCosmeticType;
  equipped: boolean;
}

function toSafeInteger(value: number | string, field: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${field}`);
  return parsed;
}

function selectRandomArenaEquipment(rarity: CardRarity) {
  const candidates = STARTER_EQUIPMENT_DEFINITIONS.filter((definition) => (
    definition.category === "things"
    && definition.rarity === rarity
    && definition.element !== null
    && (definition.slot === "head" || definition.slot === "cloak" || definition.slot === "gloves" || definition.slot === "boots")
  ));
  const definition = candidates[Math.floor(Math.random() * candidates.length)];
  if (!definition) throw new Error("Arena equipment catalog is empty for the requested rarity");
  return definition;
}

function getUtcDate() {
  return new Date().toISOString().slice(0, 10);
}

function toLeagueView(index: number): ArenaLeagueView {
  const league = DUEL_LEAGUE_CONFIG.leagues[index];
  if (!league) throw new Error("Arena league is outside the configured range");
  return {
    accentColor: league.accentColor,
    baseSilver: [100, 120, 150, 200, 250, 300, 400, 450, 500, 600, 650, 700, 800, 850, 900, 1_000, 1_200, 1_500, 2_000, 2_200, 2_500][index]!,
    division: league.division,
    iconKey: league.iconKey,
    index: league.index,
    key: league.key,
    maxRating: league.maxRating,
    minRating: league.minRating,
    name: league.name,
  };
}

function toPlayerSummary(row: ArenaPlayerRow): PlayerSummary {
  return {
    accountXp: toSafeInteger(row.account_xp, "account XP"),
    arenaLeagueIndex: toSafeInteger(row.arena_league_index, "arena league"),
    arenaRating: toSafeInteger(row.arena_rating, "arena rating"),
    arenaTokens: toSafeInteger(row.arena_tokens, "arena tokens"),
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

function createArenaState(players: QueuedArenaPlayer[], random: RandomSource = Math.random): ArenaState {
  const firstPlayer = players[0];
  if (!firstPlayer) throw new Error("Arena queue did not contain a player");
  const participants = [
    ...players.map(({ playerId, snapshot, guildCard }) => createParticipant(snapshot, playerId, false, random, guildCard)),
    ...Array.from({ length: ARENA_PARTICIPANT_COUNT - players.length }, (_, index) => createBot(players[index % players.length]!.snapshot, index, random)),
  ];
  const state: ArenaState = {
    battleLog: [],
    matchId: randomUUID(),
    participants,
    pairStates: {},
    playerId: firstPlayer.playerId,
    rerollCount: 0,
    result: null,
    resultsByPlayer: {},
    targetId: null,
  };
  setInitialTargets(state);
  for (const attacker of state.participants) {
    for (const target of state.participants) {
      if (attacker.id !== target.id) state.pairStates[pairKey(attacker.id, target.id)] = createPairState(attacker, target, random);
    }
  }
  return state;
}

function createBot(snapshot: DuelSideSnapshot, index: number, random: RandomSource = Math.random): ArenaBattleParticipantSnapshot {
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
    name: BOT_NAMES[index] ?? `Арена бот ${index + 1}`,
    photoUrl: getBotCardArtAvatarUrl(cards, random),
    level: Math.max(1, snapshot.level + (index % 3) - 1),
    modifiers: cloneModifiers(snapshot),
  }, id, true, random);
}

function aliveParticipants(state: ArenaState) {
  return state.participants.filter((participant) => participant.hp > 0);
}

function arenaIsOver(state: ArenaState) {
  return aliveParticipants(state).length <= 1;
}

function findParticipant(state: ArenaState, id: string) {
  return state.participants.find((participant) => participant.id === id);
}

function nextTarget(state: ArenaState, fromId: string) {
  const alive = aliveParticipants(state);
  const index = state.participants.findIndex((participant) => participant.id === fromId);
  for (let offset = 1; offset <= state.participants.length; offset += 1) {
    const candidate = state.participants[(index + offset + state.participants.length) % state.participants.length];
    if (candidate && candidate.id !== fromId && candidate.hp > 0) return candidate.id;
  }
  return alive.find((participant) => participant.id !== fromId)?.id ?? null;
}

function nextBotTarget(state: ArenaState, fromId: string) {
  const aliveBots = aliveParticipants(state).filter((participant) => participant.isBot && participant.id !== fromId);
  const player = findParticipant(state, state.playerId);
  if (aliveBots.length > 0 && Math.random() >= BOT_PLAYER_TARGET_CHANCE) {
    const targetCounts = new Map(aliveBots.map((candidate) => [candidate.id, 0]));
    state.participants.forEach((participant) => {
      if (participant.isBot && targetCounts.has(participant.targetId ?? "")) {
        const targetId = participant.targetId!;
        targetCounts.set(targetId, (targetCounts.get(targetId) ?? 0) + 1);
      }
    });
    const minimumTargetCount = Math.min(...aliveBots.map((candidate) => targetCounts.get(candidate.id) ?? 0));
    const leastTargetedBots = aliveBots.filter((candidate) => (targetCounts.get(candidate.id) ?? 0) === minimumTargetCount);
    return leastTargetedBots[Math.floor(Math.random() * leastTargetedBots.length)]?.id ?? aliveBots[0]!.id;
  }
  if (player && player.hp > 0 && player.id !== fromId) return player.id;
  return nextTarget(state, fromId);
}

function normalizeTarget(state: ArenaState, attacker: ArenaBattleParticipantSnapshot) {
  const target = attacker.targetId ? findParticipant(state, attacker.targetId) : undefined;
  if (!target || target.hp <= 0 || target.id === attacker.id) attacker.targetId = attacker.isBot ? nextBotTarget(state, attacker.id) : nextTarget(state, attacker.id);
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

      const target = normalizeTarget(state, attacker);
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

function attack(state: ArenaState, attacker: ArenaBattleParticipantSnapshot, slotIndex: 0 | 1 | 2, now: number) {
  const target = normalizeTarget(state, attacker);
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
  const targetEquipment = target.modifiers.equipment;
  const targetState = target.modifiers.equipmentState ?? { reviveUsed: false, voodooUsed: false };
  if (target.hp === 0 && targetEquipment && !targetState.reviveUsed && targetEquipment.reviveHpPct > 0) {
    target.hp = Math.max(1, Math.round(target.maxHp * targetEquipment.reviveHpPct / 100));
    targetState.reviveUsed = true;
    target.modifiers.equipmentState = targetState;
  } else if (target.hp === 0 && targetEquipment && !targetState.voodooUsed && targetEquipment.voodooHpReductionPct > 0) {
    attacker.hp = Math.max(0, attacker.hp - Math.round(attacker.maxHp * targetEquipment.voodooHpReductionPct / 100));
    targetState.voodooUsed = true;
    target.modifiers.equipmentState = targetState;
  }
  attacker.totalDamageDealt += result.damage;
  attacker.cooldownUntil[slotIndex] = new Date(now + ARENA_SLOT_COOLDOWN_MS).toISOString();
  const targetDefeated = target.hp === 0;
  if (targetDefeated) {
    attacker.kills += 1;
    for (const participant of state.participants) {
      if (participant.targetId === target.id) participant.targetId = participant.isBot ? nextBotTarget(state, participant.id) : nextTarget(state, participant.id);
    }
  }
  state.battleLog = [...state.battleLog, {
    attackerCard,
    attackerId: attacker.id,
    attackerName: attacker.name,
    attackerPhotoUrl: attacker.photoUrl,
    damage: result.damage,
    id: randomUUID(),
    multiplier: result.multiplier,
    slotIndex,
    targetCard,
    targetDefeated,
    targetId: target.id,
    targetName: target.name,
  }].slice(-MAX_ARENA_LOG_ENTRIES);
  return true;
}

function selectBotSlot(state: ArenaState, bot: ArenaBattleParticipantSnapshot, now: number) {
  const target = normalizeTarget(state, bot);
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
    .sort((left, right) => right.multiplier - left.multiplier || right.damage - left.damage);
  return candidates[0]?.slotIndex ?? null;
}

function advanceBots(state: ArenaState, now: number, random: RandomSource) {
  if (arenaIsOver(state)) return false;
  const pairStateCountBefore = state.pairStates ? Object.keys(state.pairStates).length : 0;
  ensurePairStates(state);
  const pairStateCountAfter = Object.keys(state.pairStates).length;
  let changed = pairStateCountAfter !== pairStateCountBefore || migrateLegacyPairCooldowns(state) || advanceCooldowns(state, now, random);
  for (const bot of state.participants.filter((participant) => participant.isBot && participant.hp > 0)) {
    const lastAction = bot.lastBotActionAt ? new Date(bot.lastBotActionAt).getTime() : 0;
    if (lastAction && now - lastAction < ARENA_BOT_ACTION_INTERVAL_MS) continue;
    const slotIndex = selectBotSlot(state, bot, now);
    bot.lastBotActionAt = new Date(now).toISOString();
    if (slotIndex === null) continue;
    changed = attack(state, bot, slotIndex, now) || changed;
    if (arenaIsOver(state)) break;
  }
  return changed;
}

function setInitialTargets(state: ArenaState) {
  state.participants.forEach((participant) => {
    participant.targetId = participant.isBot ? nextBotTarget(state, participant.id) : nextTarget(state, participant.id);
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
        arena_rating, arena_league_index, arena_wins, arena_top3_count, arena_tokens,
        arena_gold_earned_today, arena_gold_day
      FROM players WHERE id = $1 ${lock ? "FOR UPDATE" : ""}
    `,
    [playerId],
  );
  const player = result.rows[0];
  if (!player) throw new ArenaPlayerMissingError();
  return player;
}

async function finishMatch(client: PoolClient, row: ArenaRow, state: ArenaState, guildActivity?: GuildActivityRecorder) {
  const ordered = resultPlacement(state);
  state.resultsByPlayer = {};
  for (const participant of ordered.filter(({ isBot }) => !isBot)) {
    if (!participant.placement) throw new Error("Arena player placement is missing");
    const player = await loadPlayer(client, participant.id, true);
    const placement = participant.placement;
    const ratingBefore = toSafeInteger(player.arena_rating, "arena rating");
    const leagueBeforeIndex = getLeagueIndexByRating(ratingBefore);
    const storedDailyGold = toSafeInteger(player.arena_gold_earned_today, "arena daily gold");
    const dailyGold = String(player.arena_gold_day).slice(0, 10) === getUtcDate() ? storedDailyGold : 0;
    const currencyBoost = await getCurrencyBoostStatus(client, participant.id);
    const reward = getArenaReward(placement, leagueBeforeIndex, dailyGold, currencyBoost.multiplier);
    const collectionModifiers = getPlayerCollectionModifiers(await getCompletedCollectionModifiers(client, participant.id));
    const silverReward = Math.round(reward.silver * (1 + collectionModifiers.silverRewardPct / 100));
    if (!Number.isSafeInteger(silverReward) || silverReward < 0) throw new Error("Arena silver reward exceeds safe integer limits");
    const ratingAfter = Math.max(0, ratingBefore + reward.ratingChange);
    const leagueAfterIndex = getLeagueIndexByRating(ratingAfter);
    const goldEarnedToday = String(player.arena_gold_day).slice(0, 10) === getUtcDate()
      ? dailyGold + reward.gold
      : reward.gold;
    const updated = await client.query<ArenaPlayerRow>(
      `
        UPDATE players SET
          silver = silver + $2,
          gold = gold + $3,
          arena_tokens = arena_tokens + $4,
          arena_rating = $5,
          arena_league_index = $6,
          arena_wins = arena_wins + $7,
          arena_top3_count = arena_top3_count + $8,
          arena_gold_earned_today = $9,
          arena_gold_day = CURRENT_DATE,
          updated_at = NOW()
        WHERE id = $1
        RETURNING id, first_name, username, photo_url, level, silver, gold, account_xp,
          card_shards, duel_wins, duel_rating, duel_highest_league_index,
          arena_rating, arena_league_index, arena_wins, arena_top3_count, arena_tokens,
          arena_gold_earned_today
      `,
      [participant.id, silverReward, reward.gold, reward.arenaTokens, ratingAfter, leagueAfterIndex, placement <= 3 ? 1 : 0, placement <= 3 ? 1 : 0, goldEarnedToday],
    );
    const updatedPlayer = updated.rows[0];
    if (!updatedPlayer) throw new Error("Arena reward update returned no player");
    state.resultsByPlayer[participant.id] = {
      leagueAfter: toLeagueView(leagueAfterIndex),
      leagueBefore: toLeagueView(leagueBeforeIndex),
      player: toPlayerSummary(updatedPlayer),
      reward: {
        arenaTokens: reward.arenaTokens,
        gold: reward.gold,
        goldCapped: reward.goldCapped,
        placement,
        ratingAfter,
        ratingBefore,
        ratingChange: reward.ratingChange,
        silver: silverReward,
        status: placement <= 3 ? "win" : "loss",
      },
    };
    const activityType = placement === 1
      ? "arena_place_1"
      : placement === 2
        ? "arena_place_2"
        : placement === 3
          ? "arena_place_3"
          : "arena_place_4_6";
    await guildActivity?.recordActivity(client, participant.id, activityType, `arena:${row.id}:${participant.id}`);
  }
  state.result = state.resultsByPlayer[row.player_id] ?? null;
  state.targetId = null;
  await client.query(
    `UPDATE arena_matches SET status = 'finished', state = $2, result = $3, version = version + 1, updated_at = NOW(), finished_at = NOW() WHERE id = $1`,
    [row.id, JSON.stringify(state), state.result ? JSON.stringify(state.result) : null],
  );
  return state.result;
}

function toView(row: ArenaRow, playerId: string, playerGold: number, arenaTokens: number): ArenaView {
  const player = findParticipant(row.state, playerId);
  if (!player) throw new Error("Arena player participant is missing");
  const target = player.targetId && player.targetId !== player.id ? findParticipant(row.state, player.targetId) : null;
  const pair = target ? getPairState(row.state, player, target) : null;
  const now = Date.now();
  const toSlot = (card: DuelCardSnapshot, cooldownUntil: string | null): ArenaCardSlot => ({
    card: readyAt(cooldownUntil, now) ? card : null,
    cooldownUntil,
  });
  return {
    arenaTokens,
    battleLog: [...row.state.battleLog].reverse(),
    changeCardsCost: getArenaCardChangeCost(row.state.rerollCount + 1),
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
      name: participant.name,
      photoUrl: participant.photoUrl,
      ...(participant.placement ? { placement: participant.placement } : {}),
      totalDamageDealt: participant.totalDamageDealt,
    })),
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
  const result = await client.query<{ arena_tokens: string | number; gold: string | number }>(
    "SELECT gold, arena_tokens FROM players WHERE id = $1",
    [playerId],
  );
  const row = result.rows[0];
  if (!row) throw new ArenaPlayerMissingError();
  return { arenaTokens: toSafeInteger(row.arena_tokens, "arena tokens"), playerGold: toSafeInteger(row.gold, "gold") };
}

function rowToArena(row: { id: string; player_id: string; state: ArenaState; result: ArenaResult | null; status: "active" | "finished"; version: number }): ArenaRow {
  return row;
}

function toQueueView(row: { created_at: string | Date; id: string }, participantCount: number): ArenaQueueView {
  const createdAt = new Date(row.created_at).getTime();
  return {
    createdAt: new Date(createdAt).toISOString(),
    maxParticipants: ARENA_PARTICIPANT_COUNT,
    participantCount,
    queueId: row.id,
    startsAt: new Date(createdAt + ARENA_QUEUE_DURATION_MS).toISOString(),
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
export class ArenaDeckInvalidError extends DuelDeckInvalidError {
  constructor() { super(); this.name = "ArenaDeckInvalidError"; }
}
export class ArenaPlayerMissingError extends Error {
  constructor() { super("Arena player does not exist"); this.name = "ArenaPlayerMissingError"; }
}
export class ArenaInsufficientGoldError extends Error {
  constructor() { super("Not enough Gold for this card change"); this.name = "ArenaInsufficientGoldError"; }
}
export class ArenaShopOfferMissingError extends Error {
  constructor() { super("Arena Shop offer does not exist"); this.name = "ArenaShopOfferMissingError"; }
}
export class ArenaInsufficientTokensError extends Error {
  constructor() { super("Not enough Arena Tokens"); this.name = "ArenaInsufficientTokensError"; }
}
export class ArenaCosmeticUnavailableError extends Error {
  constructor() { super("This Arena cosmetic is already owned or unavailable"); this.name = "ArenaCosmeticUnavailableError"; }
}

export class ArenaService {
  constructor(
    private readonly pool: Pool,
    private readonly guildActivity?: GuildActivityRecorder,
    private readonly random: RandomSource = Math.random,
  ) {}

  async getProfile(playerId: string): Promise<ArenaProfileResponse> {
    const player = await loadPlayer(this.pool, playerId);
    const cosmetics = await this.pool.query<CosmeticRow>(
      "SELECT cosmetic_id, cosmetic_type, equipped FROM player_arena_cosmetics WHERE player_id = $1 ORDER BY acquired_at",
      [playerId],
    );
    const owned = new Map(cosmetics.rows.map((item) => [item.cosmetic_id, item]));
    const cosmeticViews: ArenaCosmetic[] = ARENA_COSMETICS.map((cosmetic) => ({
      ...cosmetic,
      owned: owned.has(cosmetic.id),
    }));
    const equippedCosmetics: Partial<Record<ArenaCosmeticType, string>> = {};
    for (const cosmetic of cosmetics.rows) if (cosmetic.equipped) equippedCosmetics[cosmetic.cosmetic_type] = cosmetic.cosmetic_id;
    return {
      arenaLeague: toLeagueView(getLeagueIndexByRating(toSafeInteger(player.arena_rating, "arena rating"))),
      arenaRating: toSafeInteger(player.arena_rating, "arena rating"),
      arenaTokens: toSafeInteger(player.arena_tokens, "arena tokens"),
      arenaTop3Count: toSafeInteger(player.arena_top3_count, "arena top 3 count"),
      arenaWins: toSafeInteger(player.arena_wins, "arena wins"),
      cardShards: toSafeInteger(player.card_shards, "card shards"),
      cosmetics: cosmeticViews,
      equippedCosmetics,
    };
  }

  private async startReadyQueue(client: PoolClient, now: number) {
    const firstReady = await client.query<{ id: string }>(
      `SELECT id FROM arena_queue WHERE created_at <= $1 ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED`,
      [new Date(now - ARENA_QUEUE_DURATION_MS).toISOString()],
    );
    if (!firstReady.rows[0]) return null;

    const queued = await client.query<{ created_at: string | Date; id: string; player_id: string }>(
      `SELECT id, player_id, created_at FROM arena_queue ORDER BY created_at ASC LIMIT $1 FOR UPDATE SKIP LOCKED`,
      [ARENA_PARTICIPANT_COUNT],
    );
    const players: QueuedArenaPlayer[] = [];
    for (const entry of queued.rows) {
      try {
        const loaded = await loadDuelParticipant(client, entry.player_id);
        players.push({
          createdAt: entry.created_at,
          guildCard: toGuildDuelCard(loaded.guildCard),
          id: entry.id,
          playerId: entry.player_id,
          snapshot: loaded.snapshot,
        });
      } catch {
        // A deck can become invalid while a player is waiting. It must not hold
        // the rest of the registration window hostage.
        await client.query("DELETE FROM arena_queue WHERE id = $1", [entry.id]);
      }
    }
    if (!players.length) return null;

    const state = createArenaState(players, this.random);
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

  private async queueView(client: Pick<PoolClient, "query">, playerId: string) {
    const own = await client.query<{ created_at: string | Date; id: string; participant_count: number | string }>(
      `SELECT id, created_at, (SELECT COUNT(*)::integer FROM arena_queue) AS participant_count FROM arena_queue WHERE player_id = $1`,
      [playerId],
    );
    const ownRow = own.rows[0];
    return ownRow ? toQueueView(ownRow, toSafeInteger(ownRow.participant_count, "arena queue size")) : null;
  }

  async joinQueue(playerId: string): Promise<ArenaQueueResponse> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      if (await loadActiveArenaRow(client, playerId)) throw new ArenaAlreadyActiveError();
      await loadDuelParticipant(client, playerId).catch(() => { throw new ArenaDeckInvalidError(); });
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
        return { match: toView(started, playerId, balance.playerGold, balance.arenaTokens), queue: null, queueId: registeredQueueId };
      }
      return { match: null, queue, queueId: registeredQueueId };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  async leaveQueue(playerId: string) {
    await this.pool.query("DELETE FROM arena_queue WHERE player_id = $1", [playerId]);
    return { left: true };
  }

  async findActive(playerId: string): Promise<ActiveArenaResponse> {
    const active = await loadActiveArenaRow(this.pool, playerId);
    if (active) return { arena: await this.advanceAndView(playerId, active), queue: null };

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.startReadyQueue(client, Date.now());
      const started = await loadActiveArenaRow(client, playerId);
      if (started) {
        const balance = await loadBalance(client, playerId);
        await client.query("COMMIT");
        return { arena: toView(started, playerId, balance.playerGold, balance.arenaTokens), queue: null };
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
        arena: finished.rows[0] ? toView(finished.rows[0], playerId, balance.playerGold, balance.arenaTokens) : null,
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
      const changed = row.status === "active" ? advanceBots(row.state, Date.now(), this.random) : false;
      if (row.status === "active" && arenaIsOver(row.state)) {
        await finishMatch(client, row, row.state, this.guildActivity);
        row.status = "finished";
        row.version += 1;
      } else if (changed) {
        await client.query("UPDATE arena_matches SET state = $2, version = version + 1, updated_at = NOW() WHERE id = $1", [row.id, JSON.stringify(row.state)]);
        row.version += 1;
      }
      const balance = await loadBalance(client, playerId);
      await client.query("COMMIT");
      return toView(row, playerId, balance.playerGold, balance.arenaTokens);
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
    finally { client.release(); }
  }

  async action(playerId: string, matchId: string, input: ArenaActionRequest): Promise<ArenaView> {
    return this.mutate(playerId, matchId, input.expectedVersion, (state, now) => {
      const player = findParticipant(state, playerId);
      if (!player || player.hp <= 0) return false;
      const target = normalizeTarget(state, player);
      if (!target) return false;
      return attack(state, player, input.slotIndex, now);
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
    }, "target");
  }

  async changeCards(playerId: string, matchId: string, input: ArenaVersionRequest): Promise<ArenaView> {
    return this.mutate(playerId, matchId, input.expectedVersion, async (state, now, client) => {
      const player = findParticipant(state, playerId);
      if (!player || player.hp <= 0) return false;
      const target = normalizeTarget(state, player);
      if (!target) return false;
      const pair = getPairState(state, player, target);
      const cost = getArenaCardChangeCost(state.rerollCount + 1);
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
      state.rerollCount += 1;
      return true;
    });
  }

  private async mutate(
    playerId: string,
    matchId: string,
    expectedVersion: number,
    callback: (state: ArenaState, now: number, client: PoolClient) => boolean | Promise<boolean>,
    mutationKind?: "target",
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
      if (row.status !== "active" || row.version !== expectedVersion) throw new ArenaStateConflictError();
      const player = findParticipant(row.state, playerId);
      const playerCardsBeforeAdvance = mutationKind === "target" && player ? {
        attackerActiveSlots: copyActiveCards(player.activeSlots),
        attackerReserveQueue: [...player.reserveQueue],
        attackerRotationSeenCardIds: [...player.rotationSeenCardIds],
      } : null;
      advanceBots(row.state, Date.now(), this.random);
      if (player && playerCardsBeforeAdvance) syncParticipantAttackerState(player, playerCardsBeforeAdvance);
      const changed = await callback(row.state, Date.now(), client);
      if (arenaIsOver(row.state)) {
        await finishMatch(client, row, row.state, this.guildActivity);
        row.status = "finished";
        row.version += 1;
      } else {
        await client.query("UPDATE arena_matches SET state = $2, version = version + 1, updated_at = NOW() WHERE id = $1", [row.id, JSON.stringify(row.state)]);
        row.version += 1;
      }
      if (!changed && row.status === "active") row.version -= 0;
      const balance = await loadBalance(client, playerId);
      await client.query("COMMIT");
      return toView(row, playerId, balance.playerGold, balance.arenaTokens);
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
    finally { client.release(); }
  }

  async getShopCatalog(): Promise<ArenaShopCatalogResponse> {
    return { items: ARENA_SHOP_ITEMS.map((item) => ({ ...item })) };
  }

  async purchase(playerId: string, offerId: string): Promise<ArenaShopPurchaseResponse> {
    const offer = getArenaShopItem(offerId);
    if (!offer) throw new ArenaShopOfferMissingError();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const player = await loadPlayer(client, playerId, true);
      const currentTokens = toSafeInteger(player.arena_tokens, "arena tokens");
      if (currentTokens < offer.price) throw new ArenaInsufficientTokensError();
      let cosmeticId: string | null = null;
      let equipmentName: string | null = null;
      let collectionCompleted: CollectionCompletionNotice | undefined;
      if (offer.rewardType === "cosmetic") {
        const owned = await client.query<{ cosmetic_id: string }>("SELECT cosmetic_id FROM player_arena_cosmetics WHERE player_id = $1", [playerId]);
        const ownedIds = new Set(owned.rows.map(({ cosmetic_id }) => cosmetic_id));
        const available = ARENA_COSMETICS.find((cosmetic) => cosmetic.type === offer.cosmeticType && !ownedIds.has(cosmetic.id));
        if (!available) throw new ArenaCosmeticUnavailableError();
        cosmeticId = available.id;
        await client.query("INSERT INTO player_arena_cosmetics (player_id, cosmetic_id, cosmetic_type) VALUES ($1, $2, $3)", [playerId, cosmeticId, available.type]);
      } else if (offer.rewardType === "card") {
        const card = await client.query<{ id: string; code: string; display_name: string | null; art_key: string | null; element: "fire" | "water" | "air" | "earth"; collection_id: string | null; description: string }>(
          "SELECT id, code, display_name, art_key, element, collection_id, description FROM cards WHERE limited = FALSE AND source = 'standard' AND id IN (SELECT card_id FROM shop_card_pools) ORDER BY random() LIMIT 1",
        );
        const definition = card.rows[0];
        if (!definition) throw new ArenaShopOfferMissingError();
        await createStandardCardInstance(client, playerId, {
          artKey: definition.art_key,
          collectionId: definition.collection_id,
          displayName: definition.display_name,
          description: definition.description,
          element: definition.element,
          id: definition.id,
          code: definition.code,
          minRarity: "common",
          shopEligible: false,
        }, 1, new CryptoCardRandomSource());
        const discovery = await recordCardDiscovery(client, playerId, definition.id);
        collectionCompleted = discovery.collectionCompleted;
        await recalculateAutomaticDeck(client, playerId);
      } else if (offer.rewardType === "equipment") {
        if (!offer.equipmentRarity) throw new ArenaShopOfferMissingError();
        const definition = selectRandomArenaEquipment(offer.equipmentRarity);
        await client.query(
          `INSERT INTO player_equipment_inventory (player_id, item_id, quantity)
           VALUES ($1, $2, 1)
           ON CONFLICT (player_id, item_id)
           DO UPDATE SET quantity = player_equipment_inventory.quantity + 1, updated_at = NOW()`,
          [playerId, definition.id],
        );
        equipmentName = definition.name;
      }
      const updated = await client.query<ArenaPlayerRow>(
        `UPDATE players SET arena_tokens = arena_tokens - $2, card_shards = card_shards + $3, updated_at = NOW()
         WHERE id = $1 AND arena_tokens >= $2
         RETURNING id, first_name, username, photo_url, level, silver, gold, account_xp, card_shards,
           duel_wins, duel_rating, duel_highest_league_index, arena_rating, arena_league_index,
           arena_wins, arena_top3_count, arena_tokens, arena_gold_earned_today`,
        [playerId, offer.price, offer.rewardType === "shards" ? offer.quantity ?? 0 : 0],
      );
      const updatedPlayer = updated.rows[0];
      if (!updatedPlayer) throw new ArenaInsufficientTokensError();
      await client.query("INSERT INTO arena_shop_purchases (id, player_id, offer_id, price) VALUES ($1, $2, $3, $4)", [randomUUID(), playerId, offer.id, offer.price]);
      await client.query("COMMIT");
      return {
        arenaTokens: toSafeInteger(updatedPlayer.arena_tokens, "arena tokens"),
        cardShards: toSafeInteger(updatedPlayer.card_shards, "card shards"),
        ...(collectionCompleted ? { collectionCompleted } : {}),
        message: cosmeticId
          ? `Отримано: ${getArenaCosmetic(cosmeticId)?.displayName ?? offer.displayName}`
          : equipmentName ? `Отримано: ${equipmentName}` : `Придбано: ${offer.displayName}`,
        playerGold: toSafeInteger(updatedPlayer.gold, "gold"),
        silver: toSafeInteger(updatedPlayer.silver, "silver"),
      };
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
    finally { client.release(); }
  }
}
