import { randomInt, randomUUID } from "node:crypto";
import {
  applyAccountXp,
  canUseGuildWarSkill,
  createGuildWarFighter,
  getGuildWarAttemptsLeft,
  getGuildWarBattleSchedule,
  getGuildWarBonuses,
  getGuildWarFighterView,
  getGuildWarWinner,
  GUILD_WAR_LATE_JOIN_GOLD,
  GUILD_WAR_MAX_KEYS,
  strikeGuildWarFighter,
  type GuildWarFighter,
  type GuildWarSchedule,
} from "@cardastika/game-core";
import {
  CARD_ELEMENTS, getGuildMemberCapacity, type GuildRole, type GuildWarAction, type GuildWarBattleView,
  type GuildWarHistoryView, type GuildWarKeyDayView, type GuildWarLocationView,
} from "@cardastika/shared";
import type { PoolClient } from "pg";
import { getCurrencyBoostStatus } from "../boosts/currencyBoost.js";
import { createMagicSourceInstance } from "../cards/cardInstanceCreator.js";
import { DuelDeckInvalidError, loadDuelParticipant, toGuildDuelCard } from "../duel/duelService.js";

const DUEL_IDLE_MS = 15 * 60 * 1_000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1_000;
const MILITARY_PLAN_ROLES: readonly GuildRole[] = ["leader", "officer", "veteran"];

interface WarMatch {
  id: string;
  guild_a_id: string | null;
  guild_b_id: string | null;
  guild_a_level: number;
  guild_b_level: number | null;
}

interface ActiveWar {
  action?: GuildWarAction;
  guildId: string;
  playerId: string;
  match: WarMatch;
  schedule: GuildWarSchedule;
  now: Date;
  role?: GuildRole;
}

interface KeyAttempt {
  id: string;
  player_id: string;
  target_id: string | null;
  status: "active" | "won" | "lost";
  player_fighter: GuildWarFighter | null;
  target_fighter: GuildWarFighter | null;
  xp: string | number;
}

interface BattleFighter {
  player_id: string;
  guild_id: string;
  location_id: number;
  fighter: GuildWarFighter;
  earned_xp: string | null;
}

export class GuildWarDomainError extends Error {
  constructor(public readonly code: string, message = code, public readonly status = 409) {
    super(message);
    this.name = "GuildWarDomainError";
  }
}

function reject(code: string, message: string): never {
  throw new GuildWarDomainError(code, message);
}

async function getCollectionCodes(client: PoolClient, playerId: string) {
  const result = await client.query<{ code: string }>(
    `SELECT c.code FROM player_collection_completions p
     JOIN collections c ON c.id = p.collection_id WHERE p.player_id = $1`,
    [playerId],
  );
  return result.rows.map(({ code }) => code);
}

async function loadFighter(client: PoolClient, playerId: string, location?: GuildWarLocationView) {
  try {
    const { snapshot, guildCard } = await loadDuelParticipant(client, playerId);
    return createGuildWarFighter({
      ...snapshot, playerId, guildCard: toGuildDuelCard(guildCard), location,
      collectionCodes: await getCollectionCodes(client, playerId),
    });
  } catch (error) {
    if (error instanceof DuelDeckInvalidError) reject("war_deck_invalid", "A complete battle deck is required");
    throw error;
  }
}

async function grantWarXp(client: PoolClient, fighter: GuildWarFighter, baseXp: number, now: Date) {
  if (baseXp <= 0) return 0;
  const boost = await getCurrencyBoostStatus(client, fighter.playerId, now);
  const xp = Math.round(baseXp * (1 + fighter.modifiers.experienceRewardPct / 100) * boost.multiplier);
  const player = (await client.query<{ level: number; account_xp: string | number }>(
    "SELECT level, account_xp FROM players WHERE id = $1 FOR UPDATE", [fighter.playerId],
  )).rows[0];
  if (!player) return 0;
  const result = applyAccountXp({ level: player.level, xp: Number(player.account_xp), gainedXp: xp });
  await client.query(
    "UPDATE players SET level = $2, account_xp = $3, gold = gold + $4, updated_at = NOW() WHERE id = $1",
    [fighter.playerId, result.newLevel, result.remainingXp, result.goldReward],
  );
  return xp;
}

