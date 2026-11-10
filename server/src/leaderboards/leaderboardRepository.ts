import { getCardPower, getDominantDeckElement, getRarityForLevel } from "@cardastika/game-core";
import { ARENA_LEAGUE_CONFIG, ARENA_START_RATING, getLeagueByRating, getPlayerDisplayName, LEADERBOARD_REQUIRED_DUEL_WINS, type LeaderboardEntry, type LeaderboardKind, type PublicPlayerProfile } from "@cardastika/shared";
import type { Pool } from "pg";
import { toPublicPlayerEquipment } from "../equipment/equipmentState.js";

export const LEADERBOARD_PAGE_SIZE = 10;

interface DuelLeaderboardRow {
  duel_rating: string | number;
  first_name: string;
  id: string;
  level: number;
  nickname: string | null;
  photo_url: string | null;
  username: string | null;
}

interface DeckLeaderboardRow extends DuelLeaderboardRow {
  bonus_power: string | number | null;
  instance_level: string | number | null;
}

interface PlayerAccumulator {
  displayName: string;
  id: string;
  level: number;
  photoUrl: string | null;
  score: number;
}

interface PublicProfileRow {
  art_key: string | null;
  bonus_power: string | number | null;
  card_id: string | null;
  card_display_name: string | null;
  card_element: "fire" | "water" | "air" | "earth" | null;
  duel_highest_league_index: string | number;
  duel_rating: string | number;
  duel_wins: string | number;
  equipment: unknown;
  first_name: string;
  id: string;
  instance_id: string | null;
  instance_level: string | number | null;
  level: number;
  nickname: string | null;
  photo_url: string | null;
  username: string | null;
}

export interface LeaderboardPage {
  entries: LeaderboardEntry[];
  leagueIndex: number | null;
  me: LeaderboardEntry | null;
  page: number;
  pageSize: number;
  totalEntries: number;
}

interface ArenaLeaderboardRow extends Omit<DuelLeaderboardRow, "duel_rating"> {
  arena_rating: string | number;
}

