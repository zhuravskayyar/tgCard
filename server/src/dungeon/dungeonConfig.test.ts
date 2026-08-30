import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateDungeonReward,
  createDungeonBoard,
  evaluateDungeonMoves,
  InvalidDungeonMovesError,
} from "./dungeonConfig.js";

test("dungeon board contains eight shuffled pairs and a perfect run earns three stars", () => {
  const board = createDungeonBoard(42);
  assert.equal(board.length, 16);
  assert.equal(new Set(board.map((tile) => tile.id)).size, 16);
  assert.deepEqual(
    [...new Set(board.map((tile) => tile.pairId))].map((pairId) => board.filter((tile) => tile.pairId === pairId).length),
    Array(8).fill(2),
  );

  const moves = [...new Map(board.map((tile) => [tile.pairId, [] as string[]])).entries()]
    .flatMap(([pairId]) => board.filter((tile) => tile.pairId === pairId).map((tile) => tile.id));
  const evaluation = evaluateDungeonMoves(board, moves);
  assert.deepEqual(evaluation, { matchedPairs: 8, movesUsed: 8, status: "completed" });
  assert.deepEqual(calculateDungeonReward(evaluation.movesUsed), { stars: 3, shards: 20 });
});

test("dungeon reward stars follow the configured move thresholds", () => {
  assert.deepEqual(calculateDungeonReward(16), { stars: 3, shards: 20 });
  assert.deepEqual(calculateDungeonReward(19), { stars: 2, shards: 16 });
  assert.deepEqual(calculateDungeonReward(22), { stars: 1, shards: 12 });
});

test("dungeon rejects duplicate tile selections", () => {
  const board = createDungeonBoard(7);
  assert.throws(
    () => evaluateDungeonMoves(board, [board[0]!.id, board[0]!.id]),
    InvalidDungeonMovesError,
  );
});