function getWarKeyDay({ startsAt, weekStartsAt }: Pick<GuildWarSchedule, "startsAt" | "weekStartsAt">) {
  return Math.round((Date.parse(startsAt) - Date.parse(weekStartsAt)) / 86_400_000);
}

function getWarOpponent(war: ActiveWar) {
  return war.guildId === war.match.guild_a_id ? war.match.guild_b_id : war.match.guild_a_id;
}

async function getFreeKeys(client: PoolClient, war: ActiveWar, day: number) {
  const guildIsA = war.guildId === war.match.guild_a_id;
  const opponentLevel = guildIsA ? war.match.guild_b_level : war.match.guild_a_level;
  if (!opponentLevel) return 0;
  const capacity = getGuildMemberCapacity(opponentLevel);
  const result = (await client.query<{ roster: number; claimed: number }>(
    `SELECT
        (SELECT COUNT(*)::int FROM guild_war_participants WHERE match_id = $1 AND guild_id = $2) AS roster,
        (SELECT COUNT(*)::int FROM guild_war_key_attempts attempt
         JOIN guild_war_participants participant ON participant.match_id = attempt.match_id AND participant.player_id = attempt.player_id
         WHERE attempt.match_id = $1 AND attempt.key_day = $4 AND participant.guild_id = $3 AND attempt.target_id IS NULL) AS claimed`,
    [war.match.id, getWarOpponent(war), war.guildId, day],
  )).rows[0]!;
  return Math.max(0, capacity - result.roster - result.claimed);
}

async function getKeyAttempts(client: PoolClient, matchId: string, day: number, playerId: string) {
  return (await client.query<KeyAttempt>(
    `SELECT id, player_id, target_id, status, player_fighter, target_fighter, xp
     FROM guild_war_key_attempts WHERE match_id = $1 AND key_day = $2 AND player_id = $3
     ORDER BY created_at DESC, id DESC`,
    [matchId, day, playerId],
  )).rows;
}

function countKeys(attempts: readonly KeyAttempt[]) {
  return attempts.filter(({ status }) => status === "won").length;
}

async function getKeyTargets(client: PoolClient, war: ActiveWar, day: number) {
  const result = await client.query<{ player_id: string; available: number; attacked: boolean }>(
    `SELECT p.player_id, COUNT(a.id) FILTER (WHERE a.status IN ('won', 'active'))::int AS available,
            COALESCE(BOOL_OR(a.player_id = $4), false) AS attacked
     FROM guild_war_participants p
     LEFT JOIN guild_war_key_attempts a ON a.match_id = p.match_id AND a.key_day = $3 AND a.target_id = p.player_id
     WHERE p.match_id = $1 AND p.guild_id = $2 GROUP BY p.player_id`,
    [war.match.id, getWarOpponent(war), day, war.playerId],
  );
  return result.rows.map(({ player_id: playerId, available, attacked }) => ({
    playerId, attacked, keysLeft: Math.max(0, GUILD_WAR_MAX_KEYS - available),
  }));
}

async function resolveKeyAttempt(client: PoolClient, attempt: KeyAttempt, now: Date, status: "active" | "won" | "lost") {
  const player = attempt.player_fighter!;
  const xp = status === "active" ? 0 : await grantWarXp(client, player, Math.floor(player.damage * (status === "won" ? 1 : 0.5)), now);
  await client.query(
    "UPDATE guild_war_key_attempts SET status = $2, player_fighter = $3, target_fighter = $4, xp = $5, updated_at = $6 WHERE id = $1",
    [attempt.id, status, player, attempt.target_fighter, xp, now],
  );
}

async function expireKeyAttempts(client: PoolClient, matchId: string, schedule: Pick<GuildWarSchedule, "startsAt" | "weekStartsAt">, now: Date) {
  const currentDay = getWarKeyDay(schedule);
  const result = await client.query<KeyAttempt>(
    `SELECT id, player_id, target_id, status, player_fighter, target_fighter, xp
     FROM guild_war_key_attempts WHERE match_id = $1 AND status = 'active'
       AND (key_day < $2 OR updated_at <= $3)
     ORDER BY player_id`,
    [matchId, currentDay, new Date(now.getTime() - DUEL_IDLE_MS)],
  );
  for (const attempt of result.rows) await resolveKeyAttempt(client, attempt, now, "lost");
}

