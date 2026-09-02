import { randomInt, randomUUID } from "node:crypto";
import type { DungeonCompleteResponse, DungeonStartResponse } from "@cardastika/shared";
import type { Pool, PoolClient } from "pg";
import type { GuildActivityRecorder } from "../guild/guildService.js";
import {
  calculateDungeonReward,
  createDungeonBoard,
  DUNGEON_MAX_MOVES,
  evaluateDungeonMoves,
  InvalidDungeonMovesError,
  type StoredDungeonTile,
} from "./dungeonConfig.js";

interface DungeonRunRow {
  board: StoredDungeonTile[];
  card_shards: string | number;
  claimed: boolean;
  id: string;
  matched_pairs: number;
  moves_used: number;
  reward_shards: number;
  stars: number;
  status: "active" | "completed" | "failed";
}

function toNonNegativeInteger(value: string | number, field: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${field}`);
  return parsed;
}

export class DungeonRunMissingError extends Error {
  constructor() {
    super("Dungeon run does not exist");
    this.name = "DungeonRunMissingError";
  }
}

export class DungeonPersistenceError extends Error {
  constructor() {
    super("Dungeon persistence is unavailable");
    this.name = "DungeonPersistenceError";
  }
}

export class DungeonCannotCompleteError extends Error {
  constructor() {
    super("Dungeon run is not complete");
    this.name = "DungeonCannotCompleteError";
  }
}

export class DungeonService {
  constructor(
    private readonly pool: Pick<Pool, "connect" | "query">,
    private readonly guildActivity?: GuildActivityRecorder,
  ) {}

  async start(playerId: string): Promise<DungeonStartResponse> {
    const seed = randomInt(1, 2_147_483_647);
    const board = createDungeonBoard(seed);
    try {
      const result = await this.pool.query<{ card_shards: string | number }>(
        `
          SELECT card_shards
          FROM players
          WHERE id = $1
        `,
        [playerId],
      );
      const player = result.rows[0];
      if (!player) throw new DungeonRunMissingError();
      const run = await this.pool.query<{ id: string }>(
        `
          INSERT INTO player_dungeon_runs (id, player_id, seed, board, status)
          VALUES ($1, $2, $3, $4::jsonb, 'active')
          RETURNING id
        `,
        [randomUUID(), playerId, seed, JSON.stringify(board)],
      );
      const runId = run.rows[0]?.id;
      if (!runId) throw new Error("Dungeon run was not created");
      return {
        runId,
        board,
        maxMoves: DUNGEON_MAX_MOVES,
        matchedPairs: 0,
        movesUsed: 0,
        cardShards: toNonNegativeInteger(player.card_shards, "card shards"),
      };
    } catch (error) {
      if (error instanceof DungeonRunMissingError) throw error;
      throw new DungeonPersistenceError();
    }
  }

  async complete(playerId: string, runId: string, moves: readonly string[]): Promise<DungeonCompleteResponse> {
    let client: PoolClient;
    try {
      client = await this.pool.connect();
    } catch {
      throw new DungeonPersistenceError();
    }

    try {
      await client.query("BEGIN");
      const runResult = await client.query<DungeonRunRow>(
        `
          SELECT
            player_dungeon_runs.id,
            player_dungeon_runs.board,
            player_dungeon_runs.status,
            player_dungeon_runs.moves_used,
            player_dungeon_runs.matched_pairs,
            player_dungeon_runs.reward_shards,
            player_dungeon_runs.stars,
            player_dungeon_runs.claimed,
            players.card_shards
          FROM player_dungeon_runs
          INNER JOIN players ON players.id = player_dungeon_runs.player_id
          WHERE player_dungeon_runs.id = $1 AND player_dungeon_runs.player_id = $2
          FOR UPDATE OF player_dungeon_runs, players
        `,
        [runId, playerId],
      );
      const run = runResult.rows[0];
      if (!run) throw new DungeonRunMissingError();

      if (run.status === "active") {
        let evaluation;
        try {
          evaluation = evaluateDungeonMoves(run.board, moves);
        } catch (error) {
          if (error instanceof InvalidDungeonMovesError) throw error;
          throw new DungeonCannotCompleteError();
        }
        if (evaluation.status === "active") throw new DungeonCannotCompleteError();
        const reward = evaluation.status === "completed" ? calculateDungeonReward(evaluation.movesUsed) : { stars: 0, shards: 0 };
        const updatedRun = await client.query(
          `
            UPDATE player_dungeon_runs
            SET status = $2,
                moves_used = $3,
                matched_pairs = $4,
                reward_shards = $5,
                stars = $6,
                claimed = $7,
                completed_at = NOW()
            WHERE id = $1 AND status = 'active'
          `,
          [runId, evaluation.status, evaluation.movesUsed, evaluation.matchedPairs, reward.shards, reward.stars, evaluation.status === "completed"],
        );
        if (updatedRun.rowCount !== 1) throw new Error("Dungeon run was updated unexpectedly");
        if (evaluation.status === "completed") {
          await this.guildActivity?.recordActivity(client, playerId, "dungeon_complete", `dungeon:${runId}`);
        }
        if (reward.shards > 0) {
          await client.query(
            `UPDATE players SET card_shards = card_shards + $2, updated_at = NOW() WHERE id = $1`,
            [playerId, reward.shards],
          );
        }
        run.status = evaluation.status;
        run.moves_used = evaluation.movesUsed;
        run.matched_pairs = evaluation.matchedPairs;
        run.reward_shards = reward.shards;
        run.stars = reward.stars;
        run.claimed = reward.shards > 0;
      }

      const balance = await client.query<{ card_shards: string | number }>(
        "SELECT card_shards FROM players WHERE id = $1",
        [playerId],
      );
      const cardShards = toNonNegativeInteger(balance.rows[0]?.card_shards ?? run.card_shards, "card shards");
      await client.query("COMMIT");
      return {
        runId,
        success: run.status === "completed",
        status: run.status,
        stars: run.stars,
        shardsEarned: run.reward_shards,
        cardShards,
        movesUsed: run.moves_used,
        matchedPairs: run.matched_pairs,
        maxMoves: DUNGEON_MAX_MOVES,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (
        error instanceof DungeonRunMissingError ||
        error instanceof DungeonCannotCompleteError ||
        error instanceof InvalidDungeonMovesError
      ) throw error;
      throw new DungeonPersistenceError();
    } finally {
      client.release();
    }
  }
}
