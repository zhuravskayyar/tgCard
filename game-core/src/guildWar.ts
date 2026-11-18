import { CARD_ELEMENTS, type DuelBattleModifiers, type DuelCardSnapshot, type DuelExchange, type GuildWarCards, type GuildWarFighterView, type GuildWarLocationView, type GuildWarSkill, type GuildWarSlot } from "@cardastika/shared";
import { calculateArenaDamage } from "./arena.js";
import { getZodiacCollectionElementPct } from "./collectionModifiers.js";
import { cycleCardPoolSlotWithGuildCard, getDuelLogVisualState, getElementMultiplier, initializeCyclicCardPool, type CyclicCardPool } from "./duel.js";

export const GUILD_WAR_GUILD_UNLOCK_LEVEL = 35;
export const GUILD_WAR_MAX_KEYS = 3;
export const GUILD_WAR_LATE_JOIN_GOLD = 10;
export const GUILD_WAR_ATTACK_COOLDOWN_MS = 8_000;

export type GuildWarPhase = "pairing" | "key_duels" | "mass_battle" | "results" | "rest";

export interface GuildWarSchedule {
  endsAt: string;
  phase: GuildWarPhase;
  startsAt: string;
  weekStartsAt: string;
}

export interface GuildWarGuildSeed {
  id: string;
  level: number;
  name: string;
  warRating: number;
}

export interface GuildWarPairing {
  guildA: GuildWarGuildSeed;
  guildB: GuildWarGuildSeed | null;
  order: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Guild wars use a UTC week so the server and every player's UI agree on phase boundaries. */
export function getGuildWarWeekStart(now = new Date()) {
  const day = now.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday));
}

export function getGuildWarSchedule(now = new Date()): GuildWarSchedule {
  const weekStart = getGuildWarWeekStart(now);
  const dayIndex = Math.floor((now.getTime() - weekStart.getTime()) / DAY_MS);
  const phases: readonly GuildWarPhase[] = ["pairing", "key_duels", "mass_battle", "key_duels", "mass_battle", "results", "rest"];
  const phaseStart = new Date(weekStart.getTime() + dayIndex * DAY_MS);
  return {
    endsAt: new Date(phaseStart.getTime() + DAY_MS).toISOString(),
    phase: phases[Math.max(0, Math.min(phases.length - 1, dayIndex))]!,
    startsAt: phaseStart.toISOString(),
    weekStartsAt: weekStart.toISOString(),
  };
}

/**
 * Pair the strongest neighboring guilds by war rating. If the eligible count is odd,
 * the highest rated level-34 guild joins the field, matching the reference rules.
 */
export function pairGuildWars(eligible: readonly GuildWarGuildSeed[], level34Candidates: readonly GuildWarGuildSeed[]): GuildWarPairing[] {
  const field = [...eligible];
  if (field.length % 2 === 1) {
    const candidate = [...level34Candidates]
      .filter((guild) => guild.level === GUILD_WAR_GUILD_UNLOCK_LEVEL - 1)
      .sort(compareWarGuilds)[0];
    if (candidate && !field.some((guild) => guild.id === candidate.id)) field.push(candidate);
  }
  field.sort(compareWarGuilds);

  const pairings: GuildWarPairing[] = [];
  for (let index = 0; index < field.length; index += 2) {
    pairings.push({ guildA: field[index]!, guildB: field[index + 1] ?? null, order: pairings.length + 1 });
  }
  return pairings;
}

function compareWarGuilds(left: GuildWarGuildSeed, right: GuildWarGuildSeed) {
  return right.warRating - left.warRating
    || right.level - left.level
    || left.name.localeCompare(right.name, "uk")
    || left.id.localeCompare(right.id);
}

const HOUR_MS = DAY_MS / 24;
const WAR_LOCATIONS: readonly [GuildWarLocationView, GuildWarLocationView][] = [
  [{ id: 0, elements: ["air", "fire"] }, { id: 1, elements: ["water", "earth"] }],
  [{ id: 2, elements: ["air", "earth"] }, { id: 3, elements: ["water", "fire"] }],
  [{ id: 4, elements: ["air", "water"] }, { id: 5, elements: ["fire", "earth"] }],
];
const WAR_SLOTS = [0, 1, 2] as const;

export function getGuildWarBattleSchedule(weekStartsAt: string, number: number) {
  const day = number <= 4 ? 2 : 4;
  const starts = new Date(weekStartsAt).getTime() + day * DAY_MS + ((number - 1) % 4) * 6 * HOUR_MS;
  return {
    registrationAt: starts,
    locationAt: starts + HOUR_MS,
    wastelandAt: starts + 3 * HOUR_MS,
    endsAt: starts + 6 * HOUR_MS,
    locations: WAR_LOCATIONS[(number - 1) % WAR_LOCATIONS.length]!,
    keyDay: day - 1,
  };
}

