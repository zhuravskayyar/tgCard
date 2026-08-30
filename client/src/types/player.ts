import type { PlayerSummary } from "@cardastika/shared";

export type { PlayerSummary } from "@cardastika/shared";

export type PlayerSummaryState =
  | { status: "loading" }
  | { status: "ready"; data: PlayerSummary }
  | { status: "unauthenticated" }
  | { status: "unavailable" }
  | { status: "error"; message?: string };
