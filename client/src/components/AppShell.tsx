import type { ReactNode } from "react";
import type { PlayerSummaryState } from "../types/player";
import { BottomNav, type BottomNavItem } from "./BottomNav";
import { TopHud } from "./TopHud";

interface AppShellProps {
  activeNavigationItem: BottomNavItem;
  children: ReactNode;
  onNavigate: (item: BottomNavItem) => void;
  onRetryPlayerSummary: () => void;
  playerSummaryState: PlayerSummaryState;
}

export function AppShell({
  activeNavigationItem,
  children,
  onNavigate,
  onRetryPlayerSummary,
  playerSummaryState,
}: AppShellProps) {
  return (
    <div className="app-shell">
      <TopHud onRetry={onRetryPlayerSummary} state={playerSummaryState} />
      <main className="app-content">{children}</main>
      <BottomNav activeItem={activeNavigationItem} onSelect={onNavigate} />
    </div>
  );
}
