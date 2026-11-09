import { randomUUID } from "node:crypto";
import {
  calculateDuelDamage,
  getElementMultiplier,
  getInitialTournamentRating,
  getMatchmakingRange,
  getNextTournamentSchedule,
  getTournamentLeague,
  getTournamentPrize,
  getTournamentBuffOptions,
  resolveTournamentTimeout,
  getTournamentStartingHp,
  TOURNAMENT_LEAGUES,
  TOURNAMENT_RULES,
  createTournamentBracket,
  getReadyTournamentMatches,
  advanceTournamentCardCycle,
  type TournamentCardCycle,
  useTournamentCard,
} from "@cardastika/game-core";
import { TOURNAMENT_CHAT_MAX_LENGTH } from "@cardastika/shared";
import type {
  DuelCardSnapshot,
  DuelExchange,
  DuelSideSnapshot,
  TournamentLeague,
  TournamentChatMessage,
  TournamentChatView,
  TournamentLobbyView,
  TournamentRunView,
  TournamentRegularLeague,
  TournamentMatchResult,
} from "@cardastika/shared";
import type { Pool, PoolClient } from "pg";
import { PlayerPersistenceError, type PlayerRepository } from "../users/playerRepository.js";
import { createBotOpponentSnapshot } from "../duel/botOpponent.js";
import { loadBotCardTemplates, loadDuelParticipant } from "../duel/duelService.js";

const PRIZE_CATEGORIES = [
  { label: "1 місце", result: { placement: 1 } }, { label: "2 місце", result: { placement: 2 } },
  { label: "3 місце", result: { placement: 3 } }, { label: "4 місце", result: { placement: 4 } },
  { label: "1/4", result: { eliminatedWith: 8 } }, { label: "1/8", result: { eliminatedWith: 16 } },
  { label: "1/16", result: { eliminatedWith: 32 } }, { label: "1/32", result: { eliminatedWith: 64 } },
  { label: "1/64 і раніше", result: { eliminatedWith: 128 } }, { label: "Відбір", result: { qualifier: true } },
] as const;

interface StoredMatch {
  id: string;
  round: number;
  playerId: string;
  opponentId: string;
  playerDeck: DuelCardSnapshot[];
  opponent: DuelSideSnapshot;
  playerCycle: TournamentCardCycle<DuelCardSnapshot>;
  opponentCycle: TournamentCardCycle<DuelCardSnapshot>;
  playerHp: number;
  playerMaxHp: number;
  opponentHp: number;
  opponentMaxHp: number;
  playerDamage: number;
  opponentDamage: number;
  log: DuelExchange[];
  /** Amulet and doll fire once per match. */
  playerArtifactState?: { reviveUsed: boolean; voodooUsed: boolean };
}

type StoredRun = Omit<TournamentRunView, "match" | "bracket" | "player"> & {
  bracket: TournamentRunView["bracket"];
  entrants: { id: string; deck: DuelCardSnapshot[]; side: DuelSideSnapshot }[];
  results: Record<string, TournamentMatchResult>;
  finishedMatchIds: string[];
  placement?: number;
  prize?: TournamentRunView["prize"];
  match: StoredMatch | null;
  coreBracket: ReturnType<typeof createTournamentBracket>;
  goldAvailable: number;
  buffOptions?: TournamentRunView["buffOptions"];
};

interface TournamentPlayerRow { duel_rating: number; arena_rating: number; has_master_cup?: boolean; }

interface TournamentChatRow { id: string; author: string; body: string; created_at: Date | string; }

const TOURNAMENT_CHAT_COOLDOWN_MS = 2_000;

function shuffled<T>(values: readonly T[]): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

function activeThree(cycle: TournamentCardCycle<DuelCardSnapshot>): [DuelCardSnapshot, DuelCardSnapshot, DuelCardSnapshot] {
  return [cycle.active[0], cycle.active[1], cycle.active[2]];
}