function toSafeInteger(value: string | number, field: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${field} returned by database`);
  return parsed;
}

function getDisplayName(nickname: string | null, username: string | null, firstName: string) {
  return getPlayerDisplayName({ firstName, nickname, username });
}

function toEntry(row: PlayerAccumulator, index: number, offset: number): LeaderboardEntry {
  return {
    displayName: row.displayName,
    id: row.id,
    level: row.level,
    photoUrl: row.photoUrl,
    rank: offset + index + 1,
    score: row.score,
  };
}

export class LeaderboardPersistenceError extends Error {
  constructor(options?: ErrorOptions) {
    super("Leaderboard persistence is unavailable", options);
    this.name = "LeaderboardPersistenceError";
  }
}

function normalizePage(page: number) {
  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
}

function paginate(entries: PlayerAccumulator[], page: number, viewerId: string, leagueIndex: number | null = null): LeaderboardPage {
  const safePage = normalizePage(page);
  const offset = (safePage - 1) * LEADERBOARD_PAGE_SIZE;
  const viewerIndex = entries.findIndex(({ id }) => id === viewerId);
  return {
    entries: entries
      .slice(offset, offset + LEADERBOARD_PAGE_SIZE)
      .map((entry, index) => toEntry(entry, index, offset)),
    leagueIndex,
    me: viewerIndex >= 0 ? toEntry(entries[viewerIndex]!, viewerIndex, 0) : null,
    page: safePage,
    pageSize: LEADERBOARD_PAGE_SIZE,
    totalEntries: entries.length,
  };
}

export class LeaderboardRepository {
  constructor(private readonly pool: Pool) {}

  async find(kind: LeaderboardKind, page: number, viewerId: string): Promise<LeaderboardPage> {
    try {
      if (kind === "duels") return await this.findDuelLeaderboard(page, viewerId);
      if (kind === "arena") return await this.findArenaLeaderboard(page, viewerId);
      return await this.findDeckLeaderboard(page, viewerId);
    } catch (error) {
      if (error instanceof LeaderboardPersistenceError) throw error;
      throw new LeaderboardPersistenceError({ cause: error });
    }
  }

  async findPublicProfile(playerId: string): Promise<PublicPlayerProfile | null> {
    try {
      const result = await this.pool.query<PublicProfileRow>(
        `
          SELECT
            players.id,
            players.nickname,
            players.username,
            players.first_name,
            players.photo_url,
            players.level,
            players.duel_wins,
            players.duel_rating,
            players.duel_highest_league_index,
            players.equipment,
            cards.display_name AS card_display_name,
            cards.art_key,
            cards.id AS card_id,
            cards.element AS card_element,
            player_card_instances.id AS instance_id,
            player_card_instances.level AS instance_level,
            player_card_instances.bonus_power
          FROM players
          LEFT JOIN player_decks ON player_decks.player_id = players.id
          LEFT JOIN deck_slots ON deck_slots.deck_id = player_decks.id
          LEFT JOIN player_card_instances ON player_card_instances.id = deck_slots.card_instance_id
          LEFT JOIN cards ON cards.id = player_card_instances.card_id
          WHERE players.id = $1
          ORDER BY deck_slots.slot
        `,
        [playerId],
      );
      const first = result.rows[0];
      if (!first) return null;
      const deckPower = result.rows.reduce((total, row) => {
        if (row.instance_level === null || row.bonus_power === null) return total;
        return total + getCardPower({
          level: toSafeInteger(row.instance_level, "card level"),
          bonusPower: toSafeInteger(row.bonus_power, "card bonus power"),
        });
      }, 0);
      const strongestCards = result.rows
        .filter((row) => row.card_id !== null && row.instance_id !== null && row.card_element !== null && row.instance_level !== null && row.bonus_power !== null)
        .map((row) => {
          const level = toSafeInteger(row.instance_level!, "card level");
          const bonusPower = toSafeInteger(row.bonus_power!, "card bonus power");
          return {
            artKey: row.art_key,
            cardId: row.card_id!,
            displayName: row.card_display_name,
            element: row.card_element!,
            finalPower: getCardPower({ level, bonusPower }),
            instanceId: row.instance_id!,
            level,
            rarity: getRarityForLevel(level),
          };
        })
        .sort((left, right) => right.finalPower - left.finalPower || left.instanceId.localeCompare(right.instanceId))
        .slice(0, 3);
      const mageElement = getDominantDeckElement(
        result.rows.flatMap(({ card_element }) => card_element ? [{ element: card_element }] : []),
      ) ?? "fire";
      return {
        deckPower,
        displayName: getDisplayName(first.nickname, first.username, first.first_name),
        duelHighestLeagueIndex: toSafeInteger(first.duel_highest_league_index, "duel highest league index"),
        duelRating: toSafeInteger(first.duel_rating, "duel rating"),
        duelWins: toSafeInteger(first.duel_wins, "duel wins"),
        equipment: toPublicPlayerEquipment(first.id, first.equipment),
        id: first.id,
        level: first.level,
        mageElement,
        photoUrl: first.photo_url,
        strongestCards,
      };
    } catch (error) {
      throw new LeaderboardPersistenceError({ cause: error });
    }
  }

  // Duels and arena list the viewer's own league, like the reference; deck power is one global table.
  private async findDuelLeaderboard(page: number, viewerId: string): Promise<LeaderboardPage> {
    const viewer = await this.pool.query<{ duel_rating: string | number }>("SELECT duel_rating FROM players WHERE id = $1", [viewerId]);
    const league = getLeagueByRating(toSafeInteger(viewer.rows[0]?.duel_rating ?? 0, "duel rating"));
    const result = await this.pool.query<DuelLeaderboardRow>(
      `
        SELECT id, nickname, username, first_name, photo_url, level, duel_rating
        FROM players
        WHERE duel_wins >= $1 AND duel_rating >= $2 AND ($3::integer IS NULL OR duel_rating <= $3)
        ORDER BY duel_rating DESC, duel_wins DESC, id ASC
      `,
      [LEADERBOARD_REQUIRED_DUEL_WINS, league.minRating, league.maxRating],
    );
    return paginate(result.rows.map((row) => ({
      displayName: getDisplayName(row.nickname, row.username, row.first_name),
      id: row.id,
      level: row.level,
      photoUrl: row.photo_url,
      score: toSafeInteger(row.duel_rating, "duel rating"),
    })), page, viewerId, league.index);
  }

  private async findArenaLeaderboard(page: number, viewerId: string): Promise<LeaderboardPage> {
    const viewer = await this.pool.query<{ arena_league_index: string | number }>("SELECT arena_league_index FROM players WHERE id = $1", [viewerId]);
    const leagueIndex = toSafeInteger(viewer.rows[0]?.arena_league_index ?? getLeagueByRating(ARENA_START_RATING, ARENA_LEAGUE_CONFIG).index, "arena league");
    const result = await this.pool.query<ArenaLeaderboardRow>(
      `
        SELECT id, nickname, username, first_name, photo_url, level, arena_rating
        FROM players
        WHERE arena_league_index = $1 AND (arena_wins > 0 OR arena_rating <> $2)
          -- As in the reference, players without an arena fight in the last day leave the list.
          AND EXISTS (SELECT 1 FROM arena_match_players mp WHERE mp.player_id = players.id AND mp.joined_at > NOW() - INTERVAL '1 day')
        ORDER BY arena_rating DESC, arena_wins DESC, id ASC
      `,
      [leagueIndex, ARENA_START_RATING],
    );
    return paginate(result.rows.map((row) => ({
      displayName: getDisplayName(row.nickname, row.username, row.first_name),
      id: row.id,
      level: row.level,
      photoUrl: row.photo_url,
      score: toSafeInteger(row.arena_rating, "arena rating"),
    })), page, viewerId, leagueIndex);
  }

  private async findDeckLeaderboard(page: number, viewerId: string): Promise<LeaderboardPage> {
    const result = await this.pool.query<DeckLeaderboardRow>(
      `
        SELECT
          players.id,
          players.nickname,
          players.username,
          players.first_name,
          players.photo_url,
          players.level,
          players.rating,
          player_card_instances.level AS instance_level,
          player_card_instances.bonus_power
        FROM players
        LEFT JOIN player_decks ON player_decks.player_id = players.id
        LEFT JOIN deck_slots ON deck_slots.deck_id = player_decks.id
        LEFT JOIN player_card_instances ON player_card_instances.id = deck_slots.card_instance_id
        ORDER BY players.id, deck_slots.slot
      `,
    );
    const players = new Map<string, PlayerAccumulator>();

    for (const row of result.rows) {
      const entry = players.get(row.id) ?? {
        displayName: getDisplayName(row.nickname, row.username, row.first_name),
        id: row.id,
        level: row.level,
        photoUrl: row.photo_url,
        score: 0,
      };
      if (row.instance_level !== null && row.bonus_power !== null) {
        entry.score += getCardPower({
          level: toSafeInteger(row.instance_level, "card level"),
          bonusPower: toSafeInteger(row.bonus_power, "card bonus power"),
        });
      }
      players.set(row.id, entry);
    }

    return paginate(
      [...players.values()].sort((left, right) => right.score - left.score || left.id.localeCompare(right.id)),
      page,
      viewerId,
    );
  }
}
