import { useLayoutEffect, useRef, type ReactNode } from "react";
import type { PlayerSummaryState } from "../types/player";
import { BottomNav, type BottomNavItem } from "./BottomNav";
import { TopHud } from "./TopHud";

interface AppShellProps {
  activeNavigationItem: BottomNavItem;
  children: ReactNode;
  deckPowerOverride?: number;
  overlay?: ReactNode;
  screenKey?: string;
  onNavigate: (item: BottomNavItem) => void;
  onRetryPlayerSummary: () => void;
  playerSummaryState: PlayerSummaryState;
}

export function AppShell({
  activeNavigationItem,
  children,
  deckPowerOverride,
  overlay,
  screenKey,
  onNavigate,
  onRetryPlayerSummary,
  playerSummaryState,
}: AppShellProps) {
  const contentRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [screenKey]);

  return (
    <div className="app-shell">
      <TopHud deckPowerOverride={deckPowerOverride} onRetry={onRetryPlayerSummary} state={playerSummaryState} />
      <main className="app-content" ref={contentRef}>
        <div className="app-screen-transition" key={screenKey}>
          {children}
        </div>
      </main>
      <BottomNav activeItem={activeNavigationItem} onSelect={onNavigate} />
      {overlay}
    </div>
  );
}
