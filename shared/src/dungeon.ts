export type DungeonRunStatus = "active" | "completed" | "failed";

export interface DungeonTile {
  assetKey: string;
  id: string;
  pairId: string;
}

export interface DungeonStartResponse {
  board: DungeonTile[];
  cardShards: number;
  matchedPairs: number;
  maxMoves: number;
  movesUsed: number;
  runId: string;
}

export interface DungeonCompleteRequest {
  moves: string[];
}

export interface DungeonCompleteResponse {
  cardShards: number;
  matchedPairs: number;
  maxMoves: number;
  movesUsed: number;
  runId: string;
  shardsEarned: number;
  stars: number;
  status: Exclude<DungeonRunStatus, "active">;
  success: boolean;
}
