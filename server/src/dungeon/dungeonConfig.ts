import type { DungeonTile } from "@cardastika/shared";

export const DUNGEON_MAX_MOVES = 22;
export const DUNGEON_PAIR_COUNT = 8;
export const DUNGEON_MISMATCH_DELAY_MS = 700;

export const DUNGEON_REWARDS = Object.freeze({
  baseShards: 12,
  bonusByStars: Object.freeze({ 1: 0, 2: 4, 3: 8 }),
  threeStarMaxMoves: 16,
  twoStarMaxMoves: 19,
});

export const DUNGEON_PAIR_DEFINITIONS = Object.freeze([
  Object.freeze({ assetKey: "rune_fire", pairId: "pair_fire" }),
  Object.freeze({ assetKey: "rune_water", pairId: "pair_water" }),
  Object.freeze({ assetKey: "rune_earth", pairId: "pair_earth" }),
  Object.freeze({ assetKey: "rune_air", pairId: "pair_air" }),
  Object.freeze({ assetKey: "ancient_key", pairId: "pair_key" }),
  Object.freeze({ assetKey: "crystal", pairId: "pair_crystal" }),
  Object.freeze({ assetKey: "card_fragment", pairId: "pair_fragment" }),
  Object.freeze({ assetKey: "dungeon_chest", pairId: "pair_chest" }),
] as const);

export interface StoredDungeonTile extends DungeonTile {}

export interface DungeonEvaluation {
  matchedPairs: number;
  movesUsed: number;
  status: "active" | "completed" | "failed";
}

export class InvalidDungeonMovesError extends Error {
  constructor(message = "Dungeon moves are invalid") {
    super(message);
    this.name = "InvalidDungeonMovesError";
  }
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4_294_967_296;
  };
}

export function createDungeonBoard(seed: number): StoredDungeonTile[] {
  const random = seededRandom(seed);
  const tiles = DUNGEON_PAIR_DEFINITIONS.flatMap((definition, pairIndex) => [
    { id: `tile_${String(pairIndex * 2 + 1).padStart(2, "0")}`, ...definition },
    { id: `tile_${String(pairIndex * 2 + 2).padStart(2, "0")}`, ...definition },
  ]);

  for (let index = tiles.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = tiles[index];
    const swap = tiles[swapIndex];
    if (!current || !swap) throw new Error("Dungeon board shuffle failed");
    tiles[index] = swap;
    tiles[swapIndex] = current;
  }
  return tiles;
}

export function calculateDungeonStars(movesUsed: number) {
  if (movesUsed <= DUNGEON_REWARDS.threeStarMaxMoves) return 3;
  if (movesUsed <= DUNGEON_REWARDS.twoStarMaxMoves) return 2;
  return 1;
}

export function calculateDungeonReward(movesUsed: number) {
  const stars = calculateDungeonStars(movesUsed);
  return {
    shards: DUNGEON_REWARDS.baseShards + DUNGEON_REWARDS.bonusByStars[stars as 1 | 2 | 3],
    stars,
  };
}

export function evaluateDungeonMoves(
  board: readonly StoredDungeonTile[],
  moves: readonly string[],
): DungeonEvaluation {
  if (board.length !== DUNGEON_PAIR_COUNT * 2) {
    throw new InvalidDungeonMovesError("Dungeon board has an invalid size");
  }
  if (moves.length === 0 || moves.length % 2 !== 0 || moves.length / 2 > DUNGEON_MAX_MOVES) {
    throw new InvalidDungeonMovesError("Dungeon moves must contain complete turns");
  }

  const tiles = new Map(board.map((tile) => [tile.id, tile]));
  const matchedTileIds = new Set<string>();
  let matchedPairs = 0;

  for (let index = 0; index < moves.length; index += 2) {
    const firstId = moves[index];
    const secondId = moves[index + 1];
    if (!firstId || !secondId || firstId === secondId) {
      throw new InvalidDungeonMovesError("A tile cannot be selected twice");
    }
    const first = tiles.get(firstId);
    const second = tiles.get(secondId);
    if (!first || !second || matchedTileIds.has(firstId) || matchedTileIds.has(secondId)) {
      throw new InvalidDungeonMovesError("A selected tile does not belong to this run");
    }
    if (first.pairId === second.pairId) {
      matchedTileIds.add(firstId);
      matchedTileIds.add(secondId);
      matchedPairs += 1;
    }
  }

  const movesUsed = moves.length / 2;
  const status = matchedPairs === DUNGEON_PAIR_COUNT
    ? "completed"
    : movesUsed >= DUNGEON_MAX_MOVES
      ? "failed"
      : "active";
  return { matchedPairs, movesUsed, status };
}