export function getGuildWarAttemptsLeft(attempts: number, keys: number, failures: number, extraAttempt: boolean) {
  if (keys >= GUILD_WAR_MAX_KEYS) return 0;
  return Math.max(0, GUILD_WAR_MAX_KEYS + (extraAttempt && failures > 0 ? 1 : 0) - attempts);
}

export function getGuildWarBonuses(collectionCodes: readonly string[]) {
  const codes = new Set(collectionCodes);
  return {
    hpPct: codes.has("wizards") ? 5 : 0,
    extraAttempt: codes.has("ufavorites"),
    berserk: codes.has("berserks"),
    ancient: codes.has("ancient_order"),
  };
}

export interface GuildWarFighter {
  playerId: string;
  name: string;
  level: number;
  photoUrl: string | null;
  hp: number;
  maxHp: number;
  damage: number;
  version: number;
  readyAt: [number, number, number];
  pool: CyclicCardPool<DuelCardSnapshot>;
  guildCard: DuelCardSnapshot | null;
  modifiers: DuelBattleModifiers;
  berserkAvailable: boolean;
  ancientAvailable: boolean;
  ancientUsed: boolean;
  crystalUsed: boolean;
  lastExchange: DuelExchange | null;
  lastTargetId: string | null;
}

export function createGuildWarFighter(input: {
  playerId: string;
  name: string;
  level: number;
  photoUrl: string | null;
  cards: readonly DuelCardSnapshot[];
  guildCard: DuelCardSnapshot | null;
  modifiers: DuelBattleModifiers;
  startingHp: number;
  collectionCodes: readonly string[];
  location?: GuildWarLocationView;
}): GuildWarFighter {
  const bonuses = getGuildWarBonuses(input.collectionCodes);
  const zodiac = getZodiacCollectionElementPct(input.collectionCodes);
  const ownCards = input.cards.map((card) => ({
    ...card,
    finalPower: Math.round(card.finalPower * (1 + zodiac[card.element] / 100)),
  }));
  const zodiacHp = ownCards.reduce((total, card, index) => total + card.finalPower - input.cards[index]!.finalPower, 0);
  const maxHp = Math.round((input.startingHp + zodiacHp) * (1 + bonuses.hpPct / 100));
  const withLocation = (card: DuelCardSnapshot) => input.location?.elements.includes(card.element)
    ? { ...card, finalPower: Math.round(card.finalPower * 1.05) }
    : card;
  return {
    playerId: input.playerId, name: input.name, level: input.level, photoUrl: input.photoUrl, hp: maxHp, maxHp,
    pool: initializeCyclicCardPool(ownCards.map(withLocation), Math.random),
    guildCard: input.guildCard ? withLocation(input.guildCard) : null,
    modifiers: input.modifiers, damage: 0, version: 0, readyAt: [0, 0, 0],
    berserkAvailable: bonuses.berserk, ancientAvailable: bonuses.ancient,
    ancientUsed: false, crystalUsed: false, lastExchange: null, lastTargetId: null,
  };
}

export function getGuildWarFighterView(fighter: GuildWarFighter, crystalCount = 0): GuildWarFighterView {
  const { playerId, name, level, photoUrl, hp, maxHp, damage, version, readyAt, lastExchange, lastTargetId } = fighter;
  return {
    playerId, name, level, photoUrl, hp, maxHp, damage, version, readyAt, lastExchange, lastTargetId,
    cards: fighter.pool.activeCards,
    strikeMultiplierBonus: fighter.modifiers.strikeMultiplierBonus,
    berserkAvailable: fighter.berserkAvailable,
    ancientAvailable: fighter.ancientAvailable && !fighter.ancientUsed,
    crystalAvailable: fighter.ancientAvailable && fighter.ancientUsed && !fighter.crystalUsed && crystalCount > 0,
  };
}

function applyWarHit(fighter: GuildWarFighter, damage: number) {
  fighter.hp = Math.max(0, fighter.hp - damage);
  const equipment = fighter.modifiers.equipment;
  const state = fighter.modifiers.equipmentState;
  if (!fighter.hp && equipment && state && !state.reviveUsed && equipment.reviveHpPct > 0) {
    fighter.hp = Math.max(1, Math.round(fighter.maxHp * equipment.reviveHpPct / 100));
    state.reviveUsed = true;
  }
}

