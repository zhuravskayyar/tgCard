import type { PlayerAchievementProgressResponse } from "@cardastika/shared";
import type { Pool } from "pg";
import type { DeckRepository } from "../decks/deckRepository.js";
import { DeckMissingError } from "../decks/deckRepository.js";
import type { LeaderboardRepository } from "../leaderboards/leaderboardRepository.js";

interface AchievementProgressRow {
  arena_mage_wins: string | number;
  arena_wins: string | number;
  completed_collections: string | number;
  duel_wins: string | number;
  forged_artifacts: string | number;
  forged_items: string | number;
  guild_element_donations: string | number;
  guild_experience: string | number;
  guild_gold: string | number;
  tournament_championships: string | number;
  witch_victories: string | number;
  dragon_victories: string | number;
}

interface AchievementHighWaterRow {
  statistic: string;
  value: string | number;
}

function toSafeNumber(value: string | number, field: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${field} returned by database`);
  return parsed;
}

export class AchievementProgressPersistenceError extends Error {
  constructor(options?: ErrorOptions) {
    super("Achievement progress is unavailable", options);
    this.name = "AchievementProgressPersistenceError";
  }
}

export class AchievementProgressService {
  constructor(
    private readonly pool: Pool,
    private readonly decks: Pick<DeckRepository, "findByPlayerId">,
    private readonly leaderboards: Pick<LeaderboardRepository, "find">,
  ) {}

  async getPlayerProgress(playerId: string): Promise<PlayerAchievementProgressResponse> {
    try {
      const result = await this.pool.query<AchievementProgressRow>(
        `
          SELECT
            players.duel_wins,
            players.arena_wins,
            COALESCE((
              SELECT SUM((participant->>'kills')::numeric)
              FROM arena_matches matches
              CROSS JOIN LATERAL jsonb_array_elements(COALESCE(matches.state->'participants', '[]'::jsonb)) participant
              WHERE matches.status = 'finished' AND participant->>'id' = players.id::text
            ), 0)::numeric AS arena_mage_wins,
            COALESCE((
              SELECT COUNT(*) FROM tournament_entries entries
              INNER JOIN tournament_events events ON events.id = entries.event_id
              WHERE entries.player_id = players.id AND entries.placement = 1 AND events.league = 'master'
            ), 0)::bigint AS tournament_championships,
            COALESCE((
              SELECT SUM(amount) FROM guild_treasury_contributions contributions
              WHERE contributions.player_id = players.id AND contributions.contribution_type = 'gold'
            ), 0)::numeric AS guild_gold,
            COALESCE((
              SELECT SUM(amount) FROM guild_treasury_contributions contributions
              WHERE contributions.player_id = players.id AND contributions.contribution_type = 'card_elements'
            ), 0)::numeric AS guild_element_donations,
            COALESCE((
              SELECT SUM(xp) FROM guild_xp_contributions contributions
              WHERE contributions.player_id = players.id
            ), 0)::bigint AS guild_experience,
            COALESCE((
              SELECT COUNT(*) FROM player_campaign_events events
              WHERE events.player_id = players.id AND events.event_type = 'WITCH_BATTLE_WON'
            ), 0)::bigint AS witch_victories,
            COALESCE((
              SELECT COUNT(*) FROM player_campaign_events events
              WHERE events.player_id = players.id AND events.event_type = 'DRAGON_RAID_WON'
            ), 0)::bigint AS dragon_victories,
            COALESCE((
              SELECT COUNT(*) FROM player_collection_completions completions
              WHERE completions.player_id = players.id
            ), 0)::bigint AS completed_collections,
            COALESCE((
              SELECT SUM((payload->>'count')::numeric) FROM player_campaign_events
              WHERE player_id = players.id AND event_type = 'EQUIPMENT_FORGED' AND payload->>'category' = 'things'
            ), 0)::numeric AS forged_items,
            COALESCE((
              SELECT SUM((payload->>'count')::numeric) FROM player_campaign_events
              WHERE player_id = players.id AND event_type = 'EQUIPMENT_FORGED' AND payload->>'category' = 'artifacts'
            ), 0)::numeric AS forged_artifacts
          FROM players
          WHERE players.id = $1
        `,
        [playerId],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Player was not found while loading achievement progress");

      const [duelLeaderboard, arenaLeaderboard, deck] = await Promise.all([
        this.leaderboards.find("duels", 1, playerId),
        this.leaderboards.find("arena", 1, playerId),
        this.decks.findByPlayerId(playerId).catch((error: unknown) => {
          if (error instanceof DeckMissingError) return null;
          throw error;
        }),
      ]);
      const duelRank = duelLeaderboard.me?.rank ?? null;
      const arenaRank = arenaLeaderboard.me?.rank ?? null;
      // Ranking membership and deck power can fall later. Keep the highest
      // value seen for awards that must stay earned once reached.
      const highWater = await this.pool.query<AchievementHighWaterRow>(
        `INSERT INTO player_achievement_high_water (player_id, statistic, value)
         SELECT $1, observed.statistic, observed.value
         FROM (VALUES
           ('duelTop100', $2::bigint),
           ('duelChampion', $3::bigint),
           ('arenaTop100', $4::bigint),
           ('arenaChampion', $5::bigint),
           ('deckPower', $6::bigint)
         ) AS observed(statistic, value)
         ON CONFLICT (player_id, statistic)
         DO UPDATE SET value = GREATEST(player_achievement_high_water.value, EXCLUDED.value)
         RETURNING statistic, value`,
        [
          playerId,
          duelRank !== null && duelRank <= 100 ? 1 : 0,
          duelRank === 1 ? 1 : 0,
          arenaRank !== null && arenaRank <= 100 ? 1 : 0,
          arenaRank === 1 ? 1 : 0,
          deck?.totalPower ?? 0,
        ],
      );
      const highest = new Map(highWater.rows.map(({ statistic, value }) => [statistic, toSafeNumber(value, statistic)]));

      return {
        statistics: {
          duelWins: toSafeNumber(row.duel_wins, "duel wins"),
          duelTop100: highest.get("duelTop100") ?? 0,
          duelChampion: highest.get("duelChampion") ?? 0,
          arenaWins: toSafeNumber(row.arena_wins, "arena wins"),
          arenaMageWins: toSafeNumber(row.arena_mage_wins, "arena mage defeats"),
          arenaTop100: highest.get("arenaTop100") ?? 0,
          arenaChampion: highest.get("arenaChampion") ?? 0,
          tournamentChampion: toSafeNumber(row.tournament_championships, "tournament championships"),
          urfinBossDamage: null,
          urfinSuperStrikes: null,
          urfinCardRewards: null,
          urfinDamageRank: null,
          guildGold: toSafeNumber(row.guild_gold, "guild gold contributions"),
          guildElementDonations: toSafeNumber(row.guild_element_donations, "guild element contributions"),
          guildDragonHunts: toSafeNumber(row.dragon_victories, "dragon victories"),
          guildWarKeys: null,
          guildWarParticipation: null,
          guildExperience: toSafeNumber(row.guild_experience, "guild experience"),
          witchVictories: toSafeNumber(row.witch_victories, "witch victories"),
          deckPower: highest.get("deckPower") ?? 0,
          completedCollections: toSafeNumber(row.completed_collections, "completed collections"),
          completedChestShops: null,
          marathonWins: null,
          giftsSent: null,
          giftsReceived: null,
          forgedItems: toSafeNumber(row.forged_items, "forged items"),
          forgedArtifacts: toSafeNumber(row.forged_artifacts, "forged artifacts"),
        },
      };
    } catch (error) {
      if (error instanceof AchievementProgressPersistenceError) throw error;
      throw new AchievementProgressPersistenceError({ cause: error });
    }
  }
}
