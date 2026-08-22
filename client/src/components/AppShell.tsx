import type { ReactNode } from "react";
import type { PlayerSummaryState } from "../types/player";
import { BottomNav } from "./BottomNav";
import { TopHud } from "./TopHud";

interface AppShellProps {
  children: ReactNode;
  onNavigateHome: () => void;
  onRetryPlayerSummary: () => void;
  playerSummaryState: PlayerSummaryState;
}

export function AppShell({
  children,
  onNavigateHome,
  onRetryPlayerSummary,
  playerSummaryState,
}: AppShellProps) {
  return (
    <div className="app-shell">
      <TopHud onRetry={onRetryPlayerSummary} state={playerSummaryState} />
      <main className="app-content">{children}</main>
      <BottomNav activeItem="home" onSelect={(item) => item === "home" && onNavigateHome()} />
    </div>
  );
}
