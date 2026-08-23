import type {
  CardElement,
  DuelBattleModifiers,
  DuelCardSnapshot,
  DuelExchange,
  DuelLogVisualState,
  DuelOutcome,
  DuelStatus,
  ElementMultiplier,
} from "@cardastika/shared";

export const NORMAL_MATCHMAKING_RANGE_PCT = 10;
export const STREAK_MATCHMAKING_RANGE_PCT = 15;
export const WIDENED_MATCHMAKING_STREAK = 5;
export const DUEL_ACTIVE_CARD_COUNT = 3;
export const DUEL_POOL_SIZE = 9;

export type RandomSource = () => number;
export type ActiveCards<T> = [T, T, T];

export interface CyclicCardPool<T> {
  activeCards: ActiveCards<T>;
  reserveQueue: T[];
}

export interface MatchmakingRange {
  maximum: number;
  minimum: number;
  percentage: 10 | 15;
}

export interface DuelReward {
  baseSilver: number;
  baseXp: number;
  silver: number;
  xp: number;
}

export interface AccountXpResult {
  goldReward: number;
  newLevel: number;
  reachedLevels: number[];
  remainingXp: number;
}

export interface DuelStats {
  duelLosses: number;
  duelWinStreak: number;
  duelWins: number;
}

export interface ResolvedDuelExchange {
  enemyHp: number;
  enemyPool: CyclicCardPool<DuelCardSnapshot>;
  exchange: DuelExchange;
  playerHp: number;
  playerPool: CyclicCardPool<DuelCardSnapshot>;
  status: DuelStatus;
}

const ELEMENT_MULTIPLIERS: Readonly<Record<CardElement, Readonly<Record<CardElement, ElementMultiplier>>>> = {
  fire: { fire: 1, water: 0.5, air: 1.5, earth: 1 },
  water: { fire: 1.5, water: 1, air: 1, earth: 0.5 },
  air: { fire: 0.5, water: 1, air: 1, earth: 1.5 },
  earth: { fire: 1, water: 1.5, air: 0.5, earth: 1 },
};

function assertNonNegativeInteger(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${field} must be a non-negative safe integer`);
  }
}

function assertPositiveInteger(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${field} must be a positive safe integer`);
  }
}