async function runKeyAction(client: PoolClient, war: ActiveWar, attempts: KeyAttempt[], attemptsLeft: number, day: number) {
  const { action, now, match, playerId } = war;
  if (!action) return;
  const active = attempts.find(({ status }) => status === "active");
  if (action.type === "duel_strike") {
    if (!active || active.id !== action.duelId) reject("war_no_active_duel", "The guild war duel is no longer active");
    const player = active.player_fighter!;
    const enemy = active.target_fighter!;
    if (player.version !== action.version) reject("war_stale_battle", "Reload the guild war fight");
    strikeGuildWarFighter(player, enemy, action.slot, "normal", now.getTime(), true);
    await resolveKeyAttempt(client, active, now, !enemy.hp && player.hp ? "won" : !player.hp ? "lost" : "active");
    return;
  }
  if (action.type !== "claim_key" && action.type !== "start_duel") reject("war_wrong_phase", "Team fights are not active");
  if (active) reject("war_duel_active", "Finish your active duel first");
  if (attemptsLeft <= 0) reject("war_no_attempts", "There are no attempts remaining");
  if (action.type === "claim_key") {
    if (action.expectedKeys !== countKeys(attempts)) reject("war_stale_keys", "Reload your guild war keys");
    if (!await getFreeKeys(client, war, day)) reject("war_no_free_key", "There are no free keys remaining");
    await client.query(
      "INSERT INTO guild_war_key_attempts (id, match_id, key_day, player_id, status, updated_at) VALUES ($1, $2, $3, $4, 'won', $5)",
      [randomUUID(), match.id, day, playerId, now],
    );
    return;
  }
  const target = (await getKeyTargets(client, war, day)).find(({ playerId }) => playerId === action.targetId);
  if (!target || target.attacked || !target.keysLeft) reject("war_target_unavailable", "This opponent has no available key");
  const player = await loadFighter(client, playerId);
  const enemy = await loadFighter(client, target.playerId);
  await client.query(
    `INSERT INTO guild_war_key_attempts (id, match_id, key_day, player_id, target_id, status, player_fighter, target_fighter, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, $8)`,
    [randomUUID(), match.id, day, playerId, target.playerId, player, enemy, now],
  );
}

async function getKeyDayView(client: PoolClient, war: ActiveWar): Promise<GuildWarKeyDayView> {
  const day = getWarKeyDay(war.schedule);
  const getAttemptsLeft = (attempts: readonly KeyAttempt[], extra: boolean) => getGuildWarAttemptsLeft(
    attempts.length, countKeys(attempts), attempts.filter(({ status }) => status === "lost").length, extra,
  );
  const { extraAttempt } = getGuildWarBonuses(await getCollectionCodes(client, war.playerId));
  let attempts = await getKeyAttempts(client, war.match.id, day, war.playerId);
  if (war.action) {
    await runKeyAction(client, war, attempts, getAttemptsLeft(attempts, extraAttempt), day);
    attempts = await getKeyAttempts(client, war.match.id, day, war.playerId);
  }
  const duel = attempts.find(({ target_id }) => target_id !== null);
  return {
    keys: countKeys(attempts), attemptsLeft: getAttemptsLeft(attempts, extraAttempt),
    freeKeys: await getFreeKeys(client, war, day), targets: await getKeyTargets(client, war, day),
    duel: duel ? {
      id: duel.id, status: duel.status, xp: Number(duel.xp),
      player: getGuildWarFighterView(duel.player_fighter!),
      enemy: getGuildWarFighterView(duel.target_fighter!),
    } : null,
  };
}

function getTeamBattleState(now: number, schedule: ReturnType<typeof getGuildWarBattleSchedule>): GuildWarBattleView["state"] {
  if (now < schedule.registrationAt) return "upcoming";
  if (now < schedule.locationAt) return "registration";
  if (now < schedule.wastelandAt) return "location";
  if (now < schedule.endsAt) return "wasteland";
  return "settled";
}

