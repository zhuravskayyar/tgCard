import type { ReactNode } from "react";
import type { PlayerSummaryState } from "../types/player";
import { BottomNav } from "./BottomNav";
import { TopHud } from "./TopHud";

interface AppShellProps {
  children: ReactNode;
  onRetryPlayerSummary: () => void;
  playerSummaryState: PlayerSummaryState;
}

export function AppShell({ children, onRetryPlayerSummary, playerSummaryState }: AppShellProps) {
  return (
    <div className="app-shell">
      <TopHud onRetry={onRetryPlayerSummary} state={playerSummaryState} />
      <main className="app-content">{children}</main>
      <BottomNav activeItem="home" />
    </div>
  );
}