function applyWarVoodoo(fighter: GuildWarFighter, killer: GuildWarFighter) {
  const pct = fighter.modifiers.equipment?.voodooHpReductionPct ?? 0;
  const state = fighter.modifiers.equipmentState;
  if (!fighter.hp && killer.hp && pct > 0 && state && !state.voodooUsed) {
    const damage = Math.round(killer.maxHp * pct / 100);
    fighter.damage += Math.min(killer.hp, damage);
    applyWarHit(killer, damage);
    state.voodooUsed = true;
  }
}

export function canUseGuildWarSkill(fighter: GuildWarFighter, skill: GuildWarSkill, slot: GuildWarSlot, now: number) {
  if (!fighter.hp || fighter.readyAt[slot] > now) return false;
  if (skill === "normal") return true;
  if (fighter.readyAt.some((readyAt) => readyAt > now)) return false;
  if (skill === "berserk") return fighter.berserkAvailable;
  if (skill === "ancient") return fighter.ancientAvailable && !fighter.ancientUsed;
  return fighter.ancientAvailable && fighter.ancientUsed && !fighter.crystalUsed;
}

export function strikeGuildWarFighter(
  player: GuildWarFighter,
  enemy: GuildWarFighter,
  slot: GuildWarSlot,
  skill: GuildWarSkill,
  now: number,
  keyDuel: boolean,
) {
  const ownCards: GuildWarCards = player.pool.activeCards;
  const enemyCard = enemy.pool.activeCards[slot];
  const ancient = skill === "ancient" || skill === "ancient_crystal";
  const power = ownCards.reduce((sum, card) => sum + card.finalPower, 0);
  const playerCard = ancient ? {
    ...ownCards[slot], code: "guild_war_ancient", displayName: "Давня істота", finalPower: power,
  } : ownCards[slot];
  const targetElement = ancient
    ? CARD_ELEMENTS.find((element) => getElementMultiplier(playerCard.element, element) === 1.5)!
    : enemyCard.element;
  const attack = calculateArenaDamage({
    attacker: playerCard, attackerModifiers: player.modifiers,
    defender: { ...enemyCard, element: targetElement }, defenderModifiers: enemy.modifiers,
  });
  const counter = calculateArenaDamage({
    attacker: enemyCard, attackerModifiers: enemy.modifiers, defender: ownCards[slot], counterattack: true,
  });
  const attackDamage = skill === "berserk"
    ? 2 * ownCards.reduce((sum, card) => sum + calculateArenaDamage({
      attacker: card, attackerModifiers: player.modifiers, defender: enemyCard, defenderModifiers: enemy.modifiers,
    }).damage, 0)
    : attack.damage;
  const enemyDamage = Math.round((counter.damage + attack.reflectedDamage) * (ancient ? 0.5 : 1));
  player.damage += Math.min(enemy.hp, attackDamage);
  enemy.damage += Math.min(player.hp, enemyDamage);
  applyWarHit(player, enemyDamage);
  applyWarHit(enemy, attackDamage);
  applyWarVoodoo(player, enemy);
  applyWarVoodoo(enemy, player);
  applyWarVoodoo(player, enemy);

  const slots = skill === "normal" ? [slot] : WAR_SLOTS;
  for (const used of slots) {
    player.pool = cycleCardPoolSlotWithGuildCard(player.pool, used, player.guildCard).pool;
    if (!keyDuel) player.readyAt[used] = now + GUILD_WAR_ATTACK_COOLDOWN_MS;
  }
  if (keyDuel) enemy.pool = cycleCardPoolSlotWithGuildCard(enemy.pool, slot, enemy.guildCard).pool;
  if (skill === "berserk") player.berserkAvailable = false;
  if (ancient) player.ancientUsed = true;
  if (skill === "ancient_crystal") player.crystalUsed = true;

  player.version += 1;
  player.lastTargetId = enemy.playerId;
  player.lastExchange = {
    playerCard, enemyCard, playerMultiplier: attack.multiplier, enemyMultiplier: counter.multiplier,
    playerDamage: attackDamage, enemyDamage, slotIndex: slot, turnNumber: player.version,
    visualState: getDuelLogVisualState(attack.multiplier, counter.multiplier),
  };
}

export function getGuildWarWinner(
  a: { id: string | null; wins: number; damage: number },
  b: { id: string | null; wins: number; damage: number },
) {
  if (!a.id || !b.id) return null;
  const difference = a.wins - b.wins || a.damage - b.damage;
  return difference === 0 ? null : difference > 0 ? a.id : b.id;
}