async function getBattleFighters(client: PoolClient, matchId: string, battleNumber: number) {
  return (await client.query<BattleFighter>(
    `SELECT player_id, guild_id, location_id, fighter, earned_xp FROM guild_war_battle_fighters
     WHERE match_id = $1 AND battle_number = $2 ORDER BY player_id`,
    [matchId, battleNumber],
  )).rows;
}

function getTeamBattleTargets(fighters: BattleFighter[], guildId: string, locationId: number, state: GuildWarBattleView["state"]) {
  if (state !== "location" && state !== "wasteland") return [];
  return fighters.filter((entry) => entry.guild_id !== guildId && entry.fighter.hp > 0
    && (state === "wasteland" || entry.location_id === locationId));
}

async function consumeCrystal(client: PoolClient, playerId: string) {
  const result = await client.query("DELETE FROM guild_war_magic_crystals WHERE player_id = $1", [playerId]);
  if (!result.rowCount) reject("war_no_magic_crystal", "You have no Magic Crystal");
}

async function runBattleAction(
  client: PoolClient, war: ActiveWar, number: number,
  schedule: ReturnType<typeof getGuildWarBattleSchedule>, state: GuildWarBattleView["state"],
  fighters: BattleFighter[], unusedKeys: number,
) {
  const { action, guildId, match, playerId, now } = war;
  const own = fighters.find(({ player_id }) => player_id === playerId);
  if (action?.type === "join_battle") {
    if (own) return;
    if (state === "upcoming" || state === "settled" || unusedKeys <= 0) reject("war_join_unavailable", "A key and an open team battle are required");
    const location = schedule.locations.find(({ id }) => id === action.locationId);
    if (!location) reject("war_location_invalid", "Choose one of the battle locations");
    if (state !== "registration") {
      if (!action.acceptLateFee) reject("war_late_fee_required", "Joining a live battle costs 10 gold");
      const payment = await client.query(
        "UPDATE players SET gold = gold - $2, updated_at = NOW() WHERE id = $1 AND gold >= $2",
        [playerId, GUILD_WAR_LATE_JOIN_GOLD],
      );
      if (!payment.rowCount) reject("war_insufficient_gold", "Not enough gold to join late");
    }
    const fighter = await loadFighter(client, playerId, location);
    await client.query(
      `INSERT INTO guild_war_battle_fighters (match_id, battle_number, player_id, guild_id, location_id, fighter)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [match.id, number, playerId, guildId, location.id, fighter],
    );
    return;
  }
  if (action?.type !== "battle_strike" || !own || own.fighter.version !== action.version) {
    reject("war_stale_battle", "Reload the guild war fight");
  }
  const target = getTeamBattleTargets(fighters, guildId, own.location_id, state).find(({ player_id }) => player_id === action.targetId);
  if (!target || !canUseGuildWarSkill(own.fighter, action.skill, action.slot, now.getTime())) {
    reject("war_strike_unavailable", "This target or ability is unavailable");
  }
  if (action.skill === "ancient_crystal") await consumeCrystal(client, playerId);
  strikeGuildWarFighter(own.fighter, target.fighter, action.slot, action.skill, now.getTime(), false);
  for (const entry of [own, target]) {
    await client.query(
      "UPDATE guild_war_battle_fighters SET fighter = $4 WHERE match_id = $1 AND battle_number = $2 AND player_id = $3",
      [match.id, number, entry.player_id, entry.fighter],
    );
  }
}

async function getTeamBattlesView(client: PoolClient, war: ActiveWar) {
  const day = getWarKeyDay(war.schedule);
  const dayNumbers = day === 2 ? [1, 2, 3, 4] : [5, 6, 7, 8];
  const { action, guildId, match, playerId, now } = war;
  if (action && ((action.type !== "join_battle" && action.type !== "battle_strike") || !dayNumbers.includes(action.number))) {
    reject("war_wrong_phase", "The selected battle is not scheduled for today");
  }
  const keys = countKeys(await getKeyAttempts(client, match.id, day - 1, playerId));
  const alreadyJoined = (await client.query<{ battle_number: number }>(
    `SELECT battle_number FROM guild_war_battle_fighters
     WHERE match_id = $1 AND player_id = $2 AND battle_number = ANY($3::int[])`,
    [match.id, playerId, dayNumbers],
  )).rowCount ?? 0;
  let keysLeft = keys - alreadyJoined;
  const results = (await client.query<{ battle_number: number; winner_guild_id: string | null }>(
    "SELECT battle_number, winner_guild_id FROM guild_war_battle_results WHERE match_id = $1", [match.id],
  )).rows;
  const crystalCount = (await client.query<{ quantity: number }>(
    "SELECT quantity FROM guild_war_magic_crystals WHERE player_id = $1", [playerId],
  )).rows[0]?.quantity ?? 0;
  const battles: GuildWarBattleView[] = [];
  for (const number of dayNumbers) {
    const schedule = getGuildWarBattleSchedule(war.schedule.weekStartsAt, number);
    const state = getTeamBattleState(now.getTime(), schedule);
    let fighters = state === "upcoming" ? [] : await getBattleFighters(client, match.id, number);
    if (action?.number === number) {
      if (results.some(({ battle_number }) => battle_number === number)) reject("war_wrong_phase", "This battle has already ended");
      const previous = fighters.some(({ player_id }) => player_id === playerId);
      await runBattleAction(client, war, number, schedule, state, fighters, keysLeft);
      fighters = await getBattleFighters(client, match.id, number);
      if (action.type === "join_battle" && !previous) keysLeft -= 1;
    }
    const own = fighters.find(({ player_id }) => player_id === playerId);
    const targets = own ? getTeamBattleTargets(fighters, guildId, own.location_id, state) : [];
    const lastTarget = own?.fighter.lastTargetId ? fighters.find(({ player_id }) => player_id === own.fighter.lastTargetId) : undefined;
    if (lastTarget && !targets.some(({ player_id }) => player_id === lastTarget.player_id)) targets.push(lastTarget);
    battles.push({
      number, state, locations: schedule.locations,
      registrationAt: new Date(schedule.registrationAt).toISOString(),
      locationAt: new Date(schedule.locationAt).toISOString(),
      wastelandAt: new Date(schedule.wastelandAt).toISOString(),
      endsAt: new Date(schedule.endsAt).toISOString(),
      canJoin: Boolean(war.role && !own && keysLeft > 0 && state !== "upcoming" && state !== "settled"),
      lateJoinGold: state === "location" || state === "wasteland" ? GUILD_WAR_LATE_JOIN_GOLD : 0,
      player: own ? getGuildWarFighterView(own.fighter, crystalCount) : null,
      locationId: own?.location_id ?? null,
      targets: targets.map(({ fighter }) => getGuildWarFighterView(fighter)),
      earnedXp: own?.earned_xp == null ? null : Number(own.earned_xp),
      winnerGuildId: results.find(({ battle_number }) => battle_number === number)?.winner_guild_id ?? null,
      ...(war.role && MILITARY_PLAN_ROLES.includes(war.role) ? {
        alliesByLocation: schedule.locations.map(({ id }) => ({
          locationId: id,
          names: fighters.filter(({ guild_id, location_id }) => guild_id === guildId && location_id === id)
            .map(({ fighter }) => fighter.name),
        })),
      } : {}),
    });
  }
  return { battles, battleKeys: Math.max(0, keysLeft) };
}

export async function loadGuildWarCombat(client: PoolClient, war: ActiveWar) {
  if (war.action && (!war.role || !getWarOpponent(war))) reject("war_not_rostered", "Only rostered members with an opponent can fight");
  if (!getWarOpponent(war)) return {};
  if (war.schedule.phase === "key_duels" && war.role) {
    return { keyDay: await getKeyDayView(client, war) };
  }
  if (war.schedule.phase === "mass_battle") return getTeamBattlesView(client, war);
  if (war.action) reject("war_wrong_phase", "There is no active war phase");
  if (war.schedule.phase === "pairing") {
    return {
      plannedBattles: Array.from({ length: 8 }, (_, index) => {
        const number = index + 1;
        const schedule = getGuildWarBattleSchedule(war.schedule.weekStartsAt, number);
        return {
          number, registrationAt: new Date(schedule.registrationAt).toISOString(),
          locationAt: new Date(schedule.locationAt).toISOString(),
        };
      }),
    };
  }
  return {};
}

interface UnsettledMatch extends WarMatch {
  week_start: string;
  mass_battle_wins_a: number;
  mass_battle_wins_b: number;
  damage_a: string;
  damage_b: string;
}

async function settleTeamBattle(client: PoolClient, match: UnsettledMatch, number: number, endsAt: number) {
  const fighters = await getBattleFighters(client, match.id, number);
  const totals = (guildId: string | null) => fighters.filter(({ guild_id }) => guild_id === guildId).reduce(
    (result, { fighter }) => ({ hp: result.hp + fighter.hp, damage: result.damage + fighter.damage }),
    { hp: 0, damage: 0 },
  );
  const a = totals(match.guild_a_id);
  const b = totals(match.guild_b_id);
  const guildId = getGuildWarWinner(
    { id: match.guild_a_id, wins: a.hp, damage: a.damage },
    { id: match.guild_b_id, wins: b.hp, damage: b.damage },
  );
  await client.query(
    "INSERT INTO guild_war_battle_results (match_id, battle_number, winner_guild_id) VALUES ($1, $2, $3)",
    [match.id, number, guildId],
  );
  const winA = guildId && guildId === match.guild_a_id ? 1 : 0;
  const winB = guildId && guildId === match.guild_b_id ? 1 : 0;
  await client.query(
    `UPDATE guild_war_matches SET mass_battle_wins_a = mass_battle_wins_a + $2, mass_battle_wins_b = mass_battle_wins_b + $3,
         damage_a = damage_a + $4, damage_b = damage_b + $5 WHERE id = $1`,
    [match.id, winA, winB, a.damage, b.damage],
  );
  match.mass_battle_wins_a += winA;
  match.mass_battle_wins_b += winB;
  match.damage_a = String(Number(match.damage_a) + a.damage);
  match.damage_b = String(Number(match.damage_b) + b.damage);
  for (const { fighter } of fighters) {
    const xp = await grantWarXp(client, fighter, fighter.damage, new Date(endsAt));
    await client.query(
      "UPDATE guild_war_battle_fighters SET earned_xp = $4 WHERE match_id = $1 AND battle_number = $2 AND player_id = $3",
      [match.id, number, fighter.playerId, xp],
    );
  }
}

async function awardWarSide(
  client: PoolClient, matchId: string, ownGuildId: string, opponentGuildId: string, won: boolean, wins: number,
) {
  const opponentCard = (await client.query<{ level: number }>("SELECT level FROM guild_cards WHERE guild_id = $1", [opponentGuildId])).rows[0];
  const participants = (await client.query<{ player_id: string; keys: number }>(
    `SELECT p.player_id, COUNT(a.id)::int AS keys FROM guild_war_participants p
     LEFT JOIN guild_war_key_attempts a ON a.match_id = p.match_id AND a.player_id = p.player_id AND a.status = 'won'
     WHERE p.match_id = $1 AND p.guild_id = $2 GROUP BY p.player_id ORDER BY p.player_id`,
    [matchId, ownGuildId],
  )).rows;
  let treasuryGold = won ? 1_000 : 0;
  for (const { player_id: playerId, keys } of participants) {
    if (opponentCard) {
      await createMagicSourceInstance(client, playerId, CARD_ELEMENTS[randomInt(CARD_ELEMENTS.length)]!, Math.max(1, opponentCard.level - (won ? 0 : 10)));
    }
    const amount = keys * (won ? 5 : 2);
    if (amount) {
      treasuryGold += amount;
      await client.query(
        `INSERT INTO guild_treasury_contributions (id, guild_id, player_id, contribution_type, amount, game_bonus)
         VALUES ($1, $2, $3, 'gold', $4, $4)`,
        [randomUUID(), ownGuildId, playerId, amount],
      );
    }
  }
  await client.query(
    `INSERT INTO guild_treasuries (guild_id, gold) VALUES ($1, $2)
     ON CONFLICT (guild_id) DO UPDATE SET gold = guild_treasuries.gold + EXCLUDED.gold, updated_at = NOW()`,
    [ownGuildId, treasuryGold],
  );
  await client.query("UPDATE guilds SET war_rating = war_rating + $2 WHERE id = $1", [ownGuildId, wins + (won ? 1 : 0)]);
}

export async function advanceGuildWarMatch(client: PoolClient, matchId: string, now: Date) {
  const match = (await client.query<UnsettledMatch>(
    `SELECT id, week_start::text, guild_a_id, guild_b_id, guild_a_level, guild_b_level, mass_battle_wins_a,
            mass_battle_wins_b, damage_a, damage_b
     FROM guild_war_matches WHERE id = $1 AND settled_at IS NULL FOR UPDATE`,
    [matchId],
  )).rows[0];
  if (!match) return;
  const weekMs = Date.parse(match.week_start);
  const weekStart = new Date(weekMs).toISOString();
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const schedule = { startsAt: new Date(Math.min(midnight, weekMs + WEEK_MS)).toISOString(), weekStartsAt: weekStart };
  await expireKeyAttempts(client, match.id, schedule, now);
  if (match.guild_a_id && match.guild_b_id) {
    const settled = new Set((await client.query<{ battle_number: number }>(
      "SELECT battle_number FROM guild_war_battle_results WHERE match_id = $1", [match.id],
    )).rows.map(({ battle_number }) => battle_number));
    for (let number = 1; number <= 8; number += 1) {
      const { endsAt } = getGuildWarBattleSchedule(weekStart, number);
      if (endsAt > now.getTime()) return;
      if (!settled.has(number)) await settleTeamBattle(client, match, number, endsAt);
    }
  } else if (getGuildWarBattleSchedule(weekStart, 8).endsAt > now.getTime()) {
    return;
  }
  const winner = getGuildWarWinner(
    { id: match.guild_a_id, wins: match.mass_battle_wins_a, damage: Number(match.damage_a) },
    { id: match.guild_b_id, wins: match.mass_battle_wins_b, damage: Number(match.damage_b) },
  );
  const fought = match.mass_battle_wins_a + match.mass_battle_wins_b + Number(match.damage_a) + Number(match.damage_b) > 0;
  if (match.guild_a_id && match.guild_b_id && fought) {
    await awardWarSide(client, match.id, match.guild_a_id, match.guild_b_id, winner === match.guild_a_id, match.mass_battle_wins_a);
    await awardWarSide(client, match.id, match.guild_b_id, match.guild_a_id, winner === match.guild_b_id, match.mass_battle_wins_b);
  }
  await client.query("UPDATE guild_war_matches SET settled_at = $2, winner_guild_id = $3 WHERE id = $1", [match.id, now, winner]);
}

export async function getGuildWarHistory(client: PoolClient, guildId: string): Promise<GuildWarHistoryView[]> {
  const result = await client.query<{
    week_start: string; opponent: string | null; own_wins: number; opponent_wins: number; winner: string | null;
  }>(
    `SELECT week_start::text, CASE WHEN guild_a_id = $1 THEN guild_b_name ELSE guild_a_name END AS opponent,
            CASE WHEN guild_a_id = $1 THEN mass_battle_wins_a ELSE mass_battle_wins_b END AS own_wins,
            CASE WHEN guild_a_id = $1 THEN mass_battle_wins_b ELSE mass_battle_wins_a END AS opponent_wins,
            winner_guild_id AS winner
     FROM guild_war_matches WHERE settled_at IS NOT NULL AND $1 IN (guild_a_id, guild_b_id)
       AND guild_b_name IS NOT NULL ORDER BY week_start DESC LIMIT 12`,
    [guildId],
  );
  return result.rows.map(({ week_start, opponent, own_wins, opponent_wins, winner }) => ({
    weekStartsAt: new Date(week_start).toISOString(), opponentName: opponent ?? "",
    ownWins: own_wins, opponentWins: opponent_wins, outcome: winner === null ? "draw" : winner === guildId ? "win" : "loss",
  }));
}
