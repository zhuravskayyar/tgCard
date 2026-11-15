import {
  getInvasionCycleIndex,
  getRarityForLevel,
  INVASION_CYCLE_MS,
  INVASION_LOG_SIZE,
  type InvasionBattleState,
  type InvasionBossDeckCardSeed,
  type InvasionBossDefinition,
  type InvasionModifiers,
  type InvasionStrike,
  type RandomSource,
} from "@cardastika/game-core";
import type { DuelCardSnapshot, InvasionBattleView, InvasionLogEntry } from "@cardastika/shared";

/** What `invasion_battles.state` holds: everything is frozen at attack time, nothing is reloaded later. */
export interface StoredInvasionState {
  core: InvasionBattleState;
  modifiers: InvasionModifiers & { experienceRewardPct: number; silverRewardPct: number };
  deckPower: number;
}

export interface StoredInvasionBattle {
  id: string;
  version: number;
  boss_number: number;
  state: StoredInvasionState;
  log: InvasionLogEntry[];
  finished: boolean;
}

/** pg returns BIGINT as a string. */
export function toSafeNumber(value: number | string | null | undefined, field: string) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${field}`);
  return parsed;
}

export function toIso(value: string | Date) {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

/** Collection and title percentage applied to a card's power (the HP follows, being the sum of powers). */
export function applyInvasionPowerPct(card: DuelCardSnapshot, pct: number): DuelCardSnapshot {
  if (pct <= 0) return card;
  return { ...card, finalPower: Math.round(card.finalPower * (1 + pct / 100)) };
}

export interface InvasionCardRow {
  id: string;
  code: string;
  display_name: string | null;
  art_key: string | null;
}

/** Turns the rolled seeds into frozen boss cards; art and names come from the `cards` rows. */
export function buildBossDeckSnapshots(
  boss: InvasionBossDefinition,
  seeds: readonly InvasionBossDeckCardSeed[],
  rows: ReadonlyMap<string, InvasionCardRow>,
  idPrefix: string,
): DuelCardSnapshot[] {
  return seeds.map((seed, index) => {
    const row = rows.get(seed.cardId);
    return {
      artKey: row?.art_key ?? null,
      basePower: seed.finalPower,
      bonusPower: 0,
      cardId: seed.cardId,
      code: row?.code ?? seed.cardId,
      displayName: row?.display_name ?? null,
      element: seed.element,
      finalPower: seed.finalPower,
      instanceId: `${idPrefix}:boss${boss.number}:${index}`,
      level: boss.prizeLevel,
      limited: false,
      rarity: getRarityForLevel(boss.prizeLevel),
    };
  });
}

export function pickRandom<T>(items: readonly T[], random: RandomSource): T {
  if (!items.length) throw new RangeError("Cannot pick from an empty list");
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))]!;
}

export function toLogEntry(strike: InvasionStrike): InvasionLogEntry {
  return {
    slotIndex: strike.slotIndex,
    turnNumber: strike.turnNumber,
    playerCard: strike.playerCard,
    bossCard: strike.bossCard,
    playerDamage: strike.playerDamage,
    playerMultiplier: strike.playerMultiplier,
    bossDamage: strike.bossDamage,
    bossMultiplier: strike.bossMultiplier,
    superStrike: strike.superStrike,
  };
}

export function appendLog(log: readonly InvasionLogEntry[], entries: readonly InvasionLogEntry[]) {
  return [...log, ...entries].slice(-INVASION_LOG_SIZE);
}

export function toBattleView(row: StoredInvasionBattle, now: number): InvasionBattleView {
  const core = row.state.core;
  return {
    id: row.id,
    version: row.version,
    bossNumber: row.boss_number,
    startedAt: new Date(core.startedAt).toISOString(),
    serverNow: new Date(now).toISOString(),
    cycleMs: INVASION_CYCLE_MS,
    cycleIndex: getInvasionCycleIndex(core.startedAt, now),
    playerHp: core.playerHp,
    playerMaxHp: core.playerMaxHp,
    playerSlots: core.playerSlots.map((slot) => ({ card: slot.card, readyCycle: slot.readyCycle })),
    bossSlots: core.bossSlots,
    log: row.log,
    damageDealt: core.damageDealt,
    finished: row.finished,
  };
}
