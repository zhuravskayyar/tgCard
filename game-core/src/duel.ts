import type {
  CardElement,
  DuelBattleModifiers,
  DuelCardSnapshot,
  DuelExchange,
  DuelLogVisualState,
  DuelOutcome,
  DuelStatus,
  ElementMultiplier,
  EquipmentBattleState,
} from "@cardastika/shared";

export const NORMAL_MATCHMAKING_RANGE_PCT = 10;
export const STREAK_MATCHMAKING_RANGE_PCT = 15;
export const WIDENED_MATCHMAKING_STREAK = 5;
export const DUEL_ACTIVE_CARD_COUNT = 3;
export const DUEL_POOL_SIZE = 9;
export const MAX_ACCOUNT_LEVEL = 120;
export const DUEL_GOLD_REWARD_MIN = 1;
export const DUEL_GOLD_REWARD_MAX = 2;

// XP required to reach each target account level. Index zero is unused;
// index one is the level-1 baseline.
export const ACCOUNT_XP_REQUIRED_BY_LEVEL: readonly number[] = Object.freeze([
  0,
  0,
  240,
  500,
  1_000,
  2_000,
  13_000,
  31_000,
  49_500,
  72_500,
  99_000,
  140_000,
  175_000,
  220_000,
  270_000,
  330_000,
  400_000,
  475_000,
  545_000,
  620_000,
  700_000,
  780_000,
  870_000,
  970_000,
  1_070_000,
  1_170_000,
  1_280_000,
  1_420_000,
  1_550_000,
  1_700_000,
  1_850_000,
  2_010_000,
  2_170_000,
  2_330_000,
  2_500_000,
  2_680_000,
  2_880_000,
  3_060_000,
  3_240_000,
  3_440_000,
  3_620_000,
  3_820_000,
  4_020_000,
  4_240_000,
  4_440_000,
  4_680_000,
  4_920_000,
  5_180_000,
  5_420_000,
  5_680_000,
  5_960_000,
  11_630_000,
  12_910_000,
  14_310_000,
  15_760_000,
  17_260_000,
  18_810_000,
  20_410_000,
  22_050_000,
  23_750_000,
  25_500_000,
  45_000_000,
  48_900_000,
  53_000_000,
  57_200_000,
  61_500_000,
  66_000_000,
  70_500_000,
  75_000_000,
  80_000_000,
  85_000_000,
  100_000_000,
  120_000_000,
  140_000_000,
  160_000_000,
  180_000_000,
  200_000_000,
  220_000_000,
  240_000_000,
  260_000_000,
  280_000_000,
  1_000_000_000,
  1_000_000_000,
  1_000_000_000,
  1_000_000_000,
  1_000_000_000,
  1_000_000_000,
  1_000_000_000,
  1_000_000_000,
  1_000_000_000,
  1_000_000_000,
  2_000_000_000,
  2_000_000_000,
  2_000_000_000,
  2_000_000_000,
  2_000_000_000,
  2_000_000_000,
  2_000_000_000,
  2_000_000_000,
  2_000_000_000,
  2_000_000_000,
  3_000_000_000,
  3_000_000_000,
  3_000_000_000,
  3_000_000_000,
  3_000_000_000,
  3_000_000_000,
  3_000_000_000,
  3_000_000_000,
  3_000_000_000,
  3_000_000_000,
  4_000_000_000,
  4_000_000_000,
  4_000_000_000,
  4_000_000_000,
  4_000_000_000,
  4_000_000_000,
  4_000_000_000,
  4_000_000_000,
  4_000_000_000,
  4_000_000_000,
]);

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
  accountBoostMultiplier: 1 | 2;
  baseSilver: number;
  baseXp: number;
  silver: number;
  xp: number;
}