function rotateExhaustedBotCycle(cycle: TournamentCardCycle<DuelCardSnapshot>): TournamentCardCycle<DuelCardSnapshot> {
  const active: [DuelCardSnapshot, DuelCardSnapshot, DuelCardSnapshot] = [...cycle.active];
  const reserve = [...cycle.reserve];
  for (let slot = 0; slot < 3; slot += 1) {
    if (!cycle.used[slot]) continue;
    if (!reserve.length) throw new TournamentActionError("Bot deck has no replacement cards");
    const next = reserve.shift()!;
    reserve.push(active[slot]!);
    active[slot as 0 | 1 | 2] = next;
  }
  return { ...cycle, cycle: cycle.cycle + 1, active, reserve, used: [false, false, false] };
}

function viewOf(state: StoredRun): TournamentRunView {
  const match = state.match;
  const player = state.entrants.find(entry => !entry.id.startsWith("bot:"))!;
  const final = state.results["upper-3-0"] ?? state.results.final;
  const bronze = state.results.bronze;
  const standings = final && bronze
    ? [final.winnerId, final.loserId, bronze.winnerId, bronze.loserId].map((id, index) => ({
        place: (index + 1) as 1 | 2 | 3 | 4,
        participant: state.entrants.find(entry => entry.id === id)!.side,
      }))
    : undefined;
  return {
    id: state.id,
    status: state.status,
    league: state.league,
    round: state.round,
    playerDeck: state.playerDeck,
    player: player.side,
    match: match ? {
      id: match.id,
      opponent: { ...match.opponent, id: match.opponentId },
      playerCards: activeThree(match.playerCycle),
      opponentCards: activeThree(match.opponentCycle),
      pairMultipliers: [
        getElementMultiplier(match.playerCycle.active[0].element, match.opponentCycle.active[0].element),
        getElementMultiplier(match.playerCycle.active[1].element, match.opponentCycle.active[1].element),
        getElementMultiplier(match.playerCycle.active[2].element, match.opponentCycle.active[2].element),
      ],
      playerUsedSlots: [...match.playerCycle.used],
      playerCycleEndsAt: match.playerCycle.startedAt + (match.playerCycle.cycle + 1) * TOURNAMENT_RULES.cycleMs,
      playerHp: match.playerHp,
      playerMaxHp: match.playerMaxHp,
      opponentHp: match.opponentHp,
      opponentMaxHp: match.opponentMaxHp,
      log: match.log,
    } : null,
    bracket: state.bracket,
    lastExchange: state.lastExchange,
    ...(standings ? { standings } : {}),
    ...(state.placement === undefined ? {} : { placement: state.placement }),
    ...(state.prize ? { prize: state.prize } : {}),
    ...(state.status === "buff_selection" ? { buffOptions: state.buffOptions, buffCost: process.env.NODE_ENV === "production" ? TOURNAMENT_RULES.buffGold : 0, goldAvailable: state.goldAvailable, buffTestMode: process.env.NODE_ENV !== "production" } : {}),
  };
}

function participantLabel(state: StoredRun, id: string) {
  const entrant = state.entrants.find(entry => entry.id === id);
  return entrant ? entrant.id.startsWith("bot:") ? entrant.side.name : "Ти" : id;
}

function startMatch(state: StoredRun, ready: ReturnType<typeof getReadyTournamentMatches>[number], playerId: string) {
  if (!ready.playerIds.includes(playerId)) throw new TournamentActionError("Player is not in the ready match");
  const opponentId = ready.playerIds[0] === playerId ? ready.playerIds[1] : ready.playerIds[0];
  const player = state.entrants.find(entry => entry.id === playerId)!;
  const opponent = state.entrants.find(entry => entry.id === opponentId)!;
  const now = Date.now();
  const playerStartingHp = getTournamentStartingHp(player.deck, { hpPercent: player.side.modifiers.battleHpPct });
  const opponentStartingHp = getTournamentStartingHp(opponent.deck);
  state.match = {
    id: ready.match.id,
    round: ready.match.round,
    playerId,
    opponentId,
    playerDeck: player.deck,
    opponent: opponent.side,
    playerCycle: { startedAt: now, cycle: 0, active: [player.deck[0]!, player.deck[1]!, player.deck[2]!], reserve: player.deck.slice(3), used: [false, false, false], changes: 0 },
    opponentCycle: { startedAt: now, cycle: 0, active: [opponent.deck[0]!, opponent.deck[1]!, opponent.deck[2]!], reserve: opponent.deck.slice(3), used: [false, false, false], changes: 0 },
    playerHp: playerStartingHp,
    playerMaxHp: playerStartingHp,
    opponentHp: opponentStartingHp,
    opponentMaxHp: opponentStartingHp,
    playerDamage: 0,
    opponentDamage: 0,
    log: [],
  };
  const [first, second] = getTournamentBuffOptions(player.deck, opponent.deck);
  state.buffOptions = [first, second];
  state.round = ready.match.round;
  state.status = "buff_selection";
}