function assertPercentage(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${field} must be a non-negative number`);
  }
}

export function getElementMultiplier(
  attackerElement: CardElement,
  defenderElement: CardElement,
): ElementMultiplier {
  return ELEMENT_MULTIPLIERS[attackerElement][defenderElement];
}

export function getEffectiveDeckPower(baseDeckPower: number, deckPowerPct: number) {
  assertPositiveInteger(baseDeckPower, "Base deck power");
  assertPercentage(deckPowerPct, "Deck power percentage");
  return Math.round(baseDeckPower * (1 + deckPowerPct / 100));
}

export function getStartingHp(effectiveDeckPower: number, battleHpPct: number) {
  assertPositiveInteger(effectiveDeckPower, "Effective deck power");
  assertPercentage(battleHpPct, "Battle HP percentage");
  return Math.round(effectiveDeckPower * (1 + battleHpPct / 100));
}

export function getMatchmakingRange(deckPower: number, winStreak: number): MatchmakingRange {
  assertPositiveInteger(deckPower, "Deck power");
  assertNonNegativeInteger(winStreak, "Win streak");
  const percentage = winStreak >= WIDENED_MATCHMAKING_STREAK
    ? STREAK_MATCHMAKING_RANGE_PCT
    : NORMAL_MATCHMAKING_RANGE_PCT;
  return {
    minimum: Math.round(deckPower * (1 - percentage / 100)),
    maximum: Math.round(deckPower * (1 + percentage / 100)),
    percentage,
  };
}

export function isDeckPowerInMatchmakingRange(
  candidateDeckPower: number,
  range: MatchmakingRange,
) {
  assertPositiveInteger(candidateDeckPower, "Candidate deck power");
  return candidateDeckPower >= range.minimum && candidateDeckPower <= range.maximum;
}

export function shuffleCards<T>(cards: readonly T[], random: RandomSource): T[] {
  const result = [...cards];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomValue = random();
    if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
      throw new RangeError("Random source must return a value from 0 inclusive to 1 exclusive");
    }
    const replacementIndex = Math.floor(randomValue * (index + 1));
    [result[index], result[replacementIndex]] = [result[replacementIndex]!, result[index]!];
  }
  return result;
}

export function initializeCyclicCardPool<T>(
  cards: readonly T[],
  random: RandomSource,
): CyclicCardPool<T> {
  if (cards.length !== DUEL_POOL_SIZE) {
    throw new RangeError(`Duel card pool must contain exactly ${DUEL_POOL_SIZE} cards`);
  }
  const shuffled = shuffleCards(cards, random);
  return {
    activeCards: [shuffled[0]!, shuffled[1]!, shuffled[2]!],
    reserveQueue: shuffled.slice(DUEL_ACTIVE_CARD_COUNT),
  };
}

export function cycleCardPoolSlot<T>(
  pool: CyclicCardPool<T>,
  slotIndex: 0 | 1 | 2,
): CyclicCardPool<T> {
  const replacement = pool.reserveQueue[0];
  if (replacement === undefined) throw new RangeError("Duel reserve queue cannot be empty");
  const usedCard = pool.activeCards[slotIndex];
  const activeCards: ActiveCards<T> = [...pool.activeCards] as ActiveCards<T>;
  activeCards[slotIndex] = replacement;
  return {
    activeCards,
    reserveQueue: [...pool.reserveQueue.slice(1), usedCard],
  };
}

export function calculateDuelDamage(input: {
  attackerElementDamagePct: number;
  attackerFinalPower: number;
  battleDamagePct: number;
  defenderElement: CardElement;
  attackerElement: CardElement;
}) {
  assertPositiveInteger(input.attackerFinalPower, "Card final power");
  assertPercentage(input.battleDamagePct, "Battle damage percentage");
  assertPercentage(input.attackerElementDamagePct, "Element damage percentage");
  const multiplier = getElementMultiplier(input.attackerElement, input.defenderElement);
  const damageModifierPct = input.battleDamagePct + input.attackerElementDamagePct;
  return {
    damage: Math.round(input.attackerFinalPower * multiplier * (1 + damageModifierPct / 100)),
    multiplier,
  };
}

export function resolveDuelExchange(input: {
  enemyHp: number;
  enemyModifiers: DuelBattleModifiers;
  enemyPool: CyclicCardPool<DuelCardSnapshot>;
  playerHp: number;
  playerModifiers: DuelBattleModifiers;
  playerPool: CyclicCardPool<DuelCardSnapshot>;
  slotIndex: 0 | 1 | 2;
  turnNumber: number;
}): ResolvedDuelExchange {
  assertNonNegativeInteger(input.playerHp, "Player HP");
  assertNonNegativeInteger(input.enemyHp, "Enemy HP");
  assertNonNegativeInteger(input.turnNumber, "Turn number");
  const playerCard = input.playerPool.activeCards[input.slotIndex];
  const enemyCard = input.enemyPool.activeCards[input.slotIndex];
  const playerAttack = calculateDuelDamage({
    attackerFinalPower: playerCard.finalPower,
    attackerElement: playerCard.element,
    defenderElement: enemyCard.element,
    battleDamagePct: input.playerModifiers.battleDamagePct,
    attackerElementDamagePct: input.playerModifiers.elementDamagePct[playerCard.element],
  });
  const enemyAttack = calculateDuelDamage({
    attackerFinalPower: enemyCard.finalPower,
    attackerElement: enemyCard.element,
    defenderElement: playerCard.element,
    battleDamagePct: input.enemyModifiers.battleDamagePct,
    attackerElementDamagePct: input.enemyModifiers.elementDamagePct[enemyCard.element],
  });

  const playerHp = Math.max(0, input.playerHp - enemyAttack.damage);
  const enemyHp = Math.max(0, input.enemyHp - playerAttack.damage);
  const status: DuelStatus = enemyHp === 0 ? "won" : playerHp === 0 ? "lost" : "active";
  return {
    playerHp,
    enemyHp,
    playerPool: cycleCardPoolSlot(input.playerPool, input.slotIndex),
    enemyPool: cycleCardPoolSlot(input.enemyPool, input.slotIndex),
    status,
    exchange: {
      slotIndex: input.slotIndex,
      turnNumber: input.turnNumber + 1,
      playerCard,
      enemyCard,
      playerMultiplier: playerAttack.multiplier,
      enemyMultiplier: enemyAttack.multiplier,
      playerDamage: playerAttack.damage,
      enemyDamage: enemyAttack.damage,
      visualState: getDuelLogVisualState(playerAttack.multiplier, enemyAttack.multiplier),
    },
  };
}

export function getDuelLogVisualState(
  playerMultiplier: ElementMultiplier,
  enemyMultiplier: ElementMultiplier,
): DuelLogVisualState {
  if (playerMultiplier === 1.5 && enemyMultiplier === 0.5) return "player_strong";
  if (playerMultiplier === 0.5 && enemyMultiplier === 1.5) return "enemy_strong";
  return "neutral";
}

export function getDuelBaseXp(level: number, outcome: DuelOutcome) {
  assertPositiveInteger(level, "Account level");
  return outcome === "win" ? 20 + level * 5 : 10 + level * 3;
}

export function getDuelBaseSilver(level: number, outcome: DuelOutcome) {
  assertPositiveInteger(level, "Account level");
  return outcome === "win" ? 40 + level * 10 : 20 + level * 5;
}

export function calculateDuelReward(
  level: number,
  outcome: DuelOutcome,
  modifiers: Pick<DuelBattleModifiers, "experienceRewardPct" | "silverRewardPct">,
): DuelReward {
  assertPercentage(modifiers.experienceRewardPct, "Experience reward percentage");
  assertPercentage(modifiers.silverRewardPct, "Silver reward percentage");
  const baseXp = getDuelBaseXp(level, outcome);
  const baseSilver = getDuelBaseSilver(level, outcome);
  return {
    baseXp,
    baseSilver,
    xp: Math.round(baseXp * (1 + modifiers.experienceRewardPct / 100)),
    silver: Math.round(baseSilver * (1 + modifiers.silverRewardPct / 100)),
  };
}

export function getRequiredAccountXp(level: number) {
  assertPositiveInteger(level, "Account level");
  return level * 100;
}

export function applyAccountXp(input: {
  gainedXp: number;
  level: number;
  xp: number;
}): AccountXpResult {
  assertPositiveInteger(input.level, "Account level");
  assertNonNegativeInteger(input.xp, "Account XP");
  assertNonNegativeInteger(input.gainedXp, "Gained account XP");
  let newLevel = input.level;
  let remainingXp = input.xp + input.gainedXp;
  const reachedLevels: number[] = [];
  while (remainingXp >= getRequiredAccountXp(newLevel)) {
    remainingXp -= getRequiredAccountXp(newLevel);
    newLevel += 1;
    reachedLevels.push(newLevel);
  }
  return {
    newLevel,
    remainingXp,
    reachedLevels,
    goldReward: reachedLevels.reduce((total, level) => total + level, 0),
  };
}

export function applyDuelOutcomeToStats(stats: DuelStats, outcome: DuelOutcome): DuelStats {
  assertNonNegativeInteger(stats.duelWins, "Duel wins");
  assertNonNegativeInteger(stats.duelLosses, "Duel losses");
  assertNonNegativeInteger(stats.duelWinStreak, "Duel win streak");
  return outcome === "win"
    ? {
        duelWins: stats.duelWins + 1,
        duelLosses: stats.duelLosses,
        duelWinStreak: stats.duelWinStreak + 1,
      }
    : {
        duelWins: stats.duelWins,
        duelLosses: stats.duelLosses + 1,
        duelWinStreak: 0,
      };
}