export interface ModifiedBattleReward {
  accountBoostMultiplier: 1 | 2;
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
  enemyEquipmentState: EquipmentBattleState;
  enemyHp: number;
  enemyPool: CyclicCardPool<DuelCardSnapshot>;
  exchange: DuelExchange;
  playerHp: number;
  playerPool: CyclicCardPool<DuelCardSnapshot>;
  playerEquipmentState: EquipmentBattleState;
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
  attackerEquipment?: DuelBattleModifiers["equipment"];
}) {
  assertPositiveInteger(input.attackerFinalPower, "Card final power");
  assertPercentage(input.battleDamagePct, "Battle damage percentage");
  assertPercentage(input.attackerElementDamagePct, "Element damage percentage");
  const multiplier = getElementMultiplier(input.attackerElement, input.defenderElement);
  const damageModifierPct = input.battleDamagePct
    + input.attackerElementDamagePct
    + (input.attackerEquipment?.outgoingDamagePct ?? 0);
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
  enemyMaxHp?: number;
  playerMaxHp?: number;
  equipmentEnabled?: boolean;
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
    attackerEquipment: input.equipmentEnabled ? input.playerModifiers.equipment : undefined,
  });
  const enemyAttack = calculateDuelDamage({
    attackerFinalPower: enemyCard.finalPower,
    attackerElement: enemyCard.element,
    defenderElement: playerCard.element,
    battleDamagePct: input.enemyModifiers.battleDamagePct,
    attackerElementDamagePct: input.enemyModifiers.elementDamagePct[enemyCard.element],
    attackerEquipment: input.equipmentEnabled ? input.enemyModifiers.equipment : undefined,
  });

  const playerEquipment = input.equipmentEnabled ? input.playerModifiers.equipment : undefined;
  const enemyEquipment = input.equipmentEnabled ? input.enemyModifiers.equipment : undefined;
  const playerDamage = Math.round(playerAttack.damage * Math.max(0, 1 - (enemyEquipment?.incomingDamageReductionPct ?? 0) / 100))
    + Math.round(enemyCard.finalPower * (enemyEquipment?.damageReflectionPct ?? 0) / 100);
  const enemyDamage = Math.round(enemyAttack.damage * Math.max(0, 1 - (playerEquipment?.incomingDamageReductionPct ?? 0) / 100))
    + Math.round(playerCard.finalPower * (playerEquipment?.damageReflectionPct ?? 0) / 100);
  let playerHp = Math.max(0, input.playerHp - enemyDamage);
  let enemyHp = Math.max(0, input.enemyHp - playerDamage);
  const playerEquipmentState: EquipmentBattleState = { reviveUsed: input.playerModifiers.equipmentState?.reviveUsed ?? false, voodooUsed: input.playerModifiers.equipmentState?.voodooUsed ?? false };
  const enemyEquipmentState: EquipmentBattleState = { reviveUsed: input.enemyModifiers.equipmentState?.reviveUsed ?? false, voodooUsed: input.enemyModifiers.equipmentState?.voodooUsed ?? false };

  if (playerHp === 0 && playerEquipment && !playerEquipmentState.reviveUsed && playerEquipment.reviveHpPct > 0 && input.playerMaxHp) {
    playerHp = Math.max(1, Math.round(input.playerMaxHp * playerEquipment.reviveHpPct / 100));
    playerEquipmentState.reviveUsed = true;
  }
  if (enemyHp === 0 && enemyEquipment && !enemyEquipmentState.reviveUsed && enemyEquipment.reviveHpPct > 0 && input.enemyMaxHp) {
    enemyHp = Math.max(1, Math.round(input.enemyMaxHp * enemyEquipment.reviveHpPct / 100));
    enemyEquipmentState.reviveUsed = true;
  }
  if (playerHp === 0 && playerEquipment && !playerEquipmentState.voodooUsed && playerEquipment.voodooHpReductionPct > 0 && input.enemyMaxHp) {
    enemyHp = Math.max(0, enemyHp - Math.round(input.enemyMaxHp * playerEquipment.voodooHpReductionPct / 100));
    playerEquipmentState.voodooUsed = true;
  }
  if (enemyHp === 0 && enemyEquipment && !enemyEquipmentState.voodooUsed && enemyEquipment.voodooHpReductionPct > 0 && input.playerMaxHp) {
    playerHp = Math.max(0, playerHp - Math.round(input.playerMaxHp * enemyEquipment.voodooHpReductionPct / 100));
    enemyEquipmentState.voodooUsed = true;
  }
  const status: DuelStatus = enemyHp === 0 ? "won" : playerHp === 0 ? "lost" : "active";
  return {
    enemyEquipmentState,
    playerHp,
    enemyHp,
    playerPool: cycleCardPoolSlot(input.playerPool, input.slotIndex),
    enemyPool: cycleCardPoolSlot(input.enemyPool, input.slotIndex),
    status,
    playerEquipmentState,
    exchange: {
      slotIndex: input.slotIndex,
      turnNumber: input.turnNumber + 1,
      playerCard,
      enemyCard,
      playerMultiplier: playerAttack.multiplier,
      enemyMultiplier: enemyAttack.multiplier,
      playerDamage,
      enemyDamage,
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
  accountBoostMultiplier: 1 | 2 = 1,
  playerDamage?: number,
): DuelReward {
  assertPercentage(modifiers.experienceRewardPct, "Experience reward percentage");
  assertPercentage(modifiers.silverRewardPct, "Silver reward percentage");
  const baseXp = playerDamage ?? getDuelBaseXp(level, outcome);
  assertNonNegativeInteger(baseXp, "Base battle XP");
  const baseSilver = getDuelBaseSilver(level, outcome);
  const modified = calculateBattleReward(
    baseXp,
    baseSilver,
    modifiers,
    accountBoostMultiplier,
  );
  return {
    ...modified,
    baseXp,
    baseSilver,
  };
}

export function getDuelGoldReward(
  level: number,
  outcome: DuelOutcome,
  earnedDailyGold: number,
  random: RandomSource = Math.random,
  rewardMultiplier: 1 | 2 = 1,
) {
  assertPositiveInteger(level, "Account level");
  assertNonNegativeInteger(earnedDailyGold, "Earned daily Duel gold");
  if (rewardMultiplier !== 1 && rewardMultiplier !== 2) {
    throw new RangeError("Duel gold reward multiplier must be 1 or 2");
  }
  const dailyCap = level * rewardMultiplier;
  if (outcome !== "win" || earnedDailyGold >= dailyCap) return 0;
  const randomValue = random();
  if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
    throw new RangeError("Random source must return a value in [0, 1)");
  }
  const requested = (randomValue < 0.5 ? DUEL_GOLD_REWARD_MIN : DUEL_GOLD_REWARD_MAX) * rewardMultiplier;
  return Math.min(requested, dailyCap - earnedDailyGold);
}