function playBotMatch(
  ready: ReturnType<typeof getReadyTournamentMatches>[number],
  entrants: StoredRun["entrants"],
): TournamentMatchResult {
  const a = entrants.find(entry => entry.id === ready.playerIds[0])!;
  const b = entrants.find(entry => entry.id === ready.playerIds[1])!;
  // Simulate equal lane attacks from the persisted, real catalogue decks.
  let aHp = getTournamentStartingHp(a.deck);
  let bHp = getTournamentStartingHp(b.deck);
  for (let cycle = 0; cycle < Math.floor(TOURNAMENT_RULES.roundMs / TOURNAMENT_RULES.cycleMs) && aHp > 0 && bHp > 0; cycle += 1) {
    for (let slot = 0; slot < 3 && aHp > 0 && bHp > 0; slot += 1) {
      const cardA = a.deck[(cycle * 3 + slot) % a.deck.length]!;
      const cardB = b.deck[(cycle * 3 + slot) % b.deck.length]!;
      const hitA = calculateDuelDamage({ attackerFinalPower: cardA.finalPower, attackerElement: cardA.element, defenderElement: cardB.element, battleDamagePct: 0, attackerElementDamagePct: 0 });
      const hitB = calculateDuelDamage({ attackerFinalPower: cardB.finalPower, attackerElement: cardB.element, defenderElement: cardA.element, battleDamagePct: 0, attackerElementDamagePct: 0 });
      aHp = Math.max(0, aHp - hitB.damage);
      bHp = Math.max(0, bHp - hitA.damage);
    }
  }
  const aStartingHp = getTournamentStartingHp(a.deck);
  const bStartingHp = getTournamentStartingHp(b.deck);
  const winnerSide = aHp === 0 && bHp > 0 ? 0 : bHp === 0 && aHp > 0 ? 1 : resolveTournamentTimeout(
    { damage: aStartingHp - aHp, startingHp: aStartingHp },
    { damage: bStartingHp - bHp, startingHp: bStartingHp },
    `${ready.match.id}:${a.id}:${b.id}`,
  );
  const winnerId = winnerSide === 0 ? a.id : b.id;
  return { winnerId, loserId: winnerId === a.id ? b.id : a.id };
}

function settleReadyBotMatches(state: StoredRun, playerId: string) {
  for (let pass = 0; pass < state.bracket.length; pass += 1) {
    const ready = getReadyTournamentMatches(state.coreBracket, state.results);
    const humanMatch = ready.find(({ playerIds }) => playerIds.includes(playerId));
    const botMatch = ready.find(({ playerIds }) => !playerIds.includes(playerId));
    if (botMatch) {
      state.results[botMatch.match.id] = playBotMatch(botMatch, state.entrants);
      if (!state.finishedMatchIds.includes(botMatch.match.id)) state.finishedMatchIds.push(botMatch.match.id);
      continue;
    }
    if (humanMatch) return humanMatch;
    if (!ready.length) break;
  }
  return null;
}