export function calculateBattleReward(
  baseXp: number,
  baseSilver: number,
  modifiers: Pick<DuelBattleModifiers, "experienceRewardPct" | "silverRewardPct">,
  accountBoostMultiplier: 1 | 2 = 1,
  experienceBaseMultiplier = 1,
): ModifiedBattleReward {
  assertNonNegativeInteger(baseXp, "Base battle XP");
  assertNonNegativeInteger(baseSilver, "Base battle silver");
  assertPercentage(modifiers.experienceRewardPct, "Experience reward percentage");
  assertPercentage(modifiers.silverRewardPct, "Silver reward percentage");
  if (accountBoostMultiplier !== 1 && accountBoostMultiplier !== 2) {
    throw new RangeError("Account boost multiplier must be 1 or 2");
  }
  if (!Number.isFinite(experienceBaseMultiplier) || experienceBaseMultiplier < 0) {
    throw new RangeError("Experience base multiplier must be a non-negative number");
  }
  const accountBoostPct = (accountBoostMultiplier - 1) * 100;
  return {
    accountBoostMultiplier,
    xp: Math.round(baseXp * experienceBaseMultiplier * (1 + (modifiers.experienceRewardPct + accountBoostPct) / 100)),
    silver: Math.round(baseSilver * (1 + modifiers.silverRewardPct / 100) * accountBoostMultiplier),
  };
}

export function getRequiredAccountXp(level: number) {
  assertPositiveInteger(level, "Account level");
  if (level >= MAX_ACCOUNT_LEVEL) return 0;
  const required = ACCOUNT_XP_REQUIRED_BY_LEVEL[level + 1];
  if (required === undefined) {
    throw new RangeError(`No canonical account XP data configured for level ${level}`);
  }
  return required;
}

export function applyAccountXp(input: {
  gainedXp: number;
  level: number;
  xp: number;
}): AccountXpResult {
  assertPositiveInteger(input.level, "Account level");
  assertNonNegativeInteger(input.xp, "Account XP");
  assertNonNegativeInteger(input.gainedXp, "Gained account XP");
  let newLevel = Math.min(input.level, MAX_ACCOUNT_LEVEL);
  let remainingXp = input.xp + input.gainedXp;
  const reachedLevels: number[] = [];
  while (newLevel < MAX_ACCOUNT_LEVEL && remainingXp >= getRequiredAccountXp(newLevel)) {
    remainingXp -= getRequiredAccountXp(newLevel);
    newLevel += 1;
    reachedLevels.push(newLevel);
  }
  if (newLevel === MAX_ACCOUNT_LEVEL) remainingXp = 0;
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