function finalizeIfComplete(state: StoredRun, playerId: string) {
  const winner = state.results["upper-3-0"]?.winnerId ?? state.results["final"]?.winnerId;
  const finalMatch = state.results["upper-3-0"] ?? state.results["final"];
  if (!winner || !finalMatch) return;
  const bronze = state.results["bronze"];
  let placement: number | undefined;
  if (winner === playerId) placement = 1;
  else if (finalMatch.loserId === playerId) placement = 2;
  else if (bronze?.winnerId === playerId) placement = 3;
  else if (bronze?.loserId === playerId) placement = 4;
  if (placement) {
    state.status = "finished";
    state.placement = placement;
    state.prize = getTournamentPrize(state.league, { placement: placement as 1 | 2 | 3 | 4 });
    state.match = null;
  }
}

/** Read-only lobby until a run is started; active state is persisted for reloads. */
export class TournamentService {
  constructor(private readonly pool: Pool, private readonly truce = false) {}

  async getLobby(playerId: string, now = new Date()): Promise<TournamentLobbyView> {
    try {
      const result = await this.pool.query<TournamentPlayerRow>("SELECT duel_rating, arena_rating, FALSE AS has_master_cup FROM players WHERE id = $1", [playerId]);
      const row = result.rows[0];
      if (!row) throw new Error("Tournament player is missing");
      const rating = getInitialTournamentRating(row.duel_rating, row.arena_rating);
      const league = getTournamentLeague({ rating, hasMasterCup: false });
      return {
        eligible: row.duel_rating >= TOURNAMENT_RULES.requiredDuelRating,
        requiredDuelRating: TOURNAMENT_RULES.requiredDuelRating,
        duelRating: row.duel_rating,
        rating,
        ratingProvisional: true,
        league,
        leagueName: TOURNAMENT_LEAGUES[league].name,
        schedule: getNextTournamentSchedule(league, now, this.truce),
        prizes: PRIZE_CATEGORIES.map(({ label, result }) => ({ label, prize: getTournamentPrize(league, result) })),
        leagues: Object.entries(TOURNAMENT_LEAGUES).map(([key, definition]) => ({ league: key as TournamentLeague, ...definition, requiresMasterCup: key === "ruler", weeklyQualification: key === "crown" })),
        registrationAvailable: false,
        rules: {
          registrationMinutes: TOURNAMENT_RULES.registrationMs / 60_000,
          cycleSeconds: TOURNAMENT_RULES.cycleMs / 1000,
          roundSeconds: TOURNAMENT_RULES.roundMs / 1000,
          freeCardChanges: TOURNAMENT_RULES.freeCardChanges,
          hpMultiplier: TOURNAMENT_RULES.hpMultiplier,
          buffGold: TOURNAMENT_RULES.buffGold,
          buffPercent: TOURNAMENT_RULES.buffPercent,
          collectionBuffPercent: TOURNAMENT_RULES.collectionBuffPercent,
        },
      };
    } catch (cause) { throw new PlayerPersistenceError({ cause }); }
  }

  async getRun(playerId: string): Promise<TournamentRunView | null> {
    try {
      const result = await this.pool.query<{ state: StoredRun }>("SELECT state FROM tournament_runs WHERE player_id = $1", [playerId]);
      return result.rows[0] ? viewOf(result.rows[0].state) : null;
    } catch (cause) {
      throw new PlayerPersistenceError({ cause });
    }
  }

  async getChat(): Promise<TournamentChatView> {
    try {
      const result = await this.pool.query<TournamentChatRow>(`
        SELECT id, author, body, created_at
        FROM tournament_chat_messages
        ORDER BY created_at DESC, id DESC
        LIMIT 50
      `);
      return { messages: result.rows.reverse().map(row => ({
        id: row.id,
        author: row.author,
        body: row.body,
        createdAt: new Date(row.created_at).toISOString(),
      })) };
    } catch (cause) {
      throw new PlayerPersistenceError({ cause });
    }
  }

  async sendChatMessage(playerId: string, rawBody: string): Promise<TournamentChatMessage> {
    const body = rawBody.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/gu, " ").trim();
    if (!body) throw new TournamentChatError(400, "empty_message", "Message cannot be empty");
    if (Array.from(body).length > TOURNAMENT_CHAT_MAX_LENGTH) throw new TournamentChatError(400, "message_too_long", "Message is too long");

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`tournament-chat:${playerId}`]);
      const recent = await client.query<{ created_at: Date | string }>(`
        SELECT created_at FROM tournament_chat_messages
        WHERE player_id = $1
        ORDER BY created_at DESC LIMIT 1
      `, [playerId]);
      if (recent.rows[0] && Date.now() - new Date(recent.rows[0].created_at).getTime() < TOURNAMENT_CHAT_COOLDOWN_MS) {
        throw new TournamentChatError(429, "chat_rate_limited", "Wait a moment before sending another message");
      }
      const inserted = await client.query<TournamentChatRow>(`
        INSERT INTO tournament_chat_messages (player_id, author, body)
        SELECT id, LEFT(COALESCE(NULLIF(BTRIM(nickname), ''), NULLIF(BTRIM(username), ''), first_name), 24), $2
        FROM players WHERE id = $1
        RETURNING id, author, body, created_at
      `, [playerId, body]);
      if (!inserted.rows[0]) throw new TournamentChatError(404, "player_missing", "Player not found");
      const row = inserted.rows[0];
      await client.query("COMMIT");
      return { id: row.id, author: row.author, body: row.body, createdAt: new Date(row.created_at).toISOString() };
    } catch (cause) {
      await client.query("ROLLBACK");
      if (cause instanceof TournamentChatError) throw cause;
      throw new PlayerPersistenceError({ cause });
    } finally { client.release(); }
  }

  async enter(playerId: string): Promise<TournamentRunView> {
    if (process.env.NODE_ENV === "production") throw new TournamentActionError("Tournament bot harness is available only on the local development server");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`tournament:${playerId}`]);
      const existing = await client.query<{ state: StoredRun }>("SELECT state FROM tournament_runs WHERE player_id = $1 FOR UPDATE", [playerId]);
      if (existing.rows[0] && !["finished", "eliminated"].includes(existing.rows[0].state.status)) {
        const state = existing.rows[0].state;
        if (state.status === "between_rounds") {
          const ready = settleReadyBotMatches(state, playerId);
          if (ready) startMatch(state, ready, playerId);
          else finalizeIfComplete(state, playerId);
          await this.save(client, playerId, state);
        }
        await client.query("COMMIT");
        return viewOf(state);
      }

      const participant = await loadDuelParticipant(client, playerId, "all_battles");
      const templates = await loadBotCardTemplates(client);
      const ratingRow = await client.query<{ arena_rating: number }>("SELECT arena_rating FROM players WHERE id = $1", [playerId]);
      const league = getTournamentLeague({ rating: getInitialTournamentRating(participant.player.duel_rating, ratingRow.rows[0]?.arena_rating ?? 0), hasMasterCup: false });
      const entrants: StoredRun["entrants"] = [{ id: playerId, deck: participant.snapshot.cards, side: participant.snapshot }];
      const botIds: string[] = [];
      for (let index = 0; index < 7; index += 1) {
        const botId = `bot:${randomUUID()}`;
        const side = createBotOpponentSnapshot(participant.snapshot, getMatchmakingRange(participant.snapshot.effectiveDeckPower, 0), templates, Math.random, botId);
        entrants.push({ id: botId, deck: side.cards, side });
        botIds.push(botId);
      }
      const bracket = createTournamentBracket([playerId, ...botIds], false, Math.random);
      const state: StoredRun = {
        id: randomUUID(), status: "between_rounds", league, round: 1,
        playerDeck: participant.snapshot.cards, match: null,
        bracket: bracket.map(match => ({
          id: match.id, round: match.round,
          participants: match.sides.map(source => source.kind === "player"
            ? source.playerId === playerId ? "Ти" : entrants.find(entry => entry.id === source.playerId)?.side.name ?? source.playerId
            : `Переможець ${source.matchId}`) as [string, string],
          winner: null,
        })),
        lastExchange: null, entrants, results: {}, finishedMatchIds: [], coreBracket: bracket, goldAvailable: Number(participant.player.gold),
      };
      const ready = settleReadyBotMatches(state, playerId);
      if (ready) startMatch(state, ready, playerId);
      await this.save(client, playerId, state);
      await client.query("COMMIT");
      return viewOf(state);
    } catch (cause) {
      await client.query("ROLLBACK");
      if (cause instanceof PlayerPersistenceError) throw cause;
      if (cause instanceof TournamentActionError) throw cause;
      if (cause instanceof Error && cause.name === "DuelDeckInvalidError") throw new TournamentDeckError();
      throw new PlayerPersistenceError({ cause });
    } finally { client.release(); }
  }

  async action(playerId: string, action: { type: "buff"; matchId: string; element: string } | { type: "attack"; matchId: string; slotIndex: number }): Promise<TournamentRunView> {
    if (action.type === "attack" && ![0, 1, 2].includes(action.slotIndex)) throw new TournamentActionError("Invalid tournament card slot");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`tournament:${playerId}`]);
      const record = await client.query<{ state: StoredRun }>("SELECT state FROM tournament_runs WHERE player_id = $1 FOR UPDATE", [playerId]);
      const state = record.rows[0]?.state;
      const match = state?.match;
      if (!state || !match) throw new TournamentRunMissingError();
      if (!match || match.id !== action.matchId) throw new TournamentActionError("Tournament match is no longer active");
      if (state.status === "buff_selection") {
        if (action.type !== "buff" || !state.buffOptions?.some(option => option.element === action.element)) throw new TournamentActionError("Choose one of the offered tournament buffs");
        const buffCost = process.env.NODE_ENV === "production" ? TOURNAMENT_RULES.buffGold : 0;
        if (state.goldAvailable < buffCost) throw new TournamentActionError("Not enough gold for the tournament buff");
        const paid = buffCost
          ? await client.query<{ gold: number }>("UPDATE players SET gold = gold - $2, updated_at = NOW() WHERE id = $1 AND gold >= $2 RETURNING gold", [playerId, buffCost])
          : { rows: [{ gold: state.goldAvailable }] };
        if (!paid.rows[0]) throw new TournamentActionError("Not enough gold for the tournament buff");
        const entrant = state.entrants.find(entry => entry.id === playerId)!;
        const boosted = match.playerDeck.map(card => card.element === action.element ? { ...card, finalPower: Math.round(card.finalPower * (100 + TOURNAMENT_RULES.buffPercent) / 100) } : card);
        match.playerDeck = boosted;
        match.playerCycle.active = [boosted[0]!, boosted[1]!, boosted[2]!];
        match.playerCycle.reserve = boosted.slice(3);
        match.playerMaxHp = getTournamentStartingHp(boosted, { hpPercent: entrant.side.modifiers.battleHpPct });
        match.playerHp = match.playerMaxHp;
        state.goldAvailable = paid.rows[0].gold;
        state.buffOptions = undefined;
        state.status = "battle";
        await this.save(client, playerId, state);
        await client.query("COMMIT");
        return viewOf(state);
      }
      if (state.status !== "battle") throw new TournamentActionError("Choose a tournament buff before attacking");

      const now = new Date();
      if (now.getTime() - match.playerCycle.startedAt >= TOURNAMENT_RULES.roundMs) {
        const winnerSide = resolveTournamentTimeout(
          { damage: match.playerDamage, startingHp: match.playerMaxHp },
          { damage: match.opponentDamage, startingHp: match.opponentMaxHp },
          `${match.id}:${playerId}:${match.opponentId}`,
        );
        const result = winnerSide === 0
          ? { winnerId: playerId, loserId: match.opponentId }
          : { winnerId: match.opponentId, loserId: playerId };
        state.results[match.id] = result;
        if (!state.finishedMatchIds.includes(match.id)) state.finishedMatchIds.push(match.id);
        state.match = null;
        const next = settleReadyBotMatches(state, playerId);
        if (next) { state.status = "between_rounds"; state.round = next.match.round; }
        else { finalizeIfComplete(state, playerId); if (!state.placement && result.loserId === playerId) { state.status = "eliminated"; state.prize = getTournamentPrize(state.league, { eliminatedWith: Math.min(128, 8 * 2 ** (match.round - 1)) }); } }
        await this.save(client, playerId, state);
        await client.query("COMMIT");
        return viewOf(state);
      }
      const slotIndex = action.type === "attack" ? action.slotIndex : -1;
      if (action.type !== "attack") throw new TournamentActionError("Buff selection is already closed");
      const [playerCardResult, playerCycleResult] = [match.playerCycle.active[slotIndex as 0 | 1 | 2], useTournamentCard(match.playerCycle, slotIndex as 0 | 1 | 2, now)];
      const elapsedBotCycle = Math.floor((now.getTime() - match.opponentCycle.startedAt) / TOURNAMENT_RULES.cycleMs);
      if (elapsedBotCycle > match.opponentCycle.cycle) {
        match.opponentCycle = advanceTournamentCardCycle(match.opponentCycle, now);
      }
      // The bot strikes once for every player action, so it can use all three
      // lanes before the player's nine-second cycle expires. Give the bot a
      // fresh cycle in that case instead of rejecting the player's next move.
      if (match.opponentCycle.used.every(Boolean)) {
        match.opponentCycle = rotateExhaustedBotCycle(match.opponentCycle);
      }
      const usedOpponent = match.opponentCycle.used;
      const candidateSlots = ([0, 1, 2] as const).filter(slot => !usedOpponent[slot]);
      const opponentSlot = candidateSlots.reduce((best, candidate) => {
        const card = match.opponentCycle.active[candidate]!;
        const estimate = calculateDuelDamage({ attackerFinalPower: card.finalPower, attackerElement: card.element, defenderElement: playerCardResult.element, battleDamagePct: 0, attackerElementDamagePct: 0 }).damage;
        const bestCard = match.opponentCycle.active[best]!;
        const bestEstimate = calculateDuelDamage({ attackerFinalPower: bestCard.finalPower, attackerElement: bestCard.element, defenderElement: playerCardResult.element, battleDamagePct: 0, attackerElementDamagePct: 0 }).damage;
        return estimate > bestEstimate ? candidate : best;
      }, candidateSlots[0]!);
      const [opponentCard, opponentCycleResult] = [match.opponentCycle.active[opponentSlot], useTournamentCard(match.opponentCycle, opponentSlot, now)];
      if (!opponentCard) throw new TournamentActionError("Bot card is unavailable");

      const playerModifiers = state.entrants.find(entry => entry.id === playerId)!.side.modifiers;
      const artifacts = playerModifiers.equipment;
      const playerHit = calculateDuelDamage({ attackerFinalPower: playerCardResult.finalPower, attackerElement: playerCardResult.element, defenderElement: opponentCard.element, battleDamagePct: playerModifiers.battleDamagePct, attackerElementDamagePct: playerModifiers.elementDamagePct[playerCardResult.element], attackerEquipment: artifacts });
      const rawOpponentHit = calculateDuelDamage({ attackerFinalPower: opponentCard.finalPower, attackerElement: opponentCard.element, defenderElement: playerCardResult.element, battleDamagePct: 0, attackerElementDamagePct: 0 });
      // Tournament bots carry no artifacts; the player's shield and mirror act on the bot's hit.
      const opponentHit = { ...rawOpponentHit, damage: Math.round(rawOpponentHit.damage * Math.max(0, 1 - (artifacts?.incomingDamageReductionPct ?? 0) / 100)) };
      const reflected = Math.round(opponentCard.finalPower * (artifacts?.damageReflectionPct ?? 0) / 100);
      match.opponentHp = Math.max(0, match.opponentHp - playerHit.damage - reflected);
      match.playerHp = Math.max(0, match.playerHp - opponentHit.damage);
      if (match.playerHp === 0 && artifacts) {
        const artifactState = match.playerArtifactState ?? { reviveUsed: false, voodooUsed: false };
        if (!artifactState.reviveUsed && artifacts.reviveHpPct > 0) {
          match.playerHp = Math.max(1, Math.round(match.playerMaxHp * artifacts.reviveHpPct / 100));
          artifactState.reviveUsed = true;
        } else if (!artifactState.voodooUsed && artifacts.voodooHpReductionPct > 0) {
          match.opponentHp = Math.max(0, match.opponentHp - Math.round(match.opponentMaxHp * artifacts.voodooHpReductionPct / 100));
          artifactState.voodooUsed = true;
        }
        match.playerArtifactState = artifactState;
      }
      match.playerDamage += playerHit.damage;
      match.opponentDamage += opponentHit.damage;
      match.playerCycle = playerCycleResult.state;
      match.opponentCycle = opponentCycleResult.state;

      const exchange: DuelExchange = {
        slotIndex: slotIndex as 0 | 1 | 2,
        turnNumber: match.log.length + 1,
        playerCard: playerCardResult,
        enemyCard: opponentCard,
        playerMultiplier: playerHit.multiplier,
        enemyMultiplier: opponentHit.multiplier,
        playerDamage: playerHit.damage,
        enemyDamage: opponentHit.damage,
        visualState: playerHit.multiplier > opponentHit.multiplier ? "player_strong" : opponentHit.multiplier > playerHit.multiplier ? "enemy_strong" : "neutral",
      };
      state.lastExchange = exchange;
      match.log = [exchange, ...match.log].slice(0, 20);

      const won = match.opponentHp === 0 && match.playerHp > 0;
      const lost = match.playerHp === 0 && match.opponentHp === 0 ? null : match.playerHp === 0;
      if (won || lost) {
        const result = { winnerId: won ? playerId : match.opponentId, loserId: won ? match.opponentId : playerId };
        state.results[match.id] = result;
        if (!state.finishedMatchIds.includes(match.id)) state.finishedMatchIds.push(match.id);
        const bracketRow = state.bracket.find(row => row.id === match.id);
        if (bracketRow) bracketRow.winner = result.winnerId;
        state.match = null;
        const ready = settleReadyBotMatches(state, playerId);
        if (ready) {
          state.status = "between_rounds";
          state.round = ready.match.round;
        } else {
          finalizeIfComplete(state, playerId);
          if (!state.placement) {
            state.status = "eliminated";
            if (result.loserId === playerId) state.prize = getTournamentPrize(state.league, { eliminatedWith: Math.min(128, 8 * 2 ** (match.round - 1)) });
          }
        }
      }

      await this.save(client, playerId, state);
      await client.query("COMMIT");
      return viewOf(state);
    } catch (cause) {
      await client.query("ROLLBACK");
      if (cause instanceof TournamentRunMissingError || cause instanceof TournamentActionError) throw cause;
      if (cause instanceof RangeError) throw new TournamentActionError(cause.message);
      throw new PlayerPersistenceError({ cause });
    } finally { client.release(); }
  }

  private async save(client: PoolClient, playerId: string, state: StoredRun) {
    for (const [id, result] of Object.entries(state.results)) {
      const row = state.bracket.find(match => match.id === id);
      if (row) row.winner = participantLabel(state, result.winnerId);
    }
    await client.query(`
      INSERT INTO tournament_runs (player_id, run_id, state)
      VALUES ($1, $2, $3::jsonb)
      ON CONFLICT (player_id) DO UPDATE SET run_id = EXCLUDED.run_id, state = EXCLUDED.state, updated_at = NOW()
    `, [playerId, state.id, JSON.stringify(state)]);
  }
}

export class TournamentDeckError extends Error { constructor() { super("A valid saved 9-card deck is required"); this.name = "TournamentDeckError"; } }
export class TournamentRunMissingError extends Error { constructor() { super("No active tournament run"); this.name = "TournamentRunMissingError"; } }
export class TournamentActionError extends Error { constructor(message: string) { super(message); this.name = "TournamentActionError"; } }
export class TournamentChatError extends Error {
  constructor(public readonly status: 400 | 404 | 429, public readonly code: string, message: string) {
    super(message);
    this.name = "TournamentChatError";
  }
}
